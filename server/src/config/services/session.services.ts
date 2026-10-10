import type { DIContainer } from "@infrastructure/DIContainer";
import { SessionService } from "@services/sessions/SessionService";
import { SessionStore } from "@services/sessions/SessionStore";
import { FirestoreOwedTakeAttachmentStore } from "@services/sessions/OwedTakeAttachmentStore";
import type { VideoJobStore } from "@services/video-generation/runtime/VideoJobStore";
import type { FirestoreCircuitExecutor } from "@services/firestore/FirestoreCircuitExecutor";

/**
 * Registers session, asset, and reference-image repositories.
 *
 * Stripe / billing registrations were split into `payment.services.ts` so
 * the file name reflects what's inside.
 */
export function registerSessionServices(container: DIContainer): void {
  container.register("sessionStore", () => new SessionStore(), []);

  container.register(
    "sessionService",
    (sessionStore: SessionStore, videoJobStore: VideoJobStore) =>
      new SessionService(sessionStore, {
        cancelJobsForSession: (sessionId) =>
          videoJobStore.cancelJobsForSession(sessionId),
      }),
    ["sessionStore", "videoJobStore"],
  );

  // ADR-0022 decision 6 (issue #133): the durable ledger of quick-picture takes
  // whose session write is still owed. A generated take has no idempotency
  // snapshot to resume from, so its made-but-not-saved debt lives here until a
  // reloaded client discovers and repairs it.
  container.register(
    "owedTakeAttachmentStore",
    (firestoreCircuitExecutor: FirestoreCircuitExecutor) =>
      new FirestoreOwedTakeAttachmentStore(firestoreCircuitExecutor),
    ["firestoreCircuitExecutor"],
  );
}
