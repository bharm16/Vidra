import { getFirestore } from "@infrastructure/firebaseAdmin";
import { DeadLetterStore } from "@services/video-generation/runtime/DeadLetterStore";
import type { DIContainer } from "@infrastructure/DIContainer";
import { VideoJobStore } from "@services/video-generation/runtime/VideoJobStore";
import type { FirestoreCircuitExecutor } from "@services/firestore/FirestoreCircuitExecutor";
import type { ServiceConfig } from "./service-config.types.ts";

export function registerVideoJobServices(container: DIContainer): void {
  container.register(
    "videoJobStore",
    (
      firestoreCircuitExecutor: FirestoreCircuitExecutor,
      config: ServiceConfig,
    ) =>
      new VideoJobStore(getFirestore(), new DeadLetterStore(getFirestore(), firestoreCircuitExecutor), firestoreCircuitExecutor, config.videoJobs.maxAttempts),
    ["firestoreCircuitExecutor", "config"],
  );
}
