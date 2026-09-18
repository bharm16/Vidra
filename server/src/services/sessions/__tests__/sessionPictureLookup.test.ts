import { describe, it, expect, vi } from "vitest";
import {
  createSessionPictureLookup,
  type OwnedSessionReader,
} from "../sessionPictureLookup";
import {
  SessionAccessDeniedError,
  SessionNotFoundError,
} from "../SessionService";
import type { SessionRecord } from "@server/domain/session/types";

/**
 * The read half of the studio bridge (issue #88, ADR-0022 decision 4): which
 * picture the creator invoked "Refine in the studio" on, and the durable
 * handle to its media.
 *
 * It is a READ. The session is the source of truth for the words-version a
 * take is filed under, so the bridge resolves that here rather than trusting a
 * client-supplied one — and it writes nothing, because opening the studio must
 * never mutate the source take or its paired words.
 */

function sessionWith(
  overrides?: Partial<SessionRecord>,
): SessionRecord & { prompt: NonNullable<SessionRecord["prompt"]> } {
  return {
    id: "session-1",
    userId: "user-1",
    status: "active",
    createdAt: new Date("2026-09-17T10:00:00Z"),
    updatedAt: new Date("2026-09-17T10:00:00Z"),
    prompt: {
      input: "a lighthouse",
      output: "a lighthouse at dusk, wide shot",
      versions: [
        {
          versionId: "v1",
          signature: "sig-1",
          prompt: "a lighthouse at dusk, wide shot",
          timestamp: "2026-09-17T10:00:00Z",
          generations: [
            {
              id: "take-1",
              mediaType: "image",
              status: "completed",
              prompt: "a lighthouse at dusk, wide shot",
              promptVersionId: "v1",
              mediaUrls: ["https://signed.example.com/expiring.webp"],
              mediaAssetIds: ["1758100000000-abcdef01.webp"],
              ancestorGenerationId: null,
              origin: "generated",
            },
          ],
        },
      ],
    },
    ...overrides,
  } as SessionRecord & { prompt: NonNullable<SessionRecord["prompt"]> };
}

function readerFor(session: SessionRecord): OwnedSessionReader & {
  requireOwnedSession: ReturnType<typeof vi.fn>;
} {
  return {
    requireOwnedSession: vi
      .fn()
      .mockImplementation(async (userId: string, sessionId: string) => {
        if (sessionId !== session.id) {
          throw new SessionNotFoundError(sessionId);
        }
        if (session.userId !== userId) {
          throw new SessionAccessDeniedError(sessionId, userId, session.userId);
        }
        return session;
      }),
  };
}

describe("session picture lookup (studio bridge, issue #88)", () => {
  it("resolves the take's words-version and a durable storage path", async () => {
    const session = sessionWith();
    const lookup = createSessionPictureLookup(readerFor(session));

    const picture = await lookup.findOwnedSessionPicture(
      "user-1",
      "session-1",
      "take-1",
    );

    expect(picture).toEqual({
      promptVersionId: "v1",
      generationId: "take-1",
      // Rebuilt from the asset basename session records carry, so the bridge
      // never depends on the record's (expiring) mediaUrls.
      storagePath: "users/user-1/previews/images/1758100000000-abcdef01.webp",
      assetId: "1758100000000-abcdef01.webp",
    });
  });

  it("prefers an explicitly recorded storagePath (admitted takes)", async () => {
    const session = sessionWith();
    const take = session.prompt.versions?.[0]?.generations?.[0] as Record<
      string,
      unknown
    >;
    take.storagePath = "users/user-1/previews/images/admitted.webp";
    const lookup = createSessionPictureLookup(readerFor(session));

    const picture = await lookup.findOwnedSessionPicture(
      "user-1",
      "session-1",
      "take-1",
    );

    expect(picture?.storagePath).toBe(
      "users/user-1/previews/images/admitted.webp",
    );
  });

  it("refuses a take the creator does not own, and reads nothing further", async () => {
    const session = sessionWith({ userId: "someone-else" });
    const reader = readerFor(session);
    const lookup = createSessionPictureLookup(reader);

    const picture = await lookup.findOwnedSessionPicture(
      "intruder",
      "session-1",
      "take-1",
    );

    // Refusal reads as absence — the studio's own ownership posture, so a
    // foreign session id never becomes an existence oracle.
    expect(picture).toBeNull();
    expect(reader.requireOwnedSession).toHaveBeenCalledWith(
      "intruder",
      "session-1",
    );
  });

  it("returns null for a clip, and for a generation this session does not hold", async () => {
    const session = sessionWith();
    const clip = {
      id: "clip-1",
      mediaType: "video",
      status: "completed",
      prompt: "a lighthouse at dusk, wide shot",
      promptVersionId: "v1",
      mediaUrls: ["https://signed.example.com/clip.mp4"],
      mediaAssetIds: ["1758100000001-beef.mp4"],
      ancestorGenerationId: "take-1",
    };
    session.prompt.versions?.[0]?.generations?.push(clip);
    const lookup = createSessionPictureLookup(readerFor(session));

    expect(
      await lookup.findOwnedSessionPicture("user-1", "session-1", "clip-1"),
    ).toBeNull();
    expect(
      await lookup.findOwnedSessionPicture("user-1", "session-1", "nope"),
    ).toBeNull();
  });

  it("leaves the source take and its words untouched", async () => {
    const session = sessionWith();
    const before = JSON.stringify(session);
    const lookup = createSessionPictureLookup(readerFor(session));

    await lookup.findOwnedSessionPicture("user-1", "session-1", "take-1");

    expect(JSON.stringify(session)).toBe(before);
  });
});
