import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSketchAcceptRouter } from "../sketch-accept.routes";
import { createSessionRoutes } from "../sessions.routes";
import { SessionService } from "@services/sessions/SessionService";
import type { SessionRecord } from "@services/sessions/types";
import type { AdmissionIdempotencyPort } from "@services/admission/admitPictureTake";
import type { AdmissionReceiptReaderPort } from "@services/admission/unresolvedAcceptances";

/**
 * The sketch accept door's wire contract (issue #134).
 *
 * Two guarantees live at this boundary and nowhere else:
 *  - **The status code tells the truth about the outcome.** 201 is the answer
 *    only when the take actually reached its session; an admitted-but-
 *    unattached take is made-but-not-saved — a 2xx (the body IS the creator's
 *    recovery record), never a 201 (nothing was created in the session).
 *  - **Recovery after refresh finds the unresolved acceptance.** The live
 *    editor keeps nothing (ADR-0017), so the refreshed client asks the session
 *    the take was minted into; the #128 receipts are the index and the session
 *    is the truth of what is still owed. The repair is the record-POST door
 *    the sessions router already owns — the same take, no re-store.
 *
 * Seam: the real routers over the real `SessionService` on an in-memory store
 * double. Firestore, GCS and the idempotency store are the only doubles; the
 * receipt reader is the SAME double as the idempotency port, mirroring the
 * production wiring (one store, read two ways). No internal module is mocked.
 */

const OWNER = "creator-1";
const STRANGER = "someone-else";

/** Real magic bytes: `validateImageBuffer` sniffs, it does not trust labels. */
const JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
const WEBP_BYTES = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x1a, 0x00, 0x00, 0x00]),
  Buffer.from("WEBPVP8 ", "ascii"),
  Buffer.alloc(10),
]);

const toDataUri = (mime: string, bytes: Buffer): string =>
  `data:${mime};base64,${bytes.toString("base64")}`;

const SKETCH_PROMPT = "an ergonomic desk lamp glowing, studio lighting";

function acceptBody(idempotencyKey: string): Record<string, unknown> {
  return {
    liveOutputDataUri: toDataUri("image/webp", WEBP_BYTES),
    sketchSnapshotDataUri: toDataUri("image/jpeg", JPEG_BYTES),
    inputs: {
      prompt: SKETCH_PROMPT,
      strength: 0.875,
      steps: 8,
      seed: 424242,
    },
    idempotencyKey,
  };
}

/** Stands in for Firestore, across every session this suite creates. */
function createSessionStore() {
  const sessions = new Map<string, SessionRecord>();
  return {
    sessions,
    get: vi.fn(async (id: string) => sessions.get(id) ?? null),
    save: vi.fn(async (next: SessionRecord) => {
      sessions.set(next.id, next);
    }),
    createIfAbsent: vi.fn(
      async (
        session: SessionRecord,
      ): Promise<{ created: boolean; session: SessionRecord }> => {
        const existing = sessions.get(session.id);
        if (existing) return { created: false, session: existing };
        sessions.set(session.id, session);
        return { created: true, session };
      },
    ),
    mutate: vi.fn(
      async (
        sessionId: string,
        mutator: (record: SessionRecord) => SessionRecord,
      ): Promise<SessionRecord | null> => {
        const current = sessions.get(sessionId);
        if (!current) return null;
        const next = mutator(current);
        sessions.set(sessionId, next);
        return next;
      },
    ),
    delete: vi.fn(async (sessionId: string) => {
      sessions.delete(sessionId);
    }),
    findByPromptUuid: vi.fn(
      async (userId: string, promptUuid: string) =>
        [...sessions.values()].find(
          (record) =>
            record.userId === userId && record.promptUuid === promptUuid,
        ) ?? null,
    ),
  };
}

function createMediaStore() {
  const calls: Array<{ contentType: string; bytes: string }> = [];
  return {
    calls,
    storeFromBuffer: async (
      buffer: Buffer,
      contentType: string,
    ): Promise<{ id: string; storagePath: string; url: string }> => {
      calls.push({ contentType, bytes: buffer.toString("base64") });
      const id = `asset-${calls.length}`;
      return {
        id,
        storagePath: `image-previews/creator-1/${id}`,
        url: `https://storage.example.com/${id}?sig=live`,
      };
    },
  };
}

type IdempotencyDouble = AdmissionIdempotencyPort &
  AdmissionReceiptReaderPort & { records: Map<string, unknown> };

/**
 * Stands in for the Firestore-backed store, answering BOTH doors the route
 * wires from it: the per-admission claim (the accept path) and the receipt
 * listing (recovery) — one store, read two ways, exactly as registered.
 */
function createIdempotency(): IdempotencyDouble {
  const records = new Map<
    string,
    {
      payloadHash: string;
      status: "pending" | "completed" | "failed";
      snapshot?: { statusCode: number; body: Record<string, unknown> };
    }
  >();
  return {
    records: records as unknown as Map<string, unknown>,
    claimRequest: async ({ userId, route, key, payload }) => {
      const recordId = `${userId}|${route}|${key}`;
      const payloadHash = JSON.stringify(payload);
      const existing = records.get(recordId);
      if (!existing) {
        records.set(recordId, { payloadHash, status: "pending" });
        return { state: "claimed", recordId };
      }
      if (existing.payloadHash !== payloadHash) {
        return { state: "conflict", recordId };
      }
      if (existing.status === "completed" && existing.snapshot) {
        return { state: "replay", recordId, snapshot: existing.snapshot };
      }
      if (existing.status === "pending") {
        return { state: "in_progress", recordId };
      }
      records.set(recordId, { payloadHash, status: "pending" });
      return { state: "claimed", recordId };
    },
    markCompleted: async ({ recordId, snapshot }) => {
      const existing = records.get(recordId);
      if (!existing) return;
      records.set(recordId, { ...existing, status: "completed", snapshot });
    },
    markFailed: async (recordId) => {
      const existing = records.get(recordId);
      if (!existing) return;
      records.set(recordId, { ...existing, status: "failed" });
    },
    listResponseSnapshots: async (userId, route) => {
      const prefix = `${userId}|${route}|`;
      return [...records.entries()]
        .filter(([recordId, record]) => recordId.startsWith(prefix) && record.snapshot)
        .map(([, record]) => record.snapshot!);
    },
  };
}

function createApp(): {
  app: express.Express;
  store: ReturnType<typeof createSessionStore>;
  mediaStore: ReturnType<typeof createMediaStore>;
  idempotency: IdempotencyDouble;
} {
  const store = createSessionStore();
  const mediaStore = createMediaStore();
  const idempotency = createIdempotency();
  const sessionService = new SessionService(store as never);
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction): void => {
    (req as Request & { user?: { uid?: string } }).user = { uid: OWNER };
    next();
  });
  app.use("/api/sessions", createSessionRoutes(sessionService));
  app.use(
    "/api/sketch",
    createSketchAcceptRouter({
      sessionService,
      mediaStore,
      idempotency,
      receipts: idempotency,
    }),
  );
  return { app, store, mediaStore, idempotency };
}

function takesOf(session: SessionRecord): Array<Record<string, unknown>> {
  return (
    (session.prompt?.versions?.[0]?.generations as
      | Array<Record<string, unknown>>
      | undefined) ?? []
  );
}

describe("the sketch accept door (issue #134)", () => {
  let fixture: ReturnType<typeof createApp>;
  beforeEach(() => {
    fixture = createApp();
  });

  it("answers 201 with an attached attachment fact when the take reached its session", async () => {
    const res = await request(fixture.app)
      .post("/api/sketch/accept")
      .send(acceptBody("key-ok"));

    expect(res.status).toBe(201);
    expect(res.body.data.attachment.state).toBe("attached");
    // The response's identity is the take's identity, all the way through.
    expect(res.body.data.attachment.generationId).toBe(res.body.data.generationId);
    expect(res.body.data.attachment.sessionId).toBe(res.body.data.sessionId);
  });

  it("answers 200 — never 201 — with the recovery record when the take was admitted but not attached", async () => {
    const { store, mediaStore } = fixture;
    store.mutate.mockRejectedValueOnce(new Error("firestore unavailable"));

    const res = await request(fixture.app)
      .post("/api/sketch/accept")
      .send(acceptBody("key-failed"));

    // A 2xx — the body is the creator's recovery record and must arrive —
    // but not a 201: nothing was created in the session the take names.
    expect(res.status).toBe(200);
    expect(res.body.data.attachment.state).toBe("failed");
    expect(res.body.data.attachment.reason).toContain("firestore");
    expect(res.body.data.attachment.record.id).toBe(res.body.data.generationId);
    // The media was made and is durable…
    expect(
      mediaStore.calls.filter((call) => call.contentType === "image/webp"),
    ).toHaveLength(1);
    // …but the session does not have the take.
    expect(takesOf(store.sessions.get(res.body.data.sessionId)!)).toHaveLength(
      0,
    );
  });

  it("after a refresh, recovery finds the unresolved acceptance, repairs it as the same take, and then reports nothing owed", async () => {
    const { store, mediaStore } = fixture;
    // The acceptance ran, its session write failed, and the response was
    // lost to a refresh. What survives is server-side.
    store.mutate.mockRejectedValueOnce(new Error("firestore unavailable"));
    const made = await request(fixture.app)
      .post("/api/sketch/accept")
      .send(acceptBody("key-lost"));
    const sessionId: string = made.body.data.sessionId;
    const generationId: string = made.body.data.generationId;
    const pictureStores = () =>
      mediaStore.calls.filter((call) => call.contentType === "image/webp")
        .length;
    expect(pictureStores()).toBe(1);

    // Refresh. The creator opens the session the acceptance minted into and
    // asks it what is still owed.
    const found = await request(fixture.app)
      .get("/api/sketch/accept/unresolved")
      .query({ sessionId });
    expect(found.status).toBe(200);
    expect(found.body.data.attachments).toHaveLength(1);
    const owed = found.body.data.attachments[0];
    expect(owed.state).toBe("failed");
    expect(owed.generationId).toBe(generationId);
    expect(owed.sessionId).toBe(sessionId);
    expect(owed.record.id).toBe(generationId);

    // The repair is the sessions router's record-POST door: the exact record
    // the response carried, under the same take identity.
    const repaired = await request(fixture.app)
      .post(`/api/sessions/${sessionId}/versions/${owed.promptVersionId}/generations`)
      .send({ generation: owed.record });
    expect(repaired.status).toBe(200);

    // The SAME take is now in its session — and the picture was never
    // re-stored: the record names durable handles, so nothing is re-sent.
    const session = store.sessions.get(sessionId)!;
    expect(takesOf(session).map((take) => take.id)).toEqual([generationId]);
    expect(pictureStores()).toBe(1);

    // The session is the truth: the repaired take is no longer reported as
    // owed, even though the stale receipt still says `failed`.
    const after = await request(fixture.app)
      .get("/api/sketch/accept/unresolved")
      .query({ sessionId });
    expect(after.status).toBe(200);
    expect(after.body.data.attachments).toEqual([]);
  });

  it("recovery reports only sketchpad acceptances into the asked-about session", async () => {
    const { idempotency, store } = fixture;
    // One unresolved sketch acceptance into this session.
    store.mutate.mockRejectedValueOnce(new Error("firestore unavailable"));
    const res = await request(fixture.app)
      .post("/api/sketch/accept")
      .send(acceptBody("key-mine"));
    const sessionId: string = res.body.data.sessionId;
    const generationId: string = res.body.data.generationId;

    // Fabricate receipts recovery must NOT answer with: another surface's
    // admission (the studio return), an upload admission, and a sketch
    // acceptance minted into a DIFFERENT session. None of these is the
    // refreshed session's debt, and the sketch route answers for none of
    // them — the studio half is that surface's own recovery concern.
    const fabrication = (
      key: string,
      origin: string,
      bodySessionId: string,
    ): void => {
      idempotency.records.set(`${OWNER}|picture-admission|${key}`, {
        payloadHash: "x",
        status: "completed",
        snapshot: {
          statusCode: 201,
          body: {
            generationId: `gen-${key}`,
            sessionId: bodySessionId,
            promptVersionId: "v1",
            origin,
            attachment: {
              state: "failed",
              generationId: `gen-${key}`,
              sessionId: bodySessionId,
              promptVersionId: "v1",
              reason: "session write failed",
              record: { id: `gen-${key}`, mediaType: "image" },
            },
          },
        },
      });
    };
    fabrication("studio-key", "studio", sessionId);
    fabrication("upload-key", "upload", sessionId);
    fabrication("sketch-elsewhere", "sketchpad", "session-other");
    // A receipt that does not carry the record a retry would re-send is not
    // recoverable work, so it is never offered as such.
    idempotency.records.set(`${OWNER}|picture-admission|recordless-key`, {
      payloadHash: "x",
      status: "completed",
      snapshot: {
        statusCode: 201,
        body: {
          generationId: "gen-recordless",
          sessionId,
          promptVersionId: "v1",
          origin: "sketchpad",
          attachment: {
            state: "failed",
            generationId: "gen-recordless",
            sessionId,
            promptVersionId: "v1",
            reason: "session write failed",
          },
        },
      },
    });

    const found = await request(fixture.app)
      .get("/api/sketch/accept/unresolved")
      .query({ sessionId });
    expect(found.status).toBe(200);
    expect(
      found.body.data.attachments.map(
        (attachment: { generationId: string }) => attachment.generationId,
      ),
    ).toEqual([generationId]);
  });

  it("recovery refuses a session that is not the creator's, and answers nothing for a missing sessionId", async () => {
    const { store } = fixture;
    store.sessions.set("session-theirs", {
      id: "session-theirs",
      userId: STRANGER,
      status: "active",
      createdAt: new Date("2026-09-17T00:00:00.000Z"),
      updatedAt: new Date("2026-09-17T00:00:00.000Z"),
      hasContinuity: false,
    });

    const foreign = await request(fixture.app)
      .get("/api/sketch/accept/unresolved")
      .query({ sessionId: "session-theirs" });
    expect(foreign.status).toBe(404);

    const missing = await request(fixture.app)
      .get("/api/sketch/accept/unresolved");
    expect(missing.status).toBe(400);
  });
});
