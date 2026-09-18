import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  admitPictureTake,
  type AdmissionIdempotencyPort,
  type AdmissionMediaStore,
  type AdmitPictureTakeDependencies,
  type AdmitPictureTakeRequest,
} from "../admitPictureTake";
import { SessionService } from "@services/sessions/SessionService";
import type { SessionRecord } from "@services/sessions/types";

/**
 * The shared admission boundary — ADR-0022 decisions 1, 2, 3 (issue #86).
 *
 * Upload is the first caller; the live editor (#87) and the studio (#89) reuse
 * this function. So the contract, not the upload route, is what is pinned
 * here: stable identity under retry, durable media, an owned destination, and
 * a binding to the words-version the REQUEST named.
 *
 * Seam: the real `SessionService` runs, with an in-memory `SessionStore`
 * double injected through its constructor — Firestore is the process-external
 * boundary, `appendGenerationToVersion`'s upsert-by-id is not, and "exactly one
 * take" is only worth asserting against the real upsert. The asset store and
 * the idempotency store are likewise doubles of GCS and Firestore. No
 * `vi.mock` of an internal module anywhere.
 */

const OWNER = "creator-1";
const INTRUDER = "someone-else";
const SESSION_ID = "session-1";

function sessionRecord(): SessionRecord {
  return {
    id: SESSION_ID,
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
          versionId: "v1",
          signature: "sig-1",
          prompt: "a runner on a rain-slicked street",
          timestamp: "2026-09-17T00:00:00.000Z",
        },
        {
          versionId: "v2",
          signature: "sig-2",
          prompt: "a runner at dawn",
          timestamp: "2026-09-17T00:01:00.000Z",
        },
      ],
    },
  };
}

/** Stands in for Firestore. The mutator-is-the-write shape mirrors the store. */
function createSessionStore(initial: SessionRecord = sessionRecord()) {
  let current = initial;
  return {
    current: (): SessionRecord => current,
    get: vi.fn(async () => current),
    save: vi.fn(async (next: SessionRecord) => {
      current = next;
    }),
    mutate: vi.fn(
      async (
        _sessionId: string,
        mutator: (record: SessionRecord) => SessionRecord,
      ): Promise<SessionRecord> => {
        current = mutator(current);
        return current;
      },
    ),
    delete: vi.fn(),
    findByPromptUuid: vi.fn(async () => null),
  };
}

/** Stands in for GCS. Records every call so "never re-stored" is assertable. */
function createMediaStore(): AdmissionMediaStore & {
  calls: Array<{ contentType: string; userId: string; bytes: number }>;
} {
  const calls: Array<{
    contentType: string;
    userId: string;
    bytes: number;
  }> = [];
  let next = 0;
  return {
    calls,
    storeFromBuffer: async (buffer, contentType, userId) => {
      calls.push({ contentType, userId, bytes: buffer.length });
      next += 1;
      return {
        id: `asset-${next}`,
        storagePath: `image-previews/${userId}/asset-${next}`,
        url: `https://storage.example.com/asset-${next}?sig=live`,
      };
    },
  };
}

/**
 * Stands in for the Firestore-backed `RequestIdempotencyService`, reproducing
 * the three states admission depends on: a first `claimed`, a `replay` once a
 * snapshot exists, and an `in_progress` while a claim is still open.
 */
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

function uploadRequest(
  overrides: Partial<AdmitPictureTakeRequest> = {},
): AdmitPictureTakeRequest {
  return {
    userId: OWNER,
    sessionId: SESSION_ID,
    promptVersionId: "v1",
    origin: "upload",
    media: { buffer: Buffer.from("png-bytes"), contentType: "image/png" },
    productionProvenance: { state: "unknown" },
    displayAncestorGenerationId: null,
    idempotencyKey: "admission-key-1",
    associatedWordsText: "a runner on a rain-slicked street",
    ...overrides,
  };
}

function takesIn(
  store: ReturnType<typeof createSessionStore>,
  versionId: string,
) {
  const version = store
    .current()
    .prompt?.versions?.find((entry) => entry.versionId === versionId);
  return version?.generations ?? [];
}

function setup(store = createSessionStore()): {
  store: ReturnType<typeof createSessionStore>;
  mediaStore: ReturnType<typeof createMediaStore>;
  deps: AdmitPictureTakeDependencies;
} {
  const mediaStore = createMediaStore();
  const sessionService = new SessionService(store as never);
  return {
    store,
    mediaStore,
    deps: {
      sessionService,
      mediaStore,
      idempotency: createIdempotency(),
    },
  };
}

describe("admitPictureTake (ADR-0022, issue #86)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("admits an upload as a picture take with origin upload, a server-assigned identity, unknown provenance, and the admitting words-version", async () => {
    const { store, deps } = setup();

    const result = await admitPictureTake(deps, uploadRequest());

    expect(result.state).toBe("admitted");
    if (result.state !== "admitted") return;

    const takes = takesIn(store, "v1");
    expect(takes).toHaveLength(1);
    const record = takes[0] as Record<string, unknown>;

    // The identity is the server's, not the client's.
    expect(typeof record.id).toBe("string");
    expect(record.id).toBe(result.take.generationId);
    expect(record.mediaType).toBe("image");
    expect(record.status).toBe("completed");

    // Decision 1: recorded, closed, and not inferred later.
    expect(record.origin).toBe("upload");
    // Decision 2: an upload does not invent a production fact…
    expect(record.productionProvenance).toEqual({ state: "unknown" });
    // …and its associated words are the version it was admitted under.
    expect(record.promptVersionId).toBe("v1");
    // Decision 3: no picture ancestor — it hangs from its words-version.
    expect(record.ancestorGenerationId).toBeNull();
  });

  it("files the take under the admitting version's own words, and keeps those separate from its provenance", async () => {
    const { store, deps } = setup();

    // The upload supplies no words of its own.
    const request = uploadRequest();
    delete (request as { associatedWordsText?: string }).associatedWordsText;
    await admitPictureTake(deps, request);

    const record = takesIn(store, "v1")[0] as Record<string, unknown>;
    // Associated words: the direction restored when this take is selected.
    expect(record.prompt).toBe("a runner on a rain-slicked street");
    expect(record.promptVersionId).toBe("v1");
    // Production provenance: a separate fact, and an honest unknown. The two
    // are never presented as one (decision 2).
    expect(record.productionProvenance).toEqual({ state: "unknown" });
  });

  it("stores the bytes in the creator's own asset store and records the durable handles on the take", async () => {
    const { store, mediaStore, deps } = setup();

    const result = await admitPictureTake(deps, uploadRequest());
    expect(result.state).toBe("admitted");
    if (result.state !== "admitted") return;

    expect(mediaStore.calls).toEqual([
      { contentType: "image/png", userId: OWNER, bytes: 9 },
    ]);

    const record = takesIn(store, "v1")[0] as Record<string, unknown>;
    // The asset id is the handle that outlives the signed URL — the take stays
    // readable when the browser that admitted it is long gone.
    expect(record.mediaAssetIds).toEqual([result.take.assetId]);
    expect(record.storagePath).toBe(`image-previews/${OWNER}/asset-1`);
    expect(record.mediaUrls).toEqual([result.take.imageUrl]);
  });

  it("returns the same take when the admission is retried with the same key, and never stores the bytes twice", async () => {
    const { store, mediaStore, deps } = setup();

    const first = await admitPictureTake(deps, uploadRequest());
    const retry = await admitPictureTake(deps, uploadRequest());

    expect(first.state).toBe("admitted");
    expect(retry.state).toBe("admitted");
    if (first.state !== "admitted" || retry.state !== "admitted") return;

    expect(retry.take.generationId).toBe(first.take.generationId);
    expect(retry.replayed).toBe(true);
    expect(mediaStore.calls).toHaveLength(1);
    expect(takesIn(store, "v1")).toHaveLength(1);
  });

  it("a lost response followed by a retry produces one take, not two", async () => {
    const { store, mediaStore, deps } = setup();

    // The first admission completes on the server; the creator never sees it.
    const lost = await admitPictureTake(deps, uploadRequest());
    expect(lost.state).toBe("admitted");
    if (lost.state !== "admitted") return;

    // The client, having nothing, sends the same admission again.
    const resent = await admitPictureTake(deps, uploadRequest());

    expect(resent.state).toBe("admitted");
    if (resent.state !== "admitted") return;
    expect(resent.take.generationId).toBe(lost.take.generationId);
    expect(resent.take.imageUrl).toBe(lost.take.imageUrl);
    expect(takesIn(store, "v1")).toHaveLength(1);
    expect(mediaStore.calls).toHaveLength(1);
  });

  it("a double-click produces one take: the second concurrent admission is refused, not duplicated", async () => {
    const { store, mediaStore, deps } = setup();

    const [first, second] = await Promise.all([
      admitPictureTake(deps, uploadRequest()),
      admitPictureTake(deps, uploadRequest()),
    ]);

    const states = [first.state, second.state].sort();
    expect(states).toEqual(["admitted", "in_progress"]);
    expect(takesIn(store, "v1")).toHaveLength(1);
    expect(mediaStore.calls).toHaveLength(1);
  });

  it("refuses an admission into a session the creator does not own, and stores nothing", async () => {
    const { store, mediaStore, deps } = setup();

    const result = await admitPictureTake(
      deps,
      uploadRequest({ userId: INTRUDER }),
    );

    expect(result.state).toBe("refused");
    // Refused BEFORE any side effect: no bytes stored, no session write.
    expect(mediaStore.calls).toHaveLength(0);
    expect(store.save).not.toHaveBeenCalled();
    expect(store.mutate).not.toHaveBeenCalled();
    expect(takesIn(store, "v1")).toHaveLength(0);
  });

  it("refuses an admission into a session that does not exist", async () => {
    const store = createSessionStore();
    store.get.mockResolvedValue(null as never);
    const { deps, mediaStore } = setup(store);

    const result = await admitPictureTake(deps, uploadRequest());

    expect(result.state).toBe("refused");
    expect(mediaStore.calls).toHaveLength(0);
  });

  it("binds the take to the words-version the request named, even after the session's current version moves on", async () => {
    const { store, deps } = setup();

    // The creator is now writing under v2 — the request still says v1.
    const request = uploadRequest({ promptVersionId: "v1" });
    const inFlight = admitPictureTake(deps, request);
    store.save(
      ((): SessionRecord => {
        const current = store.current();
        return {
          ...current,
          prompt: {
            ...current.prompt!,
            versions: [
              ...(current.prompt?.versions ?? []),
              {
                versionId: "v3",
                signature: "sig-3",
                prompt: "a runner at dusk",
                timestamp: "2026-09-17T00:02:00.000Z",
              },
            ],
          },
        };
      })() as never,
    );
    const result = await inFlight;

    expect(result.state).toBe("admitted");
    if (result.state !== "admitted") return;
    expect(result.take.promptVersionId).toBe("v1");
    expect(takesIn(store, "v1")).toHaveLength(1);
    expect(takesIn(store, "v2")).toHaveLength(0);
    expect(takesIn(store, "v3")).toHaveLength(0);
  });

  it("records every source input and exposes exactly one of them as the display ancestor", async () => {
    const { store, deps } = setup();

    const result = await admitPictureTake(
      deps,
      uploadRequest({
        origin: "studio",
        productionProvenance: {
          state: "known",
          instruction: "remove the chair",
          model: "flux-kontext",
        },
        sourceInputs: [{ kind: "take", generationId: "gen-source-picture" }],
        displayAncestorGenerationId: "gen-source-picture",
      }),
    );

    expect(result.state).toBe("admitted");
    if (result.state !== "admitted") return;

    const record = takesIn(store, "v1")[0] as Record<string, unknown>;
    // Both inputs are recorded in full: the bridged take AND the media this
    // admission made durable.
    expect(record.sourceInputs).toEqual([
      { kind: "take", generationId: "gen-source-picture" },
      {
        kind: "studio-image",
        assetId: result.take.assetId,
        storagePath: result.take.storagePath,
      },
    ]);
    // Exactly one of them is what the space draws.
    expect(record.ancestorGenerationId).toBe("gen-source-picture");
    expect(record.productionProvenance).toEqual({
      state: "known",
      instruction: "remove the chair",
      model: "flux-kontext",
    });
  });

  it("reports a failed attachment instead of throwing, and keeps the take's identity and media", async () => {
    const store = createSessionStore();
    store.mutate.mockRejectedValue(new Error("firestore unavailable"));
    const { deps, mediaStore } = setup(store);

    const result = await admitPictureTake(deps, uploadRequest());

    expect(result.state).toBe("admitted");
    if (result.state !== "admitted") return;
    // Made but not saved (ADR-0022 decision 6): the media is durable, the take
    // has a name, and the record rides back out for the creator's retry.
    expect(result.take.attachment.state).toBe("failed");
    expect(result.take.attachment.generationId).toBe(result.take.generationId);
    expect(result.take.attachment.record).toBeDefined();
    expect(mediaStore.calls).toHaveLength(1);
  });

  it("refuses to draw a display ancestor the take never recorded as an input", async () => {
    const { deps, mediaStore, store } = setup();

    await expect(
      admitPictureTake(
        deps,
        uploadRequest({
          origin: "studio",
          // No `take` input names this id, so nothing recorded the
          // relationship. Drawing it anyway is the positional guess ADR-0022
          // decision 3 removed, one layer up.
          sourceInputs: [{ kind: "studio-image", assetId: "asset-ref" }],
          displayAncestorGenerationId: "gen-invented",
        }),
      ),
    ).rejects.toThrow(/not among the take's source inputs/);

    expect(mediaStore.calls).toHaveLength(0);
    expect(store.mutate).not.toHaveBeenCalled();
  });

  it("treats the same key with a different destination as a conflict rather than a wrong replay", async () => {
    const { deps, mediaStore } = setup();

    await admitPictureTake(deps, uploadRequest());
    const reused = await admitPictureTake(
      deps,
      uploadRequest({ promptVersionId: "v2" }),
    );

    expect(reused.state).toBe("conflict");
    expect(mediaStore.calls).toHaveLength(1);
  });
});
