import { sha256Hex } from "@utils/hash";
import { logger } from "@infrastructure/Logger";
import { sleep } from "@utils/sleep";
import type { CreditRefunder } from "./ports";
import type { RefundFailureStore } from "./RefundFailureStore";
import { getRefundFailureStore } from "./RefundFailureStore";

export interface RefundGuardParams {
  userCreditService: CreditRefunder;
  userId: string;
  amount: number;
  refundKey: string;
  reason?: string;
  requestRetries?: number;
  baseDelayMs?: number;
  metadata?: Record<string, unknown>;
  refundFailureStore?: RefundFailureStore;
}

const DEFAULT_REQUEST_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 75;

export function buildRefundKey(
  parts: Array<string | number | null | undefined>,
): string {
  const raw = parts
    .filter((part) => part !== null && part !== undefined)
    .map((part) => String(part))
    .join("|");
  return sha256Hex(raw);
}

export async function refundWithGuard(
  params: RefundGuardParams,
): Promise<boolean> {
  const {
    userCreditService,
    userId,
    amount,
    refundKey,
    reason,
    requestRetries = DEFAULT_REQUEST_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    metadata,
    refundFailureStore = getRefundFailureStore(),
  } = params;

  if (amount <= 0) {
    return true;
  }

  const attempts = Math.max(1, requestRetries);
  const refundOptions =
    reason === undefined ? { refundKey } : { refundKey, reason };

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const ok = await userCreditService.refundCredits(
      userId,
      amount,
      refundOptions,
    );
    if (ok) {
      return true;
    }

    if (attempt < attempts) {
      const delay = Math.max(10, Math.round(baseDelayMs * 2 ** (attempt - 1)));
      await sleep(delay);
    }
  }

  const lastError = `Refund failed after ${attempts} attempts`;
  try {
    await refundFailureStore.upsertFailure({
      refundKey,
      userId,
      amount,
      ...(reason ? { reason } : {}),
      lastError,
      ...(metadata ? { metadata } : {}),
    });
  } catch (enqueueError) {
    logger.error(
      "Failed to enqueue credit refund failure",
      enqueueError as Error,
      {
        refundKey,
        userId,
        amount,
        attempts,
        reason,
        ...(metadata ? { metadata } : {}),
        severity: "critical",
      },
    );
    return false;
  }

  logger.error(
    "Credit refund retries exhausted; enqueued for background recovery",
    undefined,
    {
      refundKey,
      userId,
      amount,
      attempts,
      reason,
      ...(metadata ? { metadata } : {}),
      severity: "critical",
    },
  );
  return false;
}
