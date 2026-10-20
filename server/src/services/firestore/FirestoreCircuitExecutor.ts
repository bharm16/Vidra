import { logger } from "@infrastructure/Logger";
import { RetryPolicy } from "@utils/RetryPolicy";
import { isTransientFirestoreError } from "@utils/transientErrors";

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 120;
const DEFAULT_RETRY_JITTER_MS = 80;

type FirestoreOperationKind = "read" | "write";

interface FirestoreCircuitExecutorOptions {
  maxRetries?: number;
  retryBaseDelayMs?: number;
  retryJitterMs?: number;
}

interface ExecuteOptions {
  retries?: number;
  kind?: FirestoreOperationKind;
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}

/** Runs Firestore operations, retrying transient failures with backoff. */
export class FirestoreCircuitExecutor {
  private readonly log = logger.child({ service: "FirestoreCircuitExecutor" });
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly retryJitterMs: number;

  constructor(options: FirestoreCircuitExecutorOptions = {}) {
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryBaseDelayMs =
      options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
    this.retryJitterMs = options.retryJitterMs ?? DEFAULT_RETRY_JITTER_MS;
  }

  async executeRead<T>(
    operationName: string,
    operation: () => Promise<T>,
    options?: ExecuteOptions,
  ): Promise<T> {
    return await this.execute(operationName, operation, {
      ...options,
      kind: "read",
    });
  }

  async executeWrite<T>(
    operationName: string,
    operation: () => Promise<T>,
    options?: ExecuteOptions,
  ): Promise<T> {
    return await this.execute(operationName, operation, {
      ...options,
      kind: "write",
    });
  }

  async execute<T>(
    operationName: string,
    operation: () => Promise<T>,
    options: ExecuteOptions = {},
  ): Promise<T> {
    const retries =
      typeof options.retries === "number" &&
      Number.isFinite(options.retries) &&
      options.retries >= 0
        ? Math.trunc(options.retries)
        : this.maxRetries;
    const operationKind = options.kind ?? "read";

    try {
      return await RetryPolicy.execute(operation, {
        maxRetries: retries,
        shouldRetry: (error) => isTransientFirestoreError(error),
        getDelayMs: RetryPolicy.exponentialBackoff({
          baseDelayMs: this.retryBaseDelayMs,
          jitterMs: this.retryJitterMs,
        }),
        onRetry: (error, attempt) => {
          this.log.warn("Retrying Firestore operation after transient failure", {
            operation: operationName,
            kind: operationKind,
            attempt,
            maxAttempts: retries + 1,
            error: error.message,
          });
        },
        logRetries: false, // We handle logging in onRetry above
      });
    } catch (error) {
      const err = toError(error);
      this.log.warn("Firestore operation failed", {
        operation: operationName,
        kind: operationKind,
        error: err.message,
      });
      throw err;
    }
  }
}

let firestoreCircuitExecutorSingleton: FirestoreCircuitExecutor | null = null;

export function getFirestoreCircuitExecutor(): FirestoreCircuitExecutor {
  if (!firestoreCircuitExecutorSingleton) {
    firestoreCircuitExecutorSingleton = new FirestoreCircuitExecutor();
  }

  return firestoreCircuitExecutorSingleton;
}

export function setFirestoreCircuitExecutor(
  executor: FirestoreCircuitExecutor,
): void {
  firestoreCircuitExecutorSingleton = executor;
}
