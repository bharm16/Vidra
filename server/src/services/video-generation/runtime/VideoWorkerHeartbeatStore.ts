import { admin, getFirestore } from "@infrastructure/firebaseAdmin";
import {
  FirestoreCircuitExecutor,
  getFirestoreCircuitExecutor,
} from "@services/firestore/FirestoreCircuitExecutor";

interface WorkerHeartbeatMetadata {
  hostname?: string;
  processRole?: string;
}

export class VideoWorkerHeartbeatStore {
  private readonly db = getFirestore();
  private readonly collection = this.db.collection("video_worker_heartbeats");
  private readonly firestoreCircuitExecutor: FirestoreCircuitExecutor;

  constructor(
    firestoreCircuitExecutor: FirestoreCircuitExecutor = getFirestoreCircuitExecutor(),
  ) {
    this.firestoreCircuitExecutor = firestoreCircuitExecutor;
  }

  async reportHeartbeat(
    workerId: string,
    metadata?: WorkerHeartbeatMetadata,
  ): Promise<void> {
    const now = Date.now();
    await this.firestoreCircuitExecutor.executeWrite(
      "videoWorkerHeartbeatStore.reportHeartbeat",
      async () =>
        await this.collection.doc(workerId).set(
          {
            workerId,
            status: "active" as const,
            lastHeartbeatAtMs: now,
            ...(metadata?.hostname ? { hostname: metadata.hostname } : {}),
            ...(metadata?.processRole
              ? { processRole: metadata.processRole }
              : {}),
            updatedAtMs: now,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        ),
    );
  }

  async markStopped(workerId: string): Promise<void> {
    const now = Date.now();
    await this.firestoreCircuitExecutor.executeWrite(
      "videoWorkerHeartbeatStore.markStopped",
      async () =>
        await this.collection.doc(workerId).set(
          {
            workerId,
            status: "stopped" as const,
            stoppedAtMs: now,
            updatedAtMs: now,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        ),
    );
  }
}
