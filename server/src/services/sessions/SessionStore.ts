import { admin, getFirestore } from "@infrastructure/firebaseAdmin";
import type { SessionRecord } from "./types";
import type { SessionStatus } from "@shared/types/session";
import {
  deserializeContinuitySession,
  serializeContinuitySession,
  type StoredContinuitySession,
} from "@server/domain/continuity/serialization";

interface StoredSession {
  userId: string;
  name?: string;
  description?: string;
  status: SessionStatus;
  prompt?: Record<string, unknown>;
  continuity?: StoredContinuitySession;
  promptUuid?: string | null;
  hasContinuity?: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

export class SessionStore {
  private readonly db = getFirestore();
  private readonly collection = this.db.collection("sessions");

  getDocRef(sessionId: string): FirebaseFirestore.DocumentReference {
    return this.collection.doc(sessionId);
  }

  async save(session: SessionRecord): Promise<void> {
    const docRef = this.collection.doc(session.id);
    const payload = this.toStored(session);

    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(docRef);
      if (snapshot.exists) {
        transaction.set(
          docRef,
          {
            ...payload,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        return;
      }

      transaction.set(docRef, {
        ...payload,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  }

  /**
   * Read-modify-write inside one transaction — ADR-0022 decision 6.
   *
   * `save` above cannot express a concurrent append. Its payload is built by
   * the caller BEFORE the transaction opens, so the transaction's `get` only
   * chooses create-vs-merge; and because a merge replaces `prompt` wholesale,
   * a writer that read the session a moment ago writes back a `versions` array
   * that never saw whatever landed in between. Two appends race and the later
   * write erases the earlier take.
   *
   * Here the mutator runs against the transaction's OWN snapshot, so Firestore's
   * contention retry re-runs it against fresh data and both writers survive. The
   * mutator must therefore be pure and re-runnable: no I/O, no side effects.
   * Returns null when the session does not exist.
   */
  async mutate(
    sessionId: string,
    mutator: (current: SessionRecord) => SessionRecord,
  ): Promise<SessionRecord | null> {
    const docRef = this.collection.doc(sessionId);

    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(docRef);
      if (!snapshot.exists) {
        return null;
      }

      const next = mutator(
        this.fromStored(sessionId, snapshot.data() as StoredSession),
      );

      transaction.set(
        docRef,
        {
          ...this.toStored(next),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      return next;
    });
  }

  saveInTransaction(
    transaction: FirebaseFirestore.Transaction,
    session: SessionRecord,
  ): void {
    const docRef = this.collection.doc(session.id);
    const payload = this.toStored(session);
    transaction.set(
      docRef,
      {
        ...payload,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  async get(sessionId: string): Promise<SessionRecord | null> {
    const snapshot = await this.collection.doc(sessionId).get();
    if (!snapshot.exists) return null;
    return this.fromStored(sessionId, snapshot.data() as StoredSession);
  }

  async findByUser(
    userId: string,
    limitCount: number = 50,
  ): Promise<SessionRecord[]> {
    const snapshot = await this.collection
      .where("userId", "==", userId)
      .orderBy("updatedAtMs", "desc")
      .limit(limitCount)
      .get();
    if (snapshot.empty) return [];
    return snapshot.docs.map((doc) =>
      this.fromStored(doc.id, doc.data() as StoredSession),
    );
  }

  async findContinuityByUser(
    userId: string,
    limitCount: number = 50,
  ): Promise<SessionRecord[]> {
    const snapshot = await this.collection
      .where("userId", "==", userId)
      .where("hasContinuity", "==", true)
      .orderBy("updatedAtMs", "desc")
      .limit(limitCount)
      .get();
    if (snapshot.empty) return [];
    return snapshot.docs.map((doc) =>
      this.fromStored(doc.id, doc.data() as StoredSession),
    );
  }

  async findByPromptUuid(
    userId: string,
    promptUuid: string,
  ): Promise<SessionRecord | null> {
    const snapshot = await this.collection
      .where("userId", "==", userId)
      .where("promptUuid", "==", promptUuid)
      .limit(1)
      .get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    if (!doc) return null;
    return this.fromStored(doc.id, doc.data() as StoredSession);
  }

  async delete(sessionId: string): Promise<void> {
    await this.collection.doc(sessionId).delete();
  }

  private toStored(session: SessionRecord): StoredSession {
    const hasContinuity = Boolean(session.continuity);
    return {
      userId: session.userId,
      ...(session.name ? { name: session.name } : {}),
      ...(session.description ? { description: session.description } : {}),
      status: session.status,
      ...(session.prompt
        ? { prompt: session.prompt as unknown as Record<string, unknown> }
        : {}),
      ...(session.continuity
        ? { continuity: serializeContinuitySession(session.continuity) }
        : {}),
      ...(session.promptUuid ? { promptUuid: session.promptUuid } : {}),
      hasContinuity,
      createdAtMs: session.createdAt.getTime(),
      updatedAtMs: session.updatedAt.getTime(),
    };
  }

  private fromStored(sessionId: string, stored: StoredSession): SessionRecord {
    return {
      id: sessionId,
      userId: stored.userId,
      ...(stored.name ? { name: stored.name } : {}),
      ...(stored.description ? { description: stored.description } : {}),
      status: stored.status,
      ...(stored.prompt
        ? {
            prompt: stored.prompt as unknown as NonNullable<
              SessionRecord["prompt"]
            >,
          }
        : {}),
      ...(stored.continuity
        ? {
            continuity: deserializeContinuitySession(
              sessionId,
              stored.continuity,
            ),
          }
        : {}),
      ...(stored.promptUuid ? { promptUuid: stored.promptUuid } : {}),
      hasContinuity: Boolean(stored.hasContinuity),
      createdAt: new Date(stored.createdAtMs),
      updatedAt: new Date(stored.updatedAtMs),
    };
  }
}
