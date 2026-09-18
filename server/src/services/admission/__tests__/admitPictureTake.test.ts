import { createHash } from "node:crypto";
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
import type { OwnedPictureResolver } from "@services/owned-media";

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
function createIdempotency(): AdmissionIdempotencyPort & {
  payloads: unknown[];
} {
  const records = new Map<
    string,
    {
      payloadHash: string;
      status: "pending" | "completed" | "failed";
      snapshot?: { statusCode: number; body: Record<string, unknown> };
    }
  >();
  const payloads: unknown[] = [];
  return {
    payloads,
    claimRequest: async ({ userId, route, key, payload }) => {
      payloads.push(payload);
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

/**
 * A completed picture take as it sits in a version's `generations` — the shape
 * a display ancestor must resolve to (issue #122). `mediaType` and `archived`
 * are what the boundary reads to prove "live picture take".
 */
function pictureTakeRecord(
  id: string,
  opts: { mediaType?: string; archived?: boolean } = {},
) {
  return {
    id,
    mediaType: opts.mediaType ?? "image",
    status: "completed" as const,
    prompt: "a runner on a rain-slicked street",
    promptVersionId: "v2",
    mediaUrls: [`https://storage.example.com/${id}`],
    ancestorGenerationId: null,
    origin: "generated" as const,
    ...(opts.archived ? { archived: true as const } : {}),
  };
}

type SeededTake = ReturnType<typeof pictureTakeRecord>;

/**
 * The base session with the given takes already filed under v2 — the live
 * nodes a display ancestor can point at. Seeded into v2 on purpose: a take
 * admitted into v1 then stays the only entry in v1's generations, and the
 * display-ancestor read searches every version, so v2 is where it finds one.
 */
function sessionWith(generations: SeededTake[]): SessionRecord {
  const base = sessionRecord();
  const versions = (base.prompt?.versions ?? []).map((version) =>
    version.versionId === "v2" ? { ...version, generations } : version,
  );
  return { ...base, prompt: { ...base.prompt!, versions } };
}

/** Flip `archived` on the take with this id, wherever it is filed. */
function archiveGenerationIn(record: SessionRecord, id: string): SessionRecord {
  const versions = (record.prompt?.versions ?? []).map((version) => ({
    ...version,
    generations: (version.generations ?? []).map((generation) =>
      (generation as { id?: string }).id === id
        ? { ...generation, archived: true }
        : generation,
    ),
  }));
  return { ...record, prompt: { ...record.prompt!, versions } };
}

function setup(store = createSessionStore()): {
  store: ReturnType<typeof createSessionStore>;
  mediaStore: ReturnType<typeof createMediaStore>;
  idempotency: ReturnType<typeof createIdempotency>;
  deps: AdmitPictureTakeDependencies;
} {
  const mediaStore = createMediaStore();
  const idempotency = createIdempotency();
  const sessionService = new SessionService(store as never);
  return {
    store,
    mediaStore,
    idempotency,
    deps: {
      sessionService,
      mediaStore,
      idempotency,
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

  /**
   * Issue #125: a repeated acceptance returns the SAME take with a FRESH URL.
   * The snapshot's `imageUrl` was minted at first admission and expires ~1h
   * later; the durable handle it also holds is what the replay re-mints from,
   * through the owner-checked resolver. A refusal never fails the acceptance.
   */
  describe("replay re-mints the view URL from the durable handle (#125)", () => {
    const freshResolver: OwnedPictureResolver = {
      resolveOwnedPicture: async (_userId, handle) => ({
        storagePath: handle.storagePath ?? "image-previews/creator-1/asset-1",
        viewUrl: "https://storage.example.com/reminted?sig=fresh",
      }),
    };

    it("returns a fresh imageUrl with the same identity on replay", async () => {
      const { deps, mediaStore, store } = setup();
      const withResolver = { ...deps, resolver: freshResolver };

      const first = await admitPictureTake(withResolver, uploadRequest());
      const retry = await admitPictureTake(withResolver, uploadRequest());
      expect(first.state).toBe("admitted");
      expect(retry.state).toBe("admitted");
      if (first.state !== "admitted" || retry.state !== "admitted") return;

      expect(retry.replayed).toBe(true);
      // Fresh URL…
      expect(retry.take.imageUrl).toBe(
        "https://storage.example.com/reminted?sig=fresh",
      );
      expect(retry.take.imageUrl).not.toBe(first.take.imageUrl);
      // …same identity.
      expect(retry.take.generationId).toBe(first.take.generationId);
      expect(retry.take.assetId).toBe(first.take.assetId);
      expect(retry.take.storagePath).toBe(first.take.storagePath);
      // Never re-stored, never a second take.
      expect(mediaStore.calls).toHaveLength(1);
      expect(takesIn(store, "v1")).toHaveLength(1);
    });

    // Negative path: the object is gone or not the caller's. The stored URL
    // flows through — a repeated acceptance never fails for want of a signature.
    it("keeps the stored URL when the resolver refuses on replay", async () => {
      const refusing: OwnedPictureResolver = {
        resolveOwnedPicture: async () => null,
      };
      const { deps } = setup();
      const withResolver = { ...deps, resolver: refusing };

      const first = await admitPictureTake(withResolver, uploadRequest());
      const retry = await admitPictureTake(withResolver, uploadRequest());
      if (first.state !== "admitted" || retry.state !== "admitted") return;

      expect(retry.replayed).toBe(true);
      expect(retry.take.imageUrl).toBe(first.take.imageUrl);
      expect(retry.take.generationId).toBe(first.take.generationId);
    });

    it("keeps the frozen URL when no resolver is wired (prior behavior)", async () => {
      const { deps } = setup();
      const first = await admitPictureTake(deps, uploadRequest());
      const retry = await admitPictureTake(deps, uploadRequest());
      if (first.state !== "admitted" || retry.state !== "admitted") return;

      expect(retry.replayed).toBe(true);
      expect(retry.take.imageUrl).toBe(first.take.imageUrl);
    });
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
    // The display ancestor is a live picture take already in the session
    // (issue #122): the space can only draw an edge to a node that is here.
    const { store, deps } = setup(
      createSessionStore(
        sessionWith([pictureTakeRecord("gen-source-picture")]),
      ),
    );

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

  /**
   * Issue #114 — the acceptance is identified by its key AND its immutable
   * acceptance payload. The key alone used to be enough to replay, so a
   * different file (or a changed provenance, source tuple or display ancestor)
   * retried under a retained key replayed the earlier take. Each field is a
   * conflict dimension in its own right; the media digest is the load-bearing
   * one. These are ownership / user-data paths, so each is a negative path.
   */
  describe("acceptance identity (issue #114)", () => {
    it("treats the same key with a DIFFERENT FILE as a conflict, not a replay", async () => {
      const { deps, mediaStore } = setup();

      await admitPictureTake(deps, uploadRequest());
      const reused = await admitPictureTake(
        deps,
        uploadRequest({
          media: {
            buffer: Buffer.from("a-different-picture"),
            contentType: "image/png",
          },
        }),
      );

      expect(reused.state).toBe("conflict");
      // Rejected before the bytes were stored: the first admission's media is
      // the only thing in the store.
      expect(mediaStore.calls).toHaveLength(1);
    });

    it("treats the same key with CHANGED PRODUCTION PROVENANCE as a conflict", async () => {
      const { deps } = setup();

      await admitPictureTake(
        deps,
        uploadRequest({
          origin: "sketchpad",
          productionProvenance: {
            state: "known",
            instruction: "a runner",
            model: "z-image",
            sketch: { seed: 1, strength: 0.5, steps: 4 },
          },
        }),
      );
      // Same bytes, same destination, same key — but the picture was made with
      // a different seed, which is a different production fact.
      const reused = await admitPictureTake(
        deps,
        uploadRequest({
          origin: "sketchpad",
          productionProvenance: {
            state: "known",
            instruction: "a runner",
            model: "z-image",
            sketch: { seed: 2, strength: 0.5, steps: 4 },
          },
        }),
      );

      expect(reused.state).toBe("conflict");
    });

    it("treats the same key with a CHANGED SOURCE TUPLE as a conflict, even when the display ancestor is unchanged", async () => {
      // Both drawn ancestors are live pictures in the session (issue #122); the
      // conflict is on the source tuple, not the ancestor's validity.
      const { deps } = setup(
        createSessionStore(
          sessionWith([pictureTakeRecord("gen-A"), pictureTakeRecord("gen-B")]),
        ),
      );

      await admitPictureTake(
        deps,
        uploadRequest({
          origin: "studio",
          productionProvenance: {
            state: "known",
            instruction: "remove the chair",
            model: "flux-kontext",
          },
          sourceInputs: [{ kind: "take", generationId: "gen-A" }],
          displayAncestorGenerationId: "gen-A",
        }),
      );
      const reused = await admitPictureTake(
        deps,
        uploadRequest({
          origin: "studio",
          productionProvenance: {
            state: "known",
            instruction: "remove the chair",
            model: "flux-kontext",
          },
          // A second contributing take joined the tuple; the drawn ancestor is
          // still gen-A, so this isolates the source tuple from the ancestor.
          sourceInputs: [
            { kind: "take", generationId: "gen-A" },
            { kind: "take", generationId: "gen-B" },
          ],
          displayAncestorGenerationId: "gen-A",
        }),
      );

      expect(reused.state).toBe("conflict");
    });

    it("treats the same key with a DIFFERENT DISPLAY ANCESTOR as a conflict, even when the source tuple is unchanged", async () => {
      // gen-A and gen-B are both live pictures in the session (issue #122), so
      // either is a valid ancestor and the conflict is purely on which was drawn.
      const { deps } = setup(
        createSessionStore(
          sessionWith([pictureTakeRecord("gen-A"), pictureTakeRecord("gen-B")]),
        ),
      );

      await admitPictureTake(
        deps,
        uploadRequest({
          origin: "studio",
          productionProvenance: {
            state: "known",
            instruction: "remove the chair",
            model: "flux-kontext",
          },
          sourceInputs: [
            { kind: "take", generationId: "gen-A" },
            { kind: "take", generationId: "gen-B" },
          ],
          displayAncestorGenerationId: "gen-A",
        }),
      );
      const reused = await admitPictureTake(
        deps,
        uploadRequest({
          origin: "studio",
          productionProvenance: {
            state: "known",
            instruction: "remove the chair",
            model: "flux-kontext",
          },
          // Same two inputs, but the creator drew the OTHER one as the ancestor.
          sourceInputs: [
            { kind: "take", generationId: "gen-A" },
            { kind: "take", generationId: "gen-B" },
          ],
          displayAncestorGenerationId: "gen-B",
        }),
      );

      expect(reused.state).toBe("conflict");
    });

    it("fingerprints the media by its bytes, never a signed URL, so a reminted URL cannot change the acceptance", async () => {
      const { deps, idempotency } = setup();

      const request = uploadRequest({
        origin: "sketchpad",
        productionProvenance: {
          state: "known",
          instruction: "a runner",
          model: "z-image",
          sketch: { seed: 7, strength: 0.6, steps: 4 },
        },
        sourceInputs: [
          {
            kind: "sketch",
            assetId: "snap-1",
            storagePath: "image-previews/creator-1/snap-1",
          },
        ],
      });
      const result = await admitPictureTake(deps, request);
      expect(result.state).toBe("admitted");

      // The payload the acceptance was claimed under, captured before any byte
      // was stored.
      const payload = idempotency.payloads[0] as Record<string, unknown>;

      // The bytes ARE the identity…
      expect(payload.mediaDigest).toBe(
        createHash("sha256").update(request.media.buffer).digest("hex"),
      );
      // …and nothing that lives an hour is. The asset store minted a
      // `?sig=live` URL; it is nowhere in what identifies the acceptance.
      const serialized = JSON.stringify(payload);
      expect(serialized).not.toContain("http");
      expect(serialized).not.toContain("sig=");
      expect(serialized).not.toContain("storage.example.com");
    });

    it("replays a retry whose source input was re-stored under a new handle, because identity is the take it points at, not the blob", async () => {
      const { deps, mediaStore } = setup();

      const first = await admitPictureTake(
        deps,
        uploadRequest({
          origin: "sketchpad",
          sourceInputs: [
            { kind: "sketch", assetId: "snap-1", storagePath: "p/snap-1" },
          ],
        }),
      );
      // The live-editor accept re-stores its sketch snapshot on every press, so
      // a retry of the SAME acceptance arrives carrying a fresh handle. Same
      // bytes, same key, same relationships — a replay, never a conflict.
      const retry = await admitPictureTake(
        deps,
        uploadRequest({
          origin: "sketchpad",
          sourceInputs: [
            { kind: "sketch", assetId: "snap-2", storagePath: "p/snap-2" },
          ],
        }),
      );

      expect(first.state).toBe("admitted");
      expect(retry.state).toBe("admitted");
      if (first.state !== "admitted" || retry.state !== "admitted") return;
      expect(retry.replayed).toBe(true);
      expect(retry.take.generationId).toBe(first.take.generationId);
      expect(mediaStore.calls).toHaveLength(1);
    });

    it("a deliberate new acceptance under a NEW KEY is a new take, not a replay of the first", async () => {
      const { store, deps, mediaStore } = setup();

      // Same bytes, same destination — but a genuinely new selection, which the
      // creator's side gives a fresh key. Identity is key AND payload, so a new
      // key is a new acceptance even when nothing else moved.
      const first = await admitPictureTake(
        deps,
        uploadRequest({ idempotencyKey: "key-1" }),
      );
      const second = await admitPictureTake(
        deps,
        uploadRequest({ idempotencyKey: "key-2" }),
      );

      expect(first.state).toBe("admitted");
      expect(second.state).toBe("admitted");
      if (first.state !== "admitted" || second.state !== "admitted") return;
      expect(second.replayed).toBe(false);
      expect(second.take.generationId).not.toBe(first.take.generationId);
      expect(takesIn(store, "v1")).toHaveLength(2);
      expect(mediaStore.calls).toHaveLength(2);
    });
  });

  /**
   * Issue #122 — the boundary PROVES every relationship it records. The display
   * ancestor is the one edge the space draws (ADR-0022 decision 3), so it must
   * be a live, non-archived PICTURE take that is genuinely a node in THIS
   * destination; the words-version it is filed under must already exist (never
   * auto-created from current text); and non-display source inputs are validated
   * for kind without being forced to be session nodes. Every rejection here is
   * an ownership / user-data negative path.
   *
   * These run on the INITIAL admission only. Replaying an already successful
   * acceptance returns its original take unchanged even after a source it named
   * is archived — the last test pins exactly that.
   */
  describe("relationship validation (issue #122)", () => {
    it("accepts a display ancestor that is a live picture take in the destination session", async () => {
      const { store, deps } = setup(
        createSessionStore(sessionWith([pictureTakeRecord("gen-parent")])),
      );

      const result = await admitPictureTake(
        deps,
        uploadRequest({
          origin: "studio",
          productionProvenance: {
            state: "known",
            instruction: "warm the light",
            model: "flux-kontext",
          },
          sourceInputs: [{ kind: "take", generationId: "gen-parent" }],
          displayAncestorGenerationId: "gen-parent",
        }),
      );

      expect(result.state).toBe("admitted");
      if (result.state !== "admitted") return;
      const record = takesIn(store, "v1")[0] as Record<string, unknown>;
      // The refine edge the space draws: this picture's ancestor is that one.
      expect(record.ancestorGenerationId).toBe("gen-parent");
    });

    it("refuses a display ancestor that is not a node in this session, storing nothing", async () => {
      // The base session holds no takes, so the named ancestor is a phantom
      // here — the same refusal a take that is a node in ANOTHER session's
      // space earns, because this reads only the destination.
      const { store, mediaStore, deps } = setup();

      const result = await admitPictureTake(
        deps,
        uploadRequest({
          origin: "studio",
          sourceInputs: [{ kind: "take", generationId: "gen-nowhere" }],
          displayAncestorGenerationId: "gen-nowhere",
        }),
      );

      expect(result.state).toBe("refused");
      expect(mediaStore.calls).toHaveLength(0);
      expect(store.mutate).not.toHaveBeenCalled();
    });

    it("refuses a display ancestor that is a take of ANOTHER session, never crossing the edge", async () => {
      // A real, live picture — but a node in a DIFFERENT session the creator
      // also owns. A take is a node in exactly one space, so an edge to it from
      // here is one the space cannot draw. The boundary reads only the
      // destination, so the ancestor is simply absent from it.
      const destination = sessionRecord(); // session-1, no takes of its own
      const other: SessionRecord = {
        ...sessionWith([pictureTakeRecord("gen-in-other")]),
        id: "session-2",
      };
      const sessions = new Map<string, SessionRecord>([
        [destination.id, destination],
        [other.id, other],
      ]);
      const store = {
        get: vi.fn(async (id: string) => sessions.get(id) ?? null),
        save: vi.fn(),
        mutate: vi.fn(),
        delete: vi.fn(),
        findByPromptUuid: vi.fn(async () => null),
      };
      const { deps, mediaStore } = setup(
        store as unknown as ReturnType<typeof createSessionStore>,
      );

      const result = await admitPictureTake(
        deps,
        uploadRequest({
          origin: "studio",
          sourceInputs: [{ kind: "take", generationId: "gen-in-other" }],
          displayAncestorGenerationId: "gen-in-other",
        }),
      );

      expect(result.state).toBe("refused");
      expect(mediaStore.calls).toHaveLength(0);
      expect(store.mutate).not.toHaveBeenCalled();
    });

    it("refuses a display ancestor that is archived", async () => {
      const { mediaStore, deps } = setup(
        createSessionStore(
          sessionWith([pictureTakeRecord("gen-gone", { archived: true })]),
        ),
      );

      const result = await admitPictureTake(
        deps,
        uploadRequest({
          origin: "studio",
          sourceInputs: [{ kind: "take", generationId: "gen-gone" }],
          displayAncestorGenerationId: "gen-gone",
        }),
      );

      expect(result.state).toBe("refused");
      if (result.state !== "refused") return;
      expect(result.reason).toContain("archived");
      expect(mediaStore.calls).toHaveLength(0);
    });

    it("refuses a display ancestor that is a clip, not a picture", async () => {
      const { mediaStore, deps } = setup(
        createSessionStore(
          sessionWith([pictureTakeRecord("gen-clip", { mediaType: "video" })]),
        ),
      );

      const result = await admitPictureTake(
        deps,
        uploadRequest({
          origin: "studio",
          sourceInputs: [{ kind: "take", generationId: "gen-clip" }],
          displayAncestorGenerationId: "gen-clip",
        }),
      );

      expect(result.state).toBe("refused");
      if (result.state !== "refused") return;
      expect(result.reason).toContain("not a picture");
      expect(mediaStore.calls).toHaveLength(0);
    });

    it("cannot draw a self-link or a cycle: an ancestor id no live picture holds is refused, and the take's own id is minted only after this passes", async () => {
      // A self-link would need the take to name its own id — but that id is
      // minted only AFTER this check (step 5). So the only shape a self-link or
      // cycle can take is an ancestor that is not an existing live picture,
      // which is refused like any other phantom.
      const { mediaStore, deps } = setup();

      const result = await admitPictureTake(
        deps,
        uploadRequest({
          origin: "studio",
          sourceInputs: [{ kind: "take", generationId: "itself" }],
          displayAncestorGenerationId: "itself",
        }),
      );

      expect(result.state).toBe("refused");
      expect(mediaStore.calls).toHaveLength(0);
    });

    it("refuses a destination words-version that does not exist, and never creates one from current text", async () => {
      const { store, mediaStore, deps } = setup();

      const result = await admitPictureTake(
        deps,
        uploadRequest({ promptVersionId: "v-phantom" }),
      );

      expect(result.state).toBe("refused");
      if (result.state !== "refused") return;
      expect(result.reason).toContain("v-phantom");
      // Nothing stored, nothing written — and above all, the phantom version
      // was NOT conjured into being from the session's current text.
      expect(mediaStore.calls).toHaveLength(0);
      expect(store.mutate).not.toHaveBeenCalled();
      const versionIds = (store.current().prompt?.versions ?? []).map(
        (version) => version.versionId,
      );
      expect(versionIds).toEqual(["v1", "v2"]);
    });

    it("validates upload, sketch and studio-image inputs for kind without requiring session membership", async () => {
      const { store, deps } = setup();

      // None of these references is a node in the session, and none needs to
      // be: they are recorded provenance, not the one drawn edge.
      const result = await admitPictureTake(
        deps,
        uploadRequest({
          origin: "upload",
          sourceInputs: [
            { kind: "sketch", assetId: "snap-x", storagePath: "p/snap-x" },
            { kind: "studio-image", storagePath: "p/studio-x" },
          ],
          displayAncestorGenerationId: null,
        }),
      );

      expect(result.state).toBe("admitted");
      if (result.state !== "admitted") return;
      const record = takesIn(store, "v1")[0] as {
        sourceInputs: Array<{ kind: string }>;
      };
      // Both provided inputs are recorded, plus the appended upload media.
      expect(record.sourceInputs.map((input) => input.kind)).toEqual([
        "sketch",
        "studio-image",
        "upload",
      ]);
    });

    it("refuses a media source input that carries no durable handle", async () => {
      const { mediaStore, deps } = setup();

      const result = await admitPictureTake(
        deps,
        uploadRequest({
          origin: "upload",
          // A studio-image reference with neither an assetId nor a storagePath
          // points at no owned bytes — a mislabelled reference, refused.
          sourceInputs: [{ kind: "studio-image" }],
          displayAncestorGenerationId: null,
        }),
      );

      expect(result.state).toBe("refused");
      if (result.state !== "refused") return;
      expect(result.reason).toContain("durable media handle");
      expect(mediaStore.calls).toHaveLength(0);
    });

    it("replays a successful acceptance unchanged even after its display ancestor was archived", async () => {
      const store = createSessionStore(
        sessionWith([pictureTakeRecord("gen-parent")]),
      );
      const { mediaStore, deps } = setup(store);

      const request = uploadRequest({
        origin: "studio",
        productionProvenance: {
          state: "known",
          instruction: "warm the light",
          model: "flux-kontext",
        },
        sourceInputs: [{ kind: "take", generationId: "gen-parent" }],
        displayAncestorGenerationId: "gen-parent",
      });

      const first = await admitPictureTake(deps, request);
      expect(first.state).toBe("admitted");
      if (first.state !== "admitted") return;

      // The source picture is archived AFTER the acceptance succeeded. Initial
      // validation is over; a replay must not re-run it and make the accepted
      // take vanish or rewrite its history.
      await store.save(archiveGenerationIn(store.current(), "gen-parent"));

      const replay = await admitPictureTake(deps, request);

      expect(replay.state).toBe("admitted");
      if (replay.state !== "admitted") return;
      expect(replay.replayed).toBe(true);
      expect(replay.take.generationId).toBe(first.take.generationId);
      // The original edge stands, unchanged, and nothing was stored twice.
      expect(replay.take.record.ancestorGenerationId).toBe("gen-parent");
      expect(mediaStore.calls).toHaveLength(1);
    });
  });

  /**
   * Issue #128 — an interrupted acceptance resumes as the SAME take.
   *
   * Admission today runs claim → store → mint identity → attach → record the
   * completed response. The completion snapshot is now written BEFORE the
   * append too, with the attachment still `pending`, so it is the durable resume
   * record: identity and media survive each step, and a crash re-attaches THIS
   * take rather than storing new bytes and minting a second one. The idempotency
   * record is the authoritative owner of the attachment state — a replay reads
   * the CURRENT outcome, not the attempt that first settled it.
   *
   * These are user-data / identity paths, so every failure-injection case is a
   * mandatory negative path. The seam is the idempotency store: the fake below
   * models the concrete `RequestIdempotencyService` (pending / completed /
   * failed, a pending lock that expires, `replay` once a snapshot exists) and
   * can inject a crash at a chosen completion write — `before` loses the write,
   * `after` persists it and then the process dies. No internal module is mocked;
   * the real `SessionService` runs over the in-memory store double, so "exactly
   * one take" is asserted against the real upsert-by-id append.
   */
  describe("resumption after an interrupted acceptance (issue #128)", () => {
    interface ResumeCrash {
      /** 1-based index of the completion write (`markCompleted`) to fail. */
      call: number;
      /** `before` loses the write; `after` persists it, then the worker dies. */
      mode: "before" | "after";
    }

    type ResumableIdempotency = AdmissionIdempotencyPort & {
      clock: { now: number };
      /** The body of the single persisted snapshot, for identity assertions. */
      peekBody(): Record<string, unknown> | undefined;
    };

    function createResumableIdempotency(
      opts: { crash?: ResumeCrash; pendingLockTtlMs?: number } = {},
    ): ResumableIdempotency {
      const ttl = opts.pendingLockTtlMs ?? 6 * 60 * 1000;
      const clock = { now: 1_000_000 };
      const records = new Map<
        string,
        {
          payloadHash: string;
          status: "pending" | "completed" | "failed";
          lockExpiresAtMs: number;
          snapshot?: { statusCode: number; body: Record<string, unknown> };
        }
      >();
      let markCompletedCalls = 0;
      return {
        clock,
        peekBody: () => [...records.values()][0]?.snapshot?.body,
        claimRequest: async ({ userId, route, key, payload }) => {
          const recordId = `${userId}|${route}|${key}`;
          const payloadHash = JSON.stringify(payload);
          const existing = records.get(recordId);
          if (!existing) {
            records.set(recordId, {
              payloadHash,
              status: "pending",
              lockExpiresAtMs: clock.now + ttl,
            });
            return { state: "claimed", recordId };
          }
          if (existing.payloadHash !== payloadHash) {
            return { state: "conflict", recordId };
          }
          if (existing.status === "completed" && existing.snapshot) {
            return { state: "replay", recordId, snapshot: existing.snapshot };
          }
          if (
            existing.status === "pending" &&
            existing.lockExpiresAtMs > clock.now
          ) {
            return { state: "in_progress", recordId };
          }
          // An expired pending claim (or a failed one) is re-claimed fresh by
          // the concrete service — a RESTART. Nothing reaches here once a resume
          // snapshot exists, because that flips the record to `completed` above.
          records.set(recordId, {
            payloadHash,
            status: "pending",
            lockExpiresAtMs: clock.now + ttl,
          });
          return { state: "claimed", recordId };
        },
        markCompleted: async ({ recordId, snapshot }) => {
          markCompletedCalls += 1;
          const failing = opts.crash?.call === markCompletedCalls;
          if (failing && opts.crash?.mode === "before") {
            throw new Error("crash: completion write never landed");
          }
          const existing = records.get(recordId);
          if (existing) {
            records.set(recordId, {
              ...existing,
              status: "completed",
              snapshot,
              lockExpiresAtMs: clock.now,
            });
          }
          if (failing && opts.crash?.mode === "after") {
            throw new Error(
              "crash: process died just after the completion write",
            );
          }
        },
        markFailed: async (recordId) => {
          const existing = records.get(recordId);
          if (existing) {
            records.set(recordId, {
              ...existing,
              status: "failed",
              lockExpiresAtMs: clock.now - 1,
            });
          }
        },
      };
    }

    function setupResumable(
      idempotency: ResumableIdempotency,
      store = createSessionStore(),
    ): {
      store: ReturnType<typeof createSessionStore>;
      mediaStore: ReturnType<typeof createMediaStore>;
      idempotency: ResumableIdempotency;
      deps: AdmitPictureTakeDependencies;
    } {
      const mediaStore = createMediaStore();
      const sessionService = new SessionService(store as never);
      return {
        store,
        mediaStore,
        idempotency,
        deps: { sessionService, mediaStore, idempotency },
      };
    }

    it("resumes after a crash following media storage: reuses the stored asset and mints no second take", async () => {
      // The bytes land and the pending take is checkpointed; then the worker
      // dies before the append.
      const idempotency = createResumableIdempotency({
        crash: { call: 1, mode: "after" },
      });
      const { store, mediaStore, deps } = setupResumable(idempotency);

      await expect(admitPictureTake(deps, uploadRequest())).rejects.toThrow(
        "completion write",
      );
      expect(mediaStore.calls).toHaveLength(1);

      // The worker restarts; the client retries the same admission.
      const resumed = await admitPictureTake(deps, uploadRequest());

      expect(resumed.state).toBe("admitted");
      if (resumed.state !== "admitted") return;
      expect(resumed.replayed).toBe(true);
      expect(resumed.take.attachment.state).toBe("attached");
      // No second store, exactly one take, under the SAME identity.
      expect(mediaStore.calls).toHaveLength(1);
      const takes = takesIn(store, "v1");
      expect(takes).toHaveLength(1);
      expect((takes[0] as { id?: string }).id).toBe(resumed.take.generationId);
    });

    it("resumes to the SAME take identity established before the append", async () => {
      const idempotency = createResumableIdempotency({
        crash: { call: 1, mode: "after" },
      });
      const { mediaStore, deps } = setupResumable(idempotency);

      await expect(admitPictureTake(deps, uploadRequest())).rejects.toThrow();
      // The identity was persisted with the pending checkpoint, before the
      // append — so the resume reuses it rather than minting a second one.
      const persisted = idempotency.peekBody() as
        | { generationId?: string }
        | undefined;
      expect(typeof persisted?.generationId).toBe("string");

      const resumed = await admitPictureTake(deps, uploadRequest());

      expect(resumed.state).toBe("admitted");
      if (resumed.state !== "admitted") return;
      expect(resumed.take.generationId).toBe(persisted?.generationId);
      expect(mediaStore.calls).toHaveLength(1);
    });

    it("a failed completion write after a successful append never creates a second take", async () => {
      // The append LANDS in the session; the completion write is then lost and
      // the process dies. This is the case the ticket names explicitly.
      const idempotency = createResumableIdempotency({
        crash: { call: 2, mode: "before" },
      });
      const { store, mediaStore, deps } = setupResumable(idempotency);

      await expect(admitPictureTake(deps, uploadRequest())).rejects.toThrow(
        "completion write",
      );
      // The take reached its session before the crash.
      expect(takesIn(store, "v1")).toHaveLength(1);

      const resumed = await admitPictureTake(deps, uploadRequest());

      expect(resumed.state).toBe("admitted");
      if (resumed.state !== "admitted") return;
      expect(resumed.replayed).toBe(true);
      expect(resumed.take.attachment.state).toBe("attached");
      // The de-duplicating append leaves ONE take; nothing was re-stored.
      expect(takesIn(store, "v1")).toHaveLength(1);
      expect(mediaStore.calls).toHaveLength(1);
    });

    it("resumes after a crash following the completion write by replaying the finished take", async () => {
      // Store, append and completion write all land; THEN the process dies
      // before the response is returned.
      const idempotency = createResumableIdempotency({
        crash: { call: 2, mode: "after" },
      });
      const { store, mediaStore, deps } = setupResumable(idempotency);

      await expect(admitPictureTake(deps, uploadRequest())).rejects.toThrow();
      expect(takesIn(store, "v1")).toHaveLength(1);

      const resumed = await admitPictureTake(deps, uploadRequest());

      expect(resumed.state).toBe("admitted");
      if (resumed.state !== "admitted") return;
      expect(resumed.replayed).toBe(true);
      expect(resumed.take.attachment.state).toBe("attached");
      expect(takesIn(store, "v1")).toHaveLength(1);
      expect(mediaStore.calls).toHaveLength(1);
    });

    it("an expired pending claim resumes rather than restarting the admission", async () => {
      const idempotency = createResumableIdempotency({
        crash: { call: 1, mode: "after" },
      });
      const { store, mediaStore, deps } = setupResumable(idempotency);

      await expect(admitPictureTake(deps, uploadRequest())).rejects.toThrow();
      expect(mediaStore.calls).toHaveLength(1);

      // Long past the six-minute pending lock. Before this ticket the reclaim
      // was a fresh `claimed` — a restart that re-stored the bytes and minted a
      // second take. The persisted resume snapshot makes it a replay instead;
      // the only window that can still re-store is a crash BEFORE this
      // checkpoint, the ambiguous external outcome the ticket declines to
      // promise away.
      idempotency.clock.now += 7 * 60 * 1000;

      const resumed = await admitPictureTake(deps, uploadRequest());

      expect(resumed.state).toBe("admitted");
      if (resumed.state !== "admitted") return;
      expect(resumed.replayed).toBe(true);
      expect(mediaStore.calls).toHaveLength(1);
      expect(takesIn(store, "v1")).toHaveLength(1);
    });

    it("a receipt replayed after a later successful attachment repair reports attached, not the stale failure", async () => {
      const idempotency = createResumableIdempotency();
      const store = createSessionStore();
      // The first append fails; the store recovers for the retry.
      store.mutate.mockRejectedValueOnce(new Error("firestore unavailable"));
      const { mediaStore, deps } = setupResumable(idempotency, store);

      const first = await admitPictureTake(deps, uploadRequest());
      expect(first.state).toBe("admitted");
      if (first.state !== "admitted") return;
      // Made but not saved (ADR-0022 decision 6).
      expect(first.take.attachment.state).toBe("failed");

      // The repair: the same admission, retried once the store is healthy,
      // re-attaches the SAME record and settles the authoritative outcome.
      const repaired = await admitPictureTake(deps, uploadRequest());
      expect(repaired.state).toBe("admitted");
      if (repaired.state !== "admitted") return;
      expect(repaired.take.attachment.state).toBe("attached");

      // A later receipt replay reads the CURRENT outcome, not the stale failure.
      const receipt = await admitPictureTake(deps, uploadRequest());
      expect(receipt.state).toBe("admitted");
      if (receipt.state !== "admitted") return;
      expect(receipt.replayed).toBe(true);
      expect(receipt.take.attachment.state).toBe("attached");

      expect(takesIn(store, "v1")).toHaveLength(1);
      expect(mediaStore.calls).toHaveLength(1);
    });
  });
});
