import { logger } from "@infrastructure/Logger";

type ProviderCircuitState = "closed" | "open" | "half-open";

interface ProviderCircuitRecord {
  state: ProviderCircuitState;
  outcomes: boolean[];
  cooldownUntilMs: number;
  halfOpenProbeInFlight: boolean;
  /** Timestamp (ms) when the half-open probe was dispatched. Used to detect stuck probes. */
  halfOpenProbeDispatchedAtMs: number;
}

interface ProviderCircuitManagerOptions {
  failureRateThreshold?: number;
  minVolume?: number;
  cooldownMs?: number;
  maxSamples?: number;
  /** Max time (ms) a half-open probe can be in-flight before it's considered stuck. Defaults to 5 minutes. */
  halfOpenProbeTimeoutMs?: number;
  metrics?: {
    recordAlert?: (
      alertName: string,
      metadata?: Record<string, unknown>,
    ) => void;
  };
}

export interface ProviderCircuitSnapshot {
  provider: string;
  state: ProviderCircuitState;
  failureRate: number;
  sampleSize: number;
  cooldownUntilMs: number;
}

const DEFAULT_FAILURE_RATE_THRESHOLD = 0.5;
const DEFAULT_MIN_VOLUME = 10;
const DEFAULT_COOLDOWN_MS = 60_000;
const DEFAULT_MAX_SAMPLES = 50;
const DEFAULT_HALF_OPEN_PROBE_TIMEOUT_MS = 5 * 60_000;

export class ProviderCircuitManager {
  private readonly log = logger.child({ service: "ProviderCircuitManager" });
  private readonly records = new Map<string, ProviderCircuitRecord>();
  private readonly failureRateThreshold: number;
  private readonly minVolume: number;
  private readonly cooldownMs: number;
  private readonly maxSamples: number;
  private readonly halfOpenProbeTimeoutMs: number;
  private readonly metrics: ProviderCircuitManagerOptions["metrics"];
  private readonly recoveryCallbacks = new Set<(provider: string) => void>();

  /** Returns snapshots for all tracked providers. Useful for startup logging and diagnostics. */
  getAllSnapshots(): ProviderCircuitSnapshot[] {
    return Array.from(this.records.keys()).map((provider) =>
      this.getSnapshot(provider),
    );
  }

  constructor(options: ProviderCircuitManagerOptions = {}) {
    this.failureRateThreshold =
      typeof options.failureRateThreshold === "number" &&
      Number.isFinite(options.failureRateThreshold)
        ? Math.min(1, Math.max(0.01, options.failureRateThreshold))
        : DEFAULT_FAILURE_RATE_THRESHOLD;
    this.minVolume =
      typeof options.minVolume === "number" &&
      Number.isFinite(options.minVolume)
        ? Math.max(1, Math.trunc(options.minVolume))
        : DEFAULT_MIN_VOLUME;
    this.cooldownMs =
      typeof options.cooldownMs === "number" &&
      Number.isFinite(options.cooldownMs)
        ? Math.max(1_000, Math.trunc(options.cooldownMs))
        : DEFAULT_COOLDOWN_MS;
    this.maxSamples =
      typeof options.maxSamples === "number" &&
      Number.isFinite(options.maxSamples)
        ? Math.max(5, Math.trunc(options.maxSamples))
        : DEFAULT_MAX_SAMPLES;
    this.halfOpenProbeTimeoutMs =
      typeof options.halfOpenProbeTimeoutMs === "number" &&
      Number.isFinite(options.halfOpenProbeTimeoutMs)
        ? Math.max(10_000, Math.trunc(options.halfOpenProbeTimeoutMs))
        : DEFAULT_HALF_OPEN_PROBE_TIMEOUT_MS;
    this.metrics = options.metrics;
  }

  canDispatch(provider: string): boolean {
    const record = this.getRecord(provider);
    const now = Date.now();

    if (record.state === "open") {
      if (now < record.cooldownUntilMs) {
        return false;
      }
      record.state = "half-open";
      record.halfOpenProbeInFlight = false;
      record.halfOpenProbeDispatchedAtMs = 0;
      this.log.warn("Provider circuit moved to half-open", { provider });
      this.notifyRecovery(provider);
    }

    if (record.state === "half-open") {
      if (
        record.halfOpenProbeInFlight &&
        record.halfOpenProbeDispatchedAtMs > 0 &&
        now - record.halfOpenProbeDispatchedAtMs >= this.halfOpenProbeTimeoutMs
      ) {
        // Probe was dispatched but never completed — likely swept or orphaned.
        // Reset the probe flag so a new probe can be dispatched.
        record.halfOpenProbeInFlight = false;
        record.halfOpenProbeDispatchedAtMs = 0;
        this.log.warn("Half-open probe timed out — allowing new probe", {
          provider,
          probeAge: now - record.halfOpenProbeDispatchedAtMs,
          timeoutMs: this.halfOpenProbeTimeoutMs,
        });
        this.metrics?.recordAlert?.("video_provider_half_open_probe_timeout", {
          provider,
          timeoutMs: this.halfOpenProbeTimeoutMs,
        });
      }
      return !record.halfOpenProbeInFlight;
    }

    return true;
  }

  markDispatched(provider: string): void {
    const record = this.getRecord(provider);
    if (record.state === "half-open") {
      record.halfOpenProbeInFlight = true;
      record.halfOpenProbeDispatchedAtMs = Date.now();
    }
  }

  recordSuccess(provider: string): void {
    const record = this.getRecord(provider);

    if (record.state === "half-open") {
      record.state = "closed";
      record.outcomes = [true];
      record.cooldownUntilMs = 0;
      record.halfOpenProbeInFlight = false;
      record.halfOpenProbeDispatchedAtMs = 0;
      this.log.info(
        "Provider circuit closed after successful half-open probe",
        { provider },
      );
      this.metrics?.recordAlert?.("video_provider_circuit_closed", {
        provider,
      });
      this.notifyRecovery(provider);
      return;
    }

    record.outcomes.push(true);
    this.trimOutcomes(record);
  }

  recordFailure(provider: string): void {
    const record = this.getRecord(provider);

    if (record.state === "half-open") {
      this.openCircuit(provider, record, "half-open probe failed");
      return;
    }

    record.outcomes.push(false);
    this.trimOutcomes(record);

    if (record.outcomes.length < this.minVolume) {
      return;
    }

    const failureRate = this.computeFailureRate(record.outcomes);
    if (failureRate >= this.failureRateThreshold) {
      this.openCircuit(provider, record, "failure threshold exceeded");
    }
  }

  isOpen(provider: string): boolean {
    const record = this.getRecord(provider);
    return record.state === "open" && Date.now() < record.cooldownUntilMs;
  }

  getSnapshot(provider: string): ProviderCircuitSnapshot {
    const record = this.getRecord(provider);
    return {
      provider,
      state: record.state,
      failureRate: this.computeFailureRate(record.outcomes),
      sampleSize: record.outcomes.length,
      cooldownUntilMs: record.cooldownUntilMs,
    };
  }

  /** Register a callback that fires when any provider recovers (transitions to half-open or closed). Returns an unsubscribe function. */
  onRecovery(callback: (provider: string) => void): () => void {
    this.recoveryCallbacks.add(callback);
    return () => {
      this.recoveryCallbacks.delete(callback);
    };
  }

  private notifyRecovery(provider: string): void {
    for (const cb of this.recoveryCallbacks) {
      try {
        cb(provider);
      } catch {
        // Recovery callbacks are best-effort — don't let one failure prevent others
      }
    }
  }

  private openCircuit(
    provider: string,
    record: ProviderCircuitRecord,
    reason: string,
  ): void {
    record.state = "open";
    record.cooldownUntilMs = Date.now() + this.cooldownMs;
    record.halfOpenProbeInFlight = false;
    record.halfOpenProbeDispatchedAtMs = 0;
    this.log.warn("Provider circuit opened", {
      provider,
      reason,
      cooldownMs: this.cooldownMs,
      failureRate: this.computeFailureRate(record.outcomes),
      sampleSize: record.outcomes.length,
    });
    this.metrics?.recordAlert?.("video_provider_circuit_opened", {
      provider,
      reason,
      cooldownMs: this.cooldownMs,
    });
  }

  private getRecord(provider: string): ProviderCircuitRecord {
    const existing = this.records.get(provider);
    if (existing) {
      return existing;
    }
    const created: ProviderCircuitRecord = {
      state: "closed",
      outcomes: [],
      cooldownUntilMs: 0,
      halfOpenProbeInFlight: false,
      halfOpenProbeDispatchedAtMs: 0,
    };
    this.records.set(provider, created);
    return created;
  }

  private trimOutcomes(record: ProviderCircuitRecord): void {
    if (record.outcomes.length <= this.maxSamples) {
      return;
    }
    record.outcomes.splice(0, record.outcomes.length - this.maxSamples);
  }

  private computeFailureRate(outcomes: boolean[]): number {
    if (outcomes.length === 0) {
      return 0;
    }
    let failures = 0;
    for (const outcome of outcomes) {
      if (!outcome) {
        failures += 1;
      }
    }
    return failures / outcomes.length;
  }
}
