import type { CreditRefunder } from "./ports";
import type { RefundFailureStore } from "./RefundFailureStore";
import { PollingWorkerBase } from "@services/polling/PollingWorkerBase";

/** Narrow metrics interface — avoids importing the concrete MetricsService class. */
interface SweeperMetrics {
  recordAlert(name: string, labels: Record<string, unknown>): void;
}

interface CreditRefundSweeperOptions {
  sweepIntervalMs: number;
  maxSweepIntervalMs?: number;
  backoffFactor?: number;
  maxPerRun: number;
  maxAttempts: number;
}

export class CreditRefundSweeper extends PollingWorkerBase {
  private readonly failureStore: RefundFailureStore;
  private readonly userCreditService: CreditRefunder;
  private readonly maxPerRun: number;
  private readonly maxAttempts: number;
  private readonly sweeperMetrics: SweeperMetrics | undefined;
  private running = false;

  constructor(
    failureStore: RefundFailureStore,
    userCreditService: CreditRefunder,
    options: CreditRefundSweeperOptions,
    metricsService?: SweeperMetrics,
  ) {
    super({
      workerId: "CreditRefundSweeper",
      basePollIntervalMs: options.sweepIntervalMs,
      ...(options.maxSweepIntervalMs !== undefined
        ? { maxPollIntervalMs: options.maxSweepIntervalMs }
        : {}),
      ...(options.backoffFactor !== undefined
        ? { backoffFactor: options.backoffFactor }
        : {}),
      ...(metricsService ? { metrics: metricsService } : {}),
    });
    this.failureStore = failureStore;
    this.userCreditService = userCreditService;
    this.maxPerRun = options.maxPerRun;
    this.maxAttempts = options.maxAttempts;
    this.sweeperMetrics = metricsService;
  }

  protected async runOnce(): Promise<boolean> {
    if (this.running) {
      return true;
    }
    this.running = true;

    try {
      let processed = 0;

      while (processed < this.maxPerRun) {
        const next = await this.failureStore.claimNextPending(
          this.maxAttempts,
          this.maxPerRun,
        );
        if (!next) {
          break;
        }

        const ok = await this.userCreditService.refundCredits(
          next.userId,
          next.amount,
          {
            refundKey: next.refundKey,
            ...(next.reason ? { reason: next.reason } : {}),
          },
        );

        if (ok) {
          await this.failureStore.markResolved(next.refundKey);
          this.log.info("Recovered queued credit refund", {
            refundKey: next.refundKey,
            userId: next.userId,
            amount: next.amount,
            attempts: next.attempts + 1,
          });
        } else {
          const nextAttempts = next.attempts + 1;
          const errorMessage = "Background refund retry failed";

          if (nextAttempts >= this.maxAttempts) {
            await this.failureStore.markEscalated(next.refundKey, errorMessage);
            this.log.error(
              "Credit refund escalated after max attempts",
              undefined,
              {
                refundKey: next.refundKey,
                userId: next.userId,
                amount: next.amount,
                attempts: nextAttempts,
                severity: "critical",
              },
            );
            this.sweeperMetrics?.recordAlert("credit_refund_escalated", {
              refundKey: next.refundKey,
              userId: next.userId,
              amount: next.amount,
              attempts: nextAttempts,
            });
          } else {
            await this.failureStore.releaseForRetry(
              next.refundKey,
              errorMessage,
            );
          }
        }

        processed += 1;
      }
      this.markRunSuccess();
      return true;
    } catch (error) {
      this.markRunFailure();
      this.log.error("Credit refund sweeper run failed", error as Error);
      return false;
    } finally {
      this.running = false;
    }
  }
}

interface RefundSweeperConfig {
  disabled: boolean;
  intervalSeconds: number;
  maxPerRun: number;
  maxAttempts: number;
}

export function createCreditRefundSweeper(
  failureStore: RefundFailureStore,
  userCreditService: CreditRefunder,
  metricsService: SweeperMetrics | undefined,
  config: RefundSweeperConfig,
): CreditRefundSweeper | null {
  if (config.disabled) {
    return null;
  }

  const sweepIntervalMs = config.intervalSeconds * 1000;
  if (
    sweepIntervalMs <= 0 ||
    config.maxPerRun <= 0 ||
    config.maxAttempts <= 0
  ) {
    return null;
  }

  return new CreditRefundSweeper(
    failureStore,
    userCreditService,
    {
      sweepIntervalMs,
      maxSweepIntervalMs: sweepIntervalMs * 8,
      backoffFactor: 2,
      maxPerRun: config.maxPerRun,
      maxAttempts: config.maxAttempts,
    },
    metricsService,
  );
}
