import { logger } from '@infrastructure/Logger';

type LlmProviderCircuitState = 'closed' | 'open' | 'half-open';

interface LlmProviderCircuitRecord {
  state: LlmProviderCircuitState;
  consecutiveFailures: number;
  cooldownUntilMs: number;
  halfOpenProbeInFlight: boolean;
}

interface LlmProviderCircuitManagerOptions {
  /** Consecutive health-relevant failures before the circuit opens. */
  consecutiveFailureThreshold?: number;
  /** How long an open circuit rejects dispatch before half-opening. */
  cooldownMs?: number;
  /** Clock override for tests. Defaults to Date.now. */
  now?: () => number;
  metrics?: {
    recordAlert?: (
      alertName: string,
      metadata?: Record<string, unknown>
    ) => void;
  };
}

export interface LlmProviderCircuitSnapshot {
  provider: string;
  state: LlmProviderCircuitState;
  consecutiveFailures: number;
  cooldownUntilMs: number;
}

const DEFAULT_CONSECUTIVE_FAILURE_THRESHOLD = 5;
const DEFAULT_COOLDOWN_MS = 30_000;

/**
 * Per-provider circuit breaker for the aiService routing layer, modeled on
 * the video ProviderCircuitManager (closed → open → half-open lifecycle).
 *
 * Differences from the video manager, driven by workload shape:
 * - Consecutive-failure threshold instead of a failure-rate window — LLM
 *   calls sit on a synchronous user path, so reacting after N straight
 *   failures beats waiting for a minimum sample volume.
 * - No half-open probe timeout: LLM calls always settle, so callers settle
 *   the probe explicitly via recordSuccess / recordFailure /
 *   releaseHalfOpenProbe instead.
 */
export class LlmProviderCircuitManager {
  private readonly log = logger.child({ service: 'LlmProviderCircuitManager' });
  private readonly records = new Map<string, LlmProviderCircuitRecord>();
  private readonly consecutiveFailureThreshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private readonly metrics: LlmProviderCircuitManagerOptions['metrics'];

  constructor(options: LlmProviderCircuitManagerOptions = {}) {
    this.consecutiveFailureThreshold =
      typeof options.consecutiveFailureThreshold === 'number' &&
      Number.isFinite(options.consecutiveFailureThreshold)
        ? Math.max(1, Math.trunc(options.consecutiveFailureThreshold))
        : DEFAULT_CONSECUTIVE_FAILURE_THRESHOLD;
    this.cooldownMs =
      typeof options.cooldownMs === 'number' &&
      Number.isFinite(options.cooldownMs)
        ? Math.max(1_000, Math.trunc(options.cooldownMs))
        : DEFAULT_COOLDOWN_MS;
    this.now = options.now ?? Date.now;
    this.metrics = options.metrics;
  }

  canDispatch(provider: string): boolean {
    const record = this.getRecord(provider);

    if (record.state === 'open') {
      if (this.now() < record.cooldownUntilMs) {
        return false;
      }
      record.state = 'half-open';
      record.halfOpenProbeInFlight = false;
      this.log.warn('LLM provider circuit moved to half-open', { provider });
    }

    if (record.state === 'half-open') {
      return !record.halfOpenProbeInFlight;
    }

    return true;
  }

  markDispatched(provider: string): void {
    const record = this.getRecord(provider);
    if (record.state === 'half-open') {
      record.halfOpenProbeInFlight = true;
    }
  }

  recordSuccess(provider: string): void {
    const record = this.getRecord(provider);

    if (record.state !== 'closed') {
      this.log.info('LLM provider circuit closed after successful call', {
        provider,
        previousState: record.state,
      });
      this.metrics?.recordAlert?.('llm_provider_circuit_closed', { provider });
    }

    record.state = 'closed';
    record.consecutiveFailures = 0;
    record.cooldownUntilMs = 0;
    record.halfOpenProbeInFlight = false;
  }

  recordFailure(provider: string): void {
    const record = this.getRecord(provider);

    if (record.state === 'half-open') {
      this.openCircuit(provider, record, 'half-open probe failed');
      return;
    }

    if (record.state === 'open') {
      return;
    }

    record.consecutiveFailures += 1;
    if (record.consecutiveFailures >= this.consecutiveFailureThreshold) {
      this.openCircuit(provider, record, 'consecutive failure threshold');
    }
  }

  /**
   * Settle a half-open probe whose outcome says nothing about provider
   * health (client abort, 4xx input error). Leaves the circuit half-open so
   * the next call can probe again.
   */
  releaseHalfOpenProbe(provider: string): void {
    const record = this.getRecord(provider);
    if (record.state === 'half-open') {
      record.halfOpenProbeInFlight = false;
    }
  }

  isOpen(provider: string): boolean {
    const record = this.getRecord(provider);
    return record.state === 'open' && this.now() < record.cooldownUntilMs;
  }

  getSnapshot(provider: string): LlmProviderCircuitSnapshot {
    const record = this.getRecord(provider);
    return {
      provider,
      state: record.state,
      consecutiveFailures: record.consecutiveFailures,
      cooldownUntilMs: record.cooldownUntilMs,
    };
  }

  getAllSnapshots(): LlmProviderCircuitSnapshot[] {
    return Array.from(this.records.keys()).map((provider) =>
      this.getSnapshot(provider)
    );
  }

  private openCircuit(
    provider: string,
    record: LlmProviderCircuitRecord,
    reason: string
  ): void {
    record.state = 'open';
    record.cooldownUntilMs = this.now() + this.cooldownMs;
    record.halfOpenProbeInFlight = false;
    this.log.warn('LLM provider circuit opened', {
      provider,
      reason,
      cooldownMs: this.cooldownMs,
      consecutiveFailures: record.consecutiveFailures,
    });
    this.metrics?.recordAlert?.('llm_provider_circuit_opened', {
      provider,
      reason,
      cooldownMs: this.cooldownMs,
    });
  }

  private getRecord(provider: string): LlmProviderCircuitRecord {
    const existing = this.records.get(provider);
    if (existing) {
      return existing;
    }
    const created: LlmProviderCircuitRecord = {
      state: 'closed',
      consecutiveFailures: 0,
      cooldownUntilMs: 0,
      halfOpenProbeInFlight: false,
    };
    this.records.set(provider, created);
    return created;
  }
}
