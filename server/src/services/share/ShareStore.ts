import { getFirestore } from "@infrastructure/firebaseAdmin";
import { ShareRecordSchema, type ShareRecord, type ShareRecordStore } from "./types";

/**
 * Firestore-backed store for minted public shares (collection `shares`).
 * Keyed by the opaque shareId; holds only the denormalized clip snapshot.
 */
export class ShareStore implements ShareRecordStore {
  private readonly db = getFirestore();
  private readonly collection = this.db.collection("shares");

  async save(record: ShareRecord): Promise<void> {
    const verified = ShareRecordSchema.parse(record);
    await this.collection.doc(verified.shareId).create(verified);
  }

  async get(shareId: string): Promise<ShareRecord | null> {
    if (!ShareRecordSchema.shape.shareId.safeParse(shareId).success) return null;
    const snapshot = await this.collection.doc(shareId).get();
    if (!snapshot.exists) return null;
    const data = snapshot.data();
    if (!data) return null;
    // Old rows have no issuer/resource proof. Owners must explicitly re-share.
    const parsed = ShareRecordSchema.safeParse(data);
    return parsed.success && parsed.data.shareId === shareId ? parsed.data : null;
  }
}
