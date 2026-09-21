import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  armFirstFrame,
  type ArmFirstFrameDependencies,
} from "../armFirstFrame";
import { SessionService } from "@services/sessions/SessionService";
import type { SessionRecord } from "@services/sessions/types";
import { buildCompletedTakeRecord } from "@services/sessions/takeRecord";

/**
 * Arming an attached take as a session's first frame — issue #136.
 *
 * The one rule this suite pins: an attached-but-not-armed take is repaired by
 * arming the record the session ALREADY holds. The module has no media store
 * and no idempotency port — the missing ports are the proof that a retry can
 * never readmit, re-store, or mint a second take. The identity rule rides
 * every arm: the frame carries the take's generationId and its durable media
 * handle (#125), because a frame armed with only an expiring URL is not a
 * completed handoff.
 *
 * Seam: the real `SessionService` over an in-memory store double. The
 * resolver is the only other boundary, and it is a double.
 */

const OWNER = "creator-1";
const STRANGER = "someone-else";

const TAKE_ID = "take-accepted";
const EXPIRED_URL = "https://storage.example.com/asset-1?sig=dead";
const FRESH_URL = "https://storage.example.com/asset-1?sig=fresh";
const FRAME_WORDS = "an ergonomic desk lamp glowing";
const HANDLE = `image-previews/${OWNER}/asset-1`;

/** A record exactly as the admission boundary wrote it: handle and all. */
function takeRecord(): Record<string, unknown> {
  return buildCompletedTakeRecord({
    id: TAKE_ID,
    model: "fal-ai/z-image/turbo/image-to-image",
    mediaType: "image",
    prompt: FRAME_WORDS,
    promptVersionId: "v-root",
    mediaUrls: [EXPIRED_URL],
    mediaAssetIds: ["asset-1"],
    thumbnailUrl: EXPIRED_URL,
    storagePath: HANDLE,
    origin: "sketchpad",
    ancestorGenerationId: null,
  }) as Record<string, unknown>;
}

function seedSession(prompt: SessionRecord["prompt"]): SessionRecord {
  return {
    id: "session-1",
    userId: OWNER,
    status: "active",
    createdAt: new Date("2026-09-17T00:00:00.000Z"),
    updatedAt: new Date("2026-09-17T00:00:00.000Z"),
    hasContinuity: false,
    ...(prompt ? { prompt } : {}),
  };
}

function sessionWithTake(record: Record<string, unknown>): SessionRecord["prompt"] {
  return {
    input: FRAME_WORDS,
    output: FRAME_WORDS,
    uuid: "uuid-1",
    versions: [
      {
        versionId: "v-root",
        label: "v1",
        signature: "sig-1",
        prompt: FRAME_WORDS,
        timestamp: "2026-09-17T00:00:00.000Z",
        generations: [record],
      },
    ],
  };
}

/** Stands in for Firestore, across every session this suite creates. */
function createSessionStore(initial: SessionRecord[]) {
  const sessions = new Map<string, SessionRecord>();
  for (const record of initial) sessions.set(record.id, record);
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
  };
}

describe("armFirstFrame (issue #136)", () => {
  let store: ReturnType<typeof createSessionStore>;

  beforeEach(() => {
    store = createSessionStore([seedSession(sessionWithTake(takeRecord()))]);
  });

  function depsWith(
    resolver?: ArmFirstFrameDependencies["resolver"],
  ): ArmFirstFrameDependencies {
    return {
      sessionService: new SessionService(store as never),
      ...(resolver ? { resolver } : {}),
    };
  }

  it("arms the attached take from its own persisted record, with the take identity and its durable handle", async () => {
    const resolver = {
      resolveOwnedPicture: vi.fn().mockResolvedValue({
        storagePath: HANDLE,
        viewUrl: FRESH_URL,
      }),
    };

    const result = await armFirstFrame(depsWith(resolver), {
      userId: OWNER,
      sessionId: "session-1",
      generationId: TAKE_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // keyframes[0] IS the armed first frame (ADR-0011 D4) — what a reopened
    // session restores. It names the exact accepted take...
    expect(result.frame.generationId).toBe(TAKE_ID);
    expect(result.frame.id).toBe(TAKE_ID);
    // ...carries the durable handle that outlives the URL (#125)...
    expect(result.frame.storagePath).toBe(HANDLE);
    expect(result.frame.assetId).toBe("asset-1");
    // ...and its URL was re-minted from that handle, not replayed expired.
    expect(result.frame.url).toBe(FRESH_URL);
    expect(resolver.resolveOwnedPicture).toHaveBeenCalledWith(OWNER, {
      storagePath: HANDLE,
      assetId: "asset-1",
    });

    // The write landed: the persisted session's keyframes[0] is the frame.
    const persisted = store.sessions.get("session-1");
    const armed = persisted?.prompt?.keyframes?.[0];
    expect(armed?.generationId).toBe(TAKE_ID);
    expect(armed?.storagePath).toBe(HANDLE);
    // The frame's words are the take's ASSOCIATED words (ADR-0022 decision 2).
    expect(armed?.sourcePrompt).toBe(FRAME_WORDS);
  });

  it("is strictly a repair: no media store, no idempotency port, one take before and after", async () => {
    await armFirstFrame(depsWith(), {
      userId: OWNER,
      sessionId: "session-1",
      generationId: TAKE_ID,
    });

    const persisted = store.sessions.get("session-1");
    const takes = persisted?.prompt?.versions?.[0]?.generations ?? [];
    expect(takes).toHaveLength(1);
    // The take's record is untouched — the arm only writes keyframes.
    expect((takes[0] as { id: string }).id).toBe(TAKE_ID);
  });

  it("refuses a take that is not in the session, leaving nothing written — the attachment retry owns that debt", async () => {
    const result = await armFirstFrame(depsWith(), {
      userId: OWNER,
      sessionId: "session-1",
      generationId: "take-never-attached",
    });

    expect(result).toEqual({
      ok: false,
      reason: "that picture is not saved in this session yet",
    });
    expect(store.sessions.get("session-1")?.prompt?.keyframes).toBeUndefined();
  });

  it("refuses to arm a record with no durable handle — an expired-URL-only arm is not a completed handoff", async () => {
    const urlOnly = { ...takeRecord() };
    delete urlOnly.storagePath;
    delete urlOnly.mediaAssetIds;
    store.sessions.set("session-1", seedSession(sessionWithTake(urlOnly)));

    const result = await armFirstFrame(depsWith(), {
      userId: OWNER,
      sessionId: "session-1",
      generationId: TAKE_ID,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("durable media handle");
    expect(store.sessions.get("session-1")?.prompt?.keyframes).toBeUndefined();
  });

  it("refuses a clip — only a picture can be the first frame", async () => {
    const clip = {
      ...takeRecord(),
      mediaType: "video",
      storagePath: `users/${OWNER}/previews/videos/clip-1.mp4`,
    };
    store.sessions.set("session-1", seedSession(sessionWithTake(clip)));

    const result = await armFirstFrame(depsWith(), {
      userId: OWNER,
      sessionId: "session-1",
      generationId: TAKE_ID,
    });

    expect(result).toEqual({
      ok: false,
      reason: "only a picture can be the first frame",
    });
  });

  it("answers a foreign session as a refusal, not a write", async () => {
    store.sessions.set("session-1", {
      ...seedSession(sessionWithTake(takeRecord())),
      userId: STRANGER,
    });

    const result = await armFirstFrame(depsWith(), {
      userId: OWNER,
      sessionId: "session-1",
      generationId: TAKE_ID,
    });

    expect(result.ok).toBe(false);
    expect(store.sessions.get("session-1")?.prompt?.keyframes).toBeUndefined();
  });

  it("degrades to the stored URL when the resolver is absent — the handle still rides the frame", async () => {
    const result = await armFirstFrame(depsWith(), {
      userId: OWNER,
      sessionId: "session-1",
      generationId: TAKE_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.frame.url).toBe(EXPIRED_URL);
    expect(result.frame.storagePath).toBe(HANDLE);
    expect(result.frame.assetId).toBe("asset-1");
  });

  it("degrades to the stored URL when the resolver refuses, and still arms", async () => {
    const resolver = {
      resolveOwnedPicture: vi.fn().mockResolvedValue(null),
    };

    const result = await armFirstFrame(depsWith(resolver), {
      userId: OWNER,
      sessionId: "session-1",
      generationId: TAKE_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.frame.url).toBe(EXPIRED_URL);
  });
});
