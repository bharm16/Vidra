import { getFirestore } from "@infrastructure/firebaseAdmin";
import type { ShareRecord, ShareRecordStore } from "./types";

/**
 * Firestore-backed store for minted public shares (collection `shares`).
 * Keyed by the opaque shareId; holds only the denormalized clip snapshot.
 */
export class ShareStore implements ShareRecordStore {
  private readonly db = getFirestore();
  private readonly collection = this.db.collection("shares");

  async save(record: ShareRecord): Promise<void> {
    await this.collection.doc(record.shareId).set({
      storagePath: record.storagePath,
      description: record.description,
      model: record.model,
      createdAt: record.createdAt,
    });
  }

  async get(shareId: string): Promise<ShareRecord | null> {
    const snapshot = await this.collection.doc(shareId).get();
    if (!snapshot.exists) return null;
    const data = snapshot.data();
    if (!data) return null;
    return {
      shareId,
      storagePath: typeof data.storagePath === "string" ? data.storagePath : "",
      description: typeof data.description === "string" ? data.description : "",
      model: typeof data.model === "string" ? data.model : null,
      createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
    };
  }
}
