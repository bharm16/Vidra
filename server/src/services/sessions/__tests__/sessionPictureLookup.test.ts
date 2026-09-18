import { describe, it, expect, vi } from "vitest";
import {
  createSessionPictureLookup,
  type OwnedSessionReader,
} from "../sessionPictureLookup";
import {
  SessionAccessDeniedError,
  SessionNotFoundError,
} from "../SessionService";
import type {
  OwnedPictureResolver,
  ResolvedOwnedPicture,
} from "@services/owned-media";
import type { SessionRecord } from "@server/domain/session/types";

/**
 * The read half of the studio bridge (issue #88, ADR-0022 decision 4): which
 * picture the creator invoked "Refine in the studio" on, and the durable
 * handle to its media.
 *
 * It is a READ. The session is the source of truth for the words-version a
 * take is filed under, so the bridge resolves that here rather than trusting a
 * client-supplied one — and it writes nothing, because opening the studio must
 * never mutate the source take or its paired words. The media handle itself is
 * resolved through the shared owner-checked resolver (issue #109), so this read
 * asserts the delegation, not the resolver's own store logic.
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

function resolverReturning(
  result: ResolvedOwnedPicture | null,
): OwnedPictureResolver & { resolveOwnedPicture: ReturnType<typeof vi.fn> } {
  return { resolveOwnedPicture: vi.fn().mockResolvedValue(result) };
}

describe("session picture lookup (studio bridge, issue #88)", () => {
  it("resolves the take's words-version and the resolver's owned media handle", async () => {
    const session = sessionWith();
    const resolver = resolverReturning({
      storagePath: "users/user-1/previews/images/1758100000000-abcdef01.webp",
      viewUrl: "https://signed.example.com/owned.webp?exp=1h",
    });
    const lookup = createSessionPictureLookup(readerFor(session), resolver);

    const picture = await lookup.findOwnedSessionPicture(
      "user-1",
      "session-1",
      "take-1",
    );

    // A generated take carries only an asset basename; the raw handle — no
    // path — is what the resolver receives, and the resolver's output is what
    // the lookup returns.
    expect(resolver.resolveOwnedPicture).toHaveBeenCalledWith("user-1", {
      storagePath: undefined,
      assetId: "1758100000000-abcdef01.webp",
    });
    expect(picture).toEqual({
      promptVersionId: "v1",
      generationId: "take-1",
      storagePath: "users/user-1/previews/images/1758100000000-abcdef01.webp",
      viewUrl: "https://signed.example.com/owned.webp?exp=1h",
      assetId: "1758100000000-abcdef01.webp",
    });
  });

  it("hands an admitted take's recorded image-previews path to the resolver", async () => {
    const session = sessionWith();
    const take = session.prompt.versions?.[0]?.generations?.[0] as Record<
      string,
      unknown
    >;
    // The production image store's namespace — the very path the old bridge's
    // `users/<uid>/` ownership check rejected (issue #109).
    take.storagePath = "image-previews/user-1/1f2e3d4c5b6a";
    take.mediaAssetIds = ["1f2e3d4c5b6a"];
    const resolver = resolverReturning({
      storagePath: "image-previews/user-1/1f2e3d4c5b6a",
      viewUrl: "https://signed.example.com/image-previews.webp?exp=1h",
    });
    const lookup = createSessionPictureLookup(readerFor(session), resolver);

    const picture = await lookup.findOwnedSessionPicture(
      "user-1",
      "session-1",
      "take-1",
    );

    expect(resolver.resolveOwnedPicture).toHaveBeenCalledWith("user-1", {
      storagePath: "image-previews/user-1/1f2e3d4c5b6a",
      assetId: "1f2e3d4c5b6a",
    });
    expect(picture?.storagePath).toBe("image-previews/user-1/1f2e3d4c5b6a");
    expect(picture?.viewUrl).toBe(
      "https://signed.example.com/image-previews.webp?exp=1h",
    );
  });

  it("refuses a take the creator does not own, and reads nothing further", async () => {
    const session = sessionWith({ userId: "someone-else" });
    const reader = readerFor(session);
    const resolver = resolverReturning({
      storagePath: "users/someone-else/previews/images/x.webp",
      viewUrl: "https://signed.example.com/x.webp",
    });
    const lookup = createSessionPictureLookup(reader, resolver);

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
    // The session was foreign, so the media was never even resolved.
    expect(resolver.resolveOwnedPicture).not.toHaveBeenCalled();
  });

  it("returns null when the resolver cannot prove owned durable media", async () => {
    const session = sessionWith();
    const resolver = resolverReturning(null);
    const lookup = createSessionPictureLookup(readerFor(session), resolver);

    const picture = await lookup.findOwnedSessionPicture(
      "user-1",
      "session-1",
      "take-1",
    );

    expect(picture).toBeNull();
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
    const resolver = resolverReturning({
      storagePath: "users/user-1/previews/images/x.webp",
      viewUrl: "https://signed.example.com/x.webp",
    });
    const lookup = createSessionPictureLookup(readerFor(session), resolver);

    expect(
      await lookup.findOwnedSessionPicture("user-1", "session-1", "clip-1"),
    ).toBeNull();
    expect(
      await lookup.findOwnedSessionPicture("user-1", "session-1", "nope"),
    ).toBeNull();
    // A clip is never resolved as a picture, and neither is a missing take.
    expect(resolver.resolveOwnedPicture).not.toHaveBeenCalled();
  });

  it("leaves the source take and its words untouched", async () => {
    const session = sessionWith();
    const before = JSON.stringify(session);
    const resolver = resolverReturning({
      storagePath: "users/user-1/previews/images/1758100000000-abcdef01.webp",
      viewUrl: "https://signed.example.com/owned.webp",
    });
    const lookup = createSessionPictureLookup(readerFor(session), resolver);

    await lookup.findOwnedSessionPicture("user-1", "session-1", "take-1");

    expect(JSON.stringify(session)).toBe(before);
  });
});
