import type { DIContainer } from "@infrastructure/DIContainer";
import { RequestIdempotencyService } from "@services/admission/idempotency/RequestIdempotencyService";
import type { FirestoreCircuitExecutor } from "@services/firestore/FirestoreCircuitExecutor";
import type { ServiceConfig } from "./service-config.types";

export function registerAdmissionServices(container: DIContainer): void {
  container.register(
    "requestIdempotencyService",
    (
      firestoreCircuitExecutor: FirestoreCircuitExecutor,
      config: ServiceConfig,
    ) =>
      new RequestIdempotencyService(firestoreCircuitExecutor, {
        pendingLockTtlMs: config.idempotency.pendingLockTtlMs,
        replayTtlMs: config.idempotency.replayTtlMs,
      }),
    ["firestoreCircuitExecutor", "config"],
  );
}
