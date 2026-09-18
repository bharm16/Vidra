import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptLiveOutput,
  type AcceptLiveOutputDependencies,
  type AcceptLiveOutputRequest,
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
  return {
    sessions,
    get: vi.fn(async (id: string) => sessions.get(id) ?? null),
    save: vi.fn(async (next: SessionRecord) => {
      sessions.set(next.id, next);
    }),
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

/** Stands in for the Firestore-backed `RequestIdempotencyService`. */
function createIdempotency(): AdmissionIdempotencyPort {
  const records = new Map<
    string,
    {
      payloadHash: string;
      status: "pending" | "completed" | "failed";
      snapshot?: { statusCode: number; body: Record<string, unknown> };
    }
  >();
  return {
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
  };
}

function setup(): {
  store: ReturnType<typeof createSessionStore>;
  mediaStore: MediaStoreDouble;
  deps: AcceptLiveOutputDependencies;
} {
  const store = createSessionStore();
  const mediaStore = createMediaStore();
  return {
    store,
    mediaStore,
    deps: {
      sessionService: new SessionService(store as never),
      mediaStore,
      idempotency: createIdempotency(),
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

  it("removes the session it had just minted when the admission behind it fails", async () => {
    const { deps, store, mediaStore } = fixture;
    // The snapshot lands, the session is born, and the store dies before the
    // accepted picture is durable — the one window a session can outlive its
    // take. Nothing may survive it.
    mediaStore.failFrom(1);

    const result = await acceptLiveOutput(deps, request());

    expect(result.state).toBe("unavailable");
    expect(store.sessions.size).toBe(0);
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
