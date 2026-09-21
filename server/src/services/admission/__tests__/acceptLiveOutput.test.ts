import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptLiveOutput,
  type AcceptLiveOutputDependencies,
  type AcceptLiveOutputRequest,
  type AcceptLiveOutputSessionPort,
} from "../acceptLiveOutput";
import type { AdmissionIdempotencyPort } from "../admitPictureTake";
import { SessionService } from "@services/sessions/SessionService";
import type { SessionRecord } from "@services/sessions/types";
import type { SketchAcceptRequest } from "@shared/schemas/sketch.schemas";

/**
 * "Use this" — ADR-0022 decision 5, issue #87.
 *
 * What is pinned here is the ONE thing this bridge adds over the admission
 * boundary it reuses: a session born around the accepted picture, and an
 * ordering in which a failure leaves nothing half-created. The take's own
 * contract (identity under retry, durable media, owned destination) is
 * `admitPictureTake`'s and is pinned there.
 *
 * Seam: the real `SessionService` over an in-memory store double, the real
 * `admitPictureTake`. Firestore, GCS and the idempotency store are the
 * process-external boundaries and are the only doubles. No `vi.mock` of an
 * internal module.
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
const RELAY_MODEL = "fal-ai/z-image/turbo/image-to-image";

function acceptRequest(
  overrides: Partial<SketchAcceptRequest> = {},
): SketchAcceptRequest {
  return {
    liveOutputDataUri: toDataUri("image/webp", WEBP_BYTES),
    sketchSnapshotDataUri: toDataUri("image/jpeg", JPEG_BYTES),
    inputs: {
      prompt: SKETCH_PROMPT,
      strength: 0.875,
      steps: 8,
      seed: 424242,
    },
    idempotencyKey: "accept-key-1",
    ...overrides,
  };
}

function request(
  overrides: Partial<AcceptLiveOutputRequest> = {},
): AcceptLiveOutputRequest {
  return {
    userId: OWNER,
    model: RELAY_MODEL,
    accepted: acceptRequest(),
    ...overrides,
  };
}

/** Stands in for Firestore, across every session this suite creates. */
function createSessionStore() {
  const sessions = new Map<string, SessionRecord>();
  // A hook the concurrency test installs to park both presses at the create
  // step; unset, `createIfAbsent` is a plain atomic upsert.
  let createIfAbsentGate: (() => Promise<void>) | undefined;
  return {
    sessions,
    setCreateIfAbsentGate: (gate: (() => Promise<void>) | undefined) => {
      createIfAbsentGate = gate;
    },
    get: vi.fn(async (id: string) => sessions.get(id) ?? null),
    save: vi.fn(async (next: SessionRecord) => {
      sessions.set(next.id, next);
    }),
    // Firestore's transactional create-if-absent on the doc id, modelled as an
    // atomic compare-and-set: the existence check and the write share one
    // synchronous section, so two presses racing the SAME deterministic id — as
    // the barrier test forces — yield one create and one read, never two rows.
    createIfAbsent: vi.fn(
      async (
        session: SessionRecord,
      ): Promise<{ created: boolean; session: SessionRecord }> => {
        if (createIfAbsentGate) await createIfAbsentGate();
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
    // Firestore queries the top-level `promptUuid` field, not the nested
    // prompt — the double matches, so the lookup this bridge leans on for
    // "one session per acceptance" is exercised the way it actually runs.
    findByPromptUuid: vi.fn(
      async (userId: string, promptUuid: string) =>
        [...sessions.values()].find(
          (record) =>
            record.userId === userId && record.promptUuid === promptUuid,
        ) ?? null,
    ),
  };
}

interface MediaStoreDouble {
  storeFromBuffer: (
    buffer: Buffer,
    contentType: string,
    userId: string,
  ) => Promise<{ id: string; storagePath: string; url: string }>;
  calls: Array<{ contentType: string; userId: string; bytes: string }>;
  /** Everything the creator's storage holds, keyed by asset id. */
  contents: Map<string, { bytes: string; contentType: string }>;
  failFrom: (callIndex: number) => void;
}

/** Stands in for GCS. Keeps the bytes so "still readable" is assertable. */
function createMediaStore(): MediaStoreDouble {
  const calls: MediaStoreDouble["calls"] = [];
  const contents = new Map<string, { bytes: string; contentType: string }>();
  let failAt = Number.POSITIVE_INFINITY;
  return {
    calls,
    contents,
    failFrom: (callIndex: number) => {
      failAt = callIndex;
    },
    storeFromBuffer: async (buffer, contentType, userId) => {
      if (calls.length >= failAt) {
        throw new Error("asset store unavailable");
      }
      const bytes = buffer.toString("base64");
      calls.push({ contentType, userId, bytes });
      const id = `asset-${calls.length}`;
      contents.set(id, { bytes, contentType });
      return {
        id,
        storagePath: `image-previews/${userId}/${id}`,
        url: `https://storage.example.com/${id}?sig=live`,
      };
    },
  };
}

type IdempotencyDouble = AdmissionIdempotencyPort & {
  /** Make `markCompleted` throw from its Nth call on (0-based). Call 0 is the
   * pre-append `pending` snapshot; call 1 is the completion rewrite AFTER the
   * take has attached — the window issue #130's safety criterion turns on. */
  failMarkCompletedFrom: (callIndex: number) => void;
};

/** Stands in for the Firestore-backed `RequestIdempotencyService`. */
function createIdempotency(): IdempotencyDouble {
  const records = new Map<
    string,
    {
      payloadHash: string;
      status: "pending" | "completed" | "failed";
      snapshot?: { statusCode: number; body: Record<string, unknown> };
    }
  >();
  let markCompletedCalls = 0;
  let failMarkCompletedFrom = Number.POSITIVE_INFINITY;
  return {
    failMarkCompletedFrom: (callIndex: number) => {
      failMarkCompletedFrom = callIndex;
    },
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
      if (markCompletedCalls++ >= failMarkCompletedFrom) {
        throw new Error("idempotency completion write failed");
      }
      const existing = records.get(recordId);
      if (!existing) return;
      records.set(recordId, { ...existing, status: "completed", snapshot });
    },
    markFailed: async (recordId) => {
      const existing = records.get(recordId);
      if (!existing) return;
      records.set(recordId, { ...existing, status: "failed" });
    },
  };
}

function setup(): {
  store: ReturnType<typeof createSessionStore>;
  mediaStore: MediaStoreDouble;
  idempotency: IdempotencyDouble;
  deps: AcceptLiveOutputDependencies;
} {
  const store = createSessionStore();
  const mediaStore = createMediaStore();
  const idempotency = createIdempotency();
  return {
    store,
    mediaStore,
    idempotency,
    deps: {
      sessionService: new SessionService(store as never),
      mediaStore,
      idempotency,
    },
  };
}

/**
 * A latch that releases every waiter once `parties` of them have arrived — the
 * barrier the concurrency test uses to hold both presses at the create step
 * until both are there, so the create is exercised under true contention.
 */
function createBarrier(parties: number): { wait: () => Promise<void> } {
  let arrived = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    wait: async () => {
      arrived += 1;
      if (arrived >= parties) release();
      await gate;
    },
  };
}

function onlySession(store: ReturnType<typeof createSessionStore>) {
  const records = [...store.sessions.values()];
  expect(records).toHaveLength(1);
  return records[0]!;
}

function takesOf(session: SessionRecord, versionId: string) {
  const version = session.prompt?.versions?.find(
    (entry) => entry.versionId === versionId,
  );
  return version?.generations ?? [];
}

describe("acceptLiveOutput (ADR-0022 decision 5, issue #87)", () => {
  let fixture: ReturnType<typeof setup>;

  beforeEach(() => {
    fixture = setup();
  });

  it("persists the accepted picture AND the sketch snapshot under the creator's storage, both still readable once the live editor is gone", async () => {
    const { deps, mediaStore, store } = fixture;

    const result = await acceptLiveOutput(deps, request());
    expect(result.state).toBe("accepted");
    if (result.state !== "accepted") return;

    // Two distinct objects, both the creator's.
    expect(mediaStore.calls).toHaveLength(2);
    expect(mediaStore.calls.every((call) => call.userId === OWNER)).toBe(true);
    expect(mediaStore.calls.map((call) => call.contentType).sort()).toEqual([
      "image/jpeg",
      "image/webp",
    ]);

    // The record names durable handles, not the data URIs it arrived as, so
    // the take outlives the tab that accepted it.
    const session = onlySession(store);
    const take = takesOf(session, result.result.promptVersionId)[0]!;
    const snapshotInput = (
      take.sourceInputs as Array<{
        kind: string;
        assetId?: string;
        storagePath?: string;
      }>
    ).find((input) => input.assetId !== (take.mediaAssetIds as string[])[0]);

    expect(take.storagePath).toContain(OWNER);
    expect(snapshotInput?.kind).toBe("sketch");
    expect(snapshotInput?.storagePath).toContain(OWNER);

    // Still readable with nothing but the persisted record in hand.
    const pictureAssetId = (take.mediaAssetIds as string[])[0]!;
    expect(mediaStore.contents.get(pictureAssetId)?.bytes).toBe(
      WEBP_BYTES.toString("base64"),
    );
    expect(mediaStore.contents.get(snapshotInput!.assetId!)?.bytes).toBe(
      JPEG_BYTES.toString("base64"),
    );
  });

  it("is born with one words-version whose words are the sketch prompt, holding one sketchpad take with the accepted output's own inputs recorded", async () => {
    const { deps, store } = fixture;

    const result = await acceptLiveOutput(deps, request());
    expect(result.state).toBe("accepted");
    if (result.state !== "accepted") return;
    expect(result.result.createdSession).toBe(true);

    const session = onlySession(store);
    const versions = session.prompt?.versions ?? [];
    expect(versions).toHaveLength(1);
    expect(versions[0]!.versionId).toBe(result.result.promptVersionId);
    expect(versions[0]!.prompt).toBe(SKETCH_PROMPT);
    expect(session.prompt?.input).toBe(SKETCH_PROMPT);

    const takes = takesOf(session, result.result.promptVersionId);
    expect(takes).toHaveLength(1);
    const take = takes[0]!;
    expect(take.id).toBe(result.result.generationId);
    expect(take.origin).toBe("sketchpad");
    expect(take.mediaType).toBe("image");
    // Decision 2: the production facts of THAT output, verbatim from the
    // request — never re-read, never invented.
    expect(take.productionProvenance).toEqual({
      state: "known",
      instruction: SKETCH_PROMPT,
      model: RELAY_MODEL,
      sketch: { seed: 424242, strength: 0.875, steps: 8 },
    });
    // Decision 3: no take ancestor, so it hangs from its words-version.
    expect(take.ancestorGenerationId).toBeNull();
  });

  it("arms the accepted picture as the session's first frame, carrying the take identity a clip made from it will name", async () => {
    const { deps, store } = fixture;

    const result = await acceptLiveOutput(deps, request());
    expect(result.state).toBe("accepted");
    if (result.state !== "accepted") return;

    // keyframes[0] IS the armed start frame (ADR-0011 D4): hydration re-arms
    // from the head of the array, and `useGenerationsRuntime` copies
    // `startFrame.generationId` onto the clip request as `sourceGenerationId`,
    // which the clip record persists as its `ancestorGenerationId`.
    const session = onlySession(store);
    const armed = session.prompt?.keyframes?.[0];
    expect(armed?.url).toBe(result.result.imageUrl);
    expect(armed?.source).toBe("generation");
    expect(armed?.generationId).toBe(result.result.generationId);
    expect(armed?.sourcePrompt).toBe(SKETCH_PROMPT);
  });

  it("creates one session and one take when Use this is pressed twice", async () => {
    const { deps, store, mediaStore } = fixture;

    const first = await acceptLiveOutput(deps, request());
    const second = await acceptLiveOutput(deps, request());

    expect(first.state).toBe("accepted");
    expect(second.state).toBe("accepted");
    if (first.state !== "accepted" || second.state !== "accepted") return;

    expect(second.result).toEqual(first.result);
    expect(store.sessions.size).toBe(1);
    const session = onlySession(store);
    expect(takesOf(session, first.result.promptVersionId)).toHaveLength(1);
    // The picture itself is stored once — the admission replays rather than
    // re-storing, so a second press is never a second copy of the take.
    const pictureStores = mediaStore.calls.filter(
      (call) => call.contentType === "image/webp",
    );
    expect(pictureStores).toHaveLength(1);
  });

  it("creates one session and one take when two presses of the same output race at the create step", async () => {
    const { deps, store, mediaStore } = fixture;

    // Hold both presses at the atomic create until both have arrived, so it is
    // exercised under true contention — the window a find-then-create left open
    // to mint two sessions for one output.
    const barrier = createBarrier(2);
    store.setCreateIfAbsentGate(() => barrier.wait());

    const [first, second] = await Promise.all([
      acceptLiveOutput(deps, request()),
      acceptLiveOutput(deps, request()),
    ]);

    // Exactly one session, holding exactly one take — never two rows for one
    // output, and never a session the loser's compensation deleted.
    expect(store.sessions.size).toBe(1);
    const session = onlySession(store);
    const versionId = session.prompt?.versions?.[0]?.versionId;
    expect(versionId).toBeDefined();
    expect(takesOf(session, versionId!)).toHaveLength(1);

    // The picture is stored once — the loser replays or backs off, never mints
    // a rival take.
    expect(
      mediaStore.calls.filter((call) => call.contentType === "image/webp"),
    ).toHaveLength(1);

    // One press is told it succeeded; the other is at worst told to retry,
    // never handed a hard failure.
    expect([first.state, second.state]).toContain("accepted");
    for (const state of [first.state, second.state]) {
      expect(["accepted", "in_progress"]).toContain(state);
    }
  });

  it("admits into the destination's session and words-version when one is given, minting no session", async () => {
    const { deps, store } = fixture;
    const existing: SessionRecord = {
      id: "session-existing",
      userId: OWNER,
      status: "active",
      createdAt: new Date("2026-09-17T00:00:00.000Z"),
      updatedAt: new Date("2026-09-17T00:00:00.000Z"),
      hasContinuity: false,
      prompt: {
        input: "a runner",
        output: "a runner on a rain-slicked street",
        versions: [
          {
            versionId: "v7",
            signature: "sig-7",
            prompt: "a runner on a rain-slicked street",
            timestamp: "2026-09-17T00:00:00.000Z",
          },
        ],
      },
    };
    store.sessions.set(existing.id, existing);

    const result = await acceptLiveOutput(
      deps,
      request({
        accepted: acceptRequest({
          destination: {
            sessionId: "session-existing",
            promptVersionId: "v7",
          },
        }),
      }),
    );

    expect(result.state).toBe("accepted");
    if (result.state !== "accepted") return;
    expect(result.result.createdSession).toBe(false);
    expect(result.result.sessionId).toBe("session-existing");
    expect(result.result.promptVersionId).toBe("v7");
    expect(store.sessions.size).toBe(1);

    const session = store.sessions.get("session-existing")!;
    // The destination's own first frame is left exactly as the creator had
    // it: what a returning surface should arm is that surface's decision,
    // and admitting the take is all this contract promises.
    expect(session.prompt?.keyframes).toBeUndefined();
    const take = takesOf(session, "v7")[0]!;
    expect(take.origin).toBe("sketchpad");
    // The take's ASSOCIATED words are the destination version's own text; the
    // sketch prompt stays where it belongs, in the production provenance.
    expect(take.prompt).toBe("a runner on a rain-slicked street");
    expect(
      (take.productionProvenance as { instruction: string }).instruction,
    ).toBe(SKETCH_PROMPT);
  });

  it("refuses a destination that is not the creator's, without storing or creating anything", async () => {
    const { deps, store, mediaStore } = fixture;
    store.sessions.set("session-theirs", {
      id: "session-theirs",
      userId: STRANGER,
      status: "active",
      createdAt: new Date("2026-09-17T00:00:00.000Z"),
      updatedAt: new Date("2026-09-17T00:00:00.000Z"),
      hasContinuity: false,
    });

    const result = await acceptLiveOutput(
      deps,
      request({
        accepted: acceptRequest({
          destination: {
            sessionId: "session-theirs",
            promptVersionId: "v1",
          },
        }),
      }),
    );

    expect(result.state).toBe("refused");
    expect(mediaStore.calls).toHaveLength(0);
    expect(store.sessions.get("session-theirs")?.prompt).toBeUndefined();
  });

  it("refuses with a clear message when persistence is unavailable, leaving nothing half-created", async () => {
    const { deps, store, mediaStore } = fixture;
    mediaStore.failFrom(0);

    const result = await acceptLiveOutput(deps, request());

    expect(result.state).toBe("unavailable");
    if (result.state !== "unavailable") return;
    expect(result.reason).toContain("asset store unavailable");
    expect(store.sessions.size).toBe(0);
  });

  it("removes the session it had just minted when the admission fails before any take is committed", async () => {
    const { deps, store, mediaStore } = fixture;
    // The snapshot lands, the session is born, and the store dies before the
    // accepted picture is durable — a failure BEFORE any commit. The empty
    // session this attempt minted, and only that one, is cleaned up.
    mediaStore.failFrom(1);

    const result = await acceptLiveOutput(deps, request());

    expect(result.state).toBe("unavailable");
    expect(store.sessions.size).toBe(0);
  });

  it("keeps the session AND its take when the completion write fails after the take has attached", async () => {
    const { deps, store, mediaStore, idempotency } = fixture;
    // Let the pre-append `pending` snapshot land (call 0), then fail the
    // completion rewrite (call 1) — the write that runs AFTER the take is
    // already in its session. Compensation must never delete committed work to
    // punish a failed response-record (issue #130, ADR-0022 decision 6).
    idempotency.failMarkCompletedFrom(1);

    const result = await acceptLiveOutput(deps, request());

    // The caller learns the acceptance did not settle cleanly...
    expect(result.state).toBe("unavailable");

    // ...yet the session it minted, and the take that attached, are intact.
    expect(store.sessions.size).toBe(1);
    const session = onlySession(store);
    const versionId = session.prompt?.versions?.[0]?.versionId;
    const takes = takesOf(session, versionId!);
    expect(takes).toHaveLength(1);
    expect(takes[0]!.origin).toBe("sketchpad");
    const attachedTakeId = takes[0]!.id;

    // The picture is durable and was never rolled back: one webp store.
    expect(
      mediaStore.calls.filter((call) => call.contentType === "image/webp"),
    ).toHaveLength(1);

    // And it is resumable: once storage recovers, a retry replays the SAME
    // take rather than minting a second — one session, one take throughout.
    idempotency.failMarkCompletedFrom(Number.POSITIVE_INFINITY);
    const retry = await acceptLiveOutput(deps, request());

    expect(retry.state).toBe("accepted");
    if (retry.state !== "accepted") return;
    expect(retry.result.generationId).toBe(attachedTakeId);
    expect(store.sessions.size).toBe(1);
    expect(takesOf(onlySession(store), versionId!)).toHaveLength(1);
  });

  it("reports a take that was admitted but not attached as made-but-not-saved, carrying the record a retry re-sends (issue #134)", async () => {
    const { deps, store, mediaStore } = fixture;
    // The session append dies exactly once — the attach fails, everything
    // around it is healthy. The take's media is durable, its identity minted,
    // and its session does not have it: made-but-not-saved.
    store.mutate.mockRejectedValueOnce(new Error("firestore unavailable"));

    const result = await acceptLiveOutput(deps, request());

    // The wrapper reports the outcome instead of assuming it: still
    // `accepted` (the acceptance ran), but its attachment fact says `failed`.
    expect(result.state).toBe("accepted");
    if (result.state !== "accepted") return;
    expect(result.result.attachment.state).toBe("failed");
    expect(result.result.attachment.reason).toContain("firestore unavailable");
    // The take identity was already minted before the append was attempted,
    // and the record that carries it is exactly what a retry re-sends.
    expect(result.result.attachment.generationId).toBe(
      result.result.generationId,
    );
    expect(result.result.attachment.record?.id).toBe(result.result.generationId);
    expect(result.result.attachment.sessionId).toBe(result.result.sessionId);
    expect(result.result.attachment.promptVersionId).toBe(
      result.result.promptVersionId,
    );
    // The media is durable — made, not lost.
    expect(
      mediaStore.calls.filter((call) => call.contentType === "image/webp"),
    ).toHaveLength(1);

    // …and the session does NOT have the take: nothing may read this
    // response as "the picture is in its session now".
    const session = onlySession(store);
    const versionId = session.prompt?.versions?.[0]?.versionId;
    expect(takesOf(session, versionId!)).toHaveLength(0);

    // A re-press replays the receipt and RESUMES the owed attachment: the
    // SAME take, attached — never a second take, never a re-store.
    const retry = await acceptLiveOutput(deps, request());
    expect(retry.state).toBe("accepted");
    if (retry.state !== "accepted") return;
    expect(retry.result.attachment.state).toBe("attached");
    expect(retry.result.generationId).toBe(result.result.generationId);
    expect(takesOf(onlySession(store), versionId!)).toHaveLength(1);
    expect(
      mediaStore.calls.filter((call) => call.contentType === "image/webp"),
    ).toHaveLength(1);
  });

  it("reports an arming failure after a successful attach as a failed arming fact, and a re-press arms the SAME take without minting another (issue #136)", async () => {
    const { deps, store, mediaStore } = fixture;
    // The take attaches; the arming write — the step after it — dies once.
    // The real SessionService sits under a façade whose arming write throws
    // exactly once, so ONLY the arming fails.
    const inner = deps.sessionService;
    let failNextArm = true;
    const gated = Object.create(inner) as AcceptLiveOutputSessionPort;
    gated.updatePromptForUser = async (userId, sessionId, updates) => {
      if (failNextArm) {
        failNextArm = false;
        throw new Error("keyframe write failed");
      }
      return inner.updatePromptForUser(userId, sessionId, updates);
    };
    deps.sessionService = gated;

    const first = await acceptLiveOutput(deps, request());
    expect(first.state).toBe("accepted");
    if (first.state !== "accepted") return;

    // VISIBLE: the attachment fact says the take reached its session, and the
    // arming fact says the frame did not land. Success no longer hides the
    // failure behind a log line.
    expect(first.result.attachment.state).toBe("attached");
    expect(first.result.arming).toEqual({
      state: "failed",
      generationId: first.result.generationId,
      reason: "keyframe write failed",
    });
    const session = onlySession(store);
    const versionId = session.prompt?.versions?.[0]?.versionId;
    expect(session.prompt?.keyframes).toBeUndefined();

    // REPAIRABLE without readmission and without a second take: a re-press
    // replays the admission — the SAME take, one store of the media — and
    // arms it. This invocation did NOT create the session; it arms anyway.
    const retry = await acceptLiveOutput(deps, request());
    expect(retry.state).toBe("accepted");
    if (retry.state !== "accepted") return;
    expect(retry.result.generationId).toBe(first.result.generationId);
    expect(retry.result.arming).toEqual({
      state: "armed",
      generationId: first.result.generationId,
    });
    expect(retry.result.attachment.state).toBe("attached");
    const after = onlySession(store);
    expect(after.prompt?.keyframes?.[0]?.generationId).toBe(
      first.result.generationId,
    );
    expect(after.prompt?.keyframes?.[0]?.storagePath).toContain(OWNER);
    expect(takesOf(after, versionId!)).toHaveLength(1);
    expect(
      mediaStore.calls.filter((call) => call.contentType === "image/webp"),
    ).toHaveLength(1);
  });

  it("re-arms the same frame when a settled acceptance is re-pressed — the arm never depends on which invocation created the session (issue #136)", async () => {
    const { deps, store } = fixture;

    const first = await acceptLiveOutput(deps, request());
    expect(first.state).toBe("accepted");
    if (first.state !== "accepted") return;
    expect(first.result.arming.state).toBe("armed");

    const second = await acceptLiveOutput(deps, request());
    expect(second.state).toBe("accepted");
    if (second.state !== "accepted") return;

    // The second press reused the first press's session — createdSession is
    // stated from the request, not from which invocation minted it — and it
    // armed identically: same take at keyframes[0], one take, one session.
    expect(second.result.arming).toEqual({
      state: "armed",
      generationId: first.result.generationId,
    });
    const session = onlySession(store);
    const versionId = session.prompt?.versions?.[0]?.versionId;
    expect(session.prompt?.keyframes?.[0]?.generationId).toBe(
      first.result.generationId,
    );
    expect(takesOf(session, versionId!)).toHaveLength(1);
  });

  it("reports arming as not owed when the acceptance named a destination, whose first frame is not this bridge's to replace (issue #136)", async () => {
    const { deps, store } = fixture;
    const existing: SessionRecord = {
      id: "session-existing",
      userId: OWNER,
      status: "active",
      createdAt: new Date("2026-09-17T00:00:00.000Z"),
      updatedAt: new Date("2026-09-17T00:00:00.000Z"),
      hasContinuity: false,
      prompt: {
        input: "a runner",
        output: "a runner on a rain-slicked street",
        versions: [
          {
            versionId: "v7",
            signature: "sig-7",
            prompt: "a runner on a rain-slicked street",
            timestamp: "2026-09-17T00:00:00.000Z",
          },
        ],
      },
    };
    store.sessions.set(existing.id, existing);

    const result = await acceptLiveOutput(
      deps,
      request({
        accepted: acceptRequest({
          destination: {
            sessionId: "session-existing",
            promptVersionId: "v7",
          },
        }),
      }),
    );

    expect(result.state).toBe("accepted");
    if (result.state !== "accepted") return;
    expect(result.result.arming).toEqual({
      state: "not-owed",
      generationId: result.result.generationId,
    });
    expect(
      store.sessions.get("session-existing")?.prompt?.keyframes,
    ).toBeUndefined();
  });

  it("rejects media it cannot read as an image, before any side effect", async () => {
    const { deps, store, mediaStore } = fixture;

    const result = await acceptLiveOutput(
      deps,
      request({
        accepted: acceptRequest({ liveOutputDataUri: "not-a-data-uri" }),
      }),
    );

    expect(result.state).toBe("invalid");
    expect(mediaStore.calls).toHaveLength(0);
    expect(store.sessions.size).toBe(0);
  });
});
