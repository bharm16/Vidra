import { describe, it, expect, vi } from "vitest";
import { StorageService } from "@services/storage/StorageService";
import { refreshOwnedMediaUrls } from "../refreshOwnedMediaUrls";

/**
 * Regression: a restored session's generation handed a dead signed URL to the
 * video provider.
 *
 * Session records persist signed media URLs (the armed start frame above
 * all). Their signatures die after ~1h, and the generation intake forwarded
 * them verbatim — so "Make it" on a session reopened the next day failed at
 * the provider's image fetch. The client's keyframe-refresh loop narrows the
 * window but cannot close it (a submit can race the refresh).
 *
 * Invariant: every signed URL on OUR bucket under the requester's own
 * users/{uid}/ namespace reaches intake as a freshly minted grant; foreign,
 * unsigned, or un-owned URLs pass through byte-identical, and a mint failure
 * degrades to the original URL.
 */

const BUCKET = "test-bucket";
const USER = "user-1";
const FRESH_SIGNATURE = "ee".repeat(64);

const staleUrl = (objectPath: string): string =>
  `https://storage.googleapis.com/${BUCKET}/${objectPath}?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Date=20260731T000000Z&X-Goog-Expires=3600&X-Goog-Signature=${"99".repeat(64)}`;

const buildStorageService = (options?: { failSigning?: boolean }) => {
  const getSignedUrl = vi.fn(async () => {
    if (options?.failSigning) {
      throw new Error("signing unavailable");
    }
    return [
      `https://storage.googleapis.com/${BUCKET}/re-signed?X-Goog-Signature=${FRESH_SIGNATURE}`,
    ];
  });
  const mockStorage = {
    bucket: vi.fn().mockReturnValue({
      file: vi.fn(() => ({ getSignedUrl })),
    }),
  };
  const service = new StorageService({
    storage: mockStorage as unknown as never,
    bucketName: BUCKET,
  });
  return { service, getSignedUrl };
};

const context = (service: StorageService) => ({
  userId: USER,
  bucketName: BUCKET,
  storageService: service,
  log: { warn: vi.fn() },
  requestId: "req-1",
});

describe("regression: generation payloads never carry a stale owned grant", () => {
  it("re-mints the requester's own signed start frame", async () => {
    const { service, getSignedUrl } = buildStorageService();
    const ownedPath = `users/${USER}/previews/images/1785500000000-abc.webp`;

    const refreshed = await refreshOwnedMediaUrls(
      { prompt: "p", startImage: staleUrl(ownedPath) },
      context(service),
    );

    expect(refreshed.startImage).toContain(FRESH_SIGNATURE);
    expect(getSignedUrl).toHaveBeenCalled();
  });

  it("re-mints every owned reference image, and end/extend/input URLs", async () => {
    const { service } = buildStorageService();
    const owned = (n: string) =>
      staleUrl(`users/${USER}/previews/images/${n}.webp`);

    const refreshed = await refreshOwnedMediaUrls(
      {
        prompt: "p",
        endImage: owned("end"),
        inputReference: owned("input"),
        extendVideoUrl: staleUrl(`users/${USER}/previews/videos/clip.mp4`),
        referenceImages: [
          { url: owned("ref-1"), type: "asset" },
          { url: "https://example.com/foreign.png", type: "style" },
        ],
      },
      context(service),
    );

    expect(refreshed.endImage).toContain(FRESH_SIGNATURE);
    expect(refreshed.inputReference).toContain(FRESH_SIGNATURE);
    expect(refreshed.extendVideoUrl).toContain(FRESH_SIGNATURE);
    expect(refreshed.referenceImages?.[0]?.url).toContain(FRESH_SIGNATURE);
    // Foreign hosts pass through byte-identical.
    expect(refreshed.referenceImages?.[1]?.url).toBe(
      "https://example.com/foreign.png",
    );
  });

  it("never mints a grant for another user's object", async () => {
    const { service, getSignedUrl } = buildStorageService();
    const foreignOwned = staleUrl(
      "users/someone-else/previews/images/theirs.webp",
    );

    const refreshed = await refreshOwnedMediaUrls(
      { prompt: "p", startImage: foreignOwned },
      context(service),
    );

    expect(refreshed.startImage).toBe(foreignOwned);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it("leaves unsigned our-bucket URLs untouched", async () => {
    const { service, getSignedUrl } = buildStorageService();
    const unsigned = `https://storage.googleapis.com/${BUCKET}/users/${USER}/previews/images/plain.webp`;

    const refreshed = await refreshOwnedMediaUrls(
      { prompt: "p", startImage: unsigned },
      context(service),
    );

    expect(refreshed.startImage).toBe(unsigned);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it("falls back to the original URL when minting fails", async () => {
    const { service } = buildStorageService({ failSigning: true });
    const ownedPath = `users/${USER}/previews/images/1785500000000-abc.webp`;
    const original = staleUrl(ownedPath);

    const refreshed = await refreshOwnedMediaUrls(
      { prompt: "p", startImage: original },
      context(service),
    );

    expect(refreshed.startImage).toBe(original);
  });
});
