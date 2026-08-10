import { describe, expect, it, vi } from "vitest";
import { SignedUrlMinter } from "@infrastructure/signedUrl/SignedUrlMinter";
import { GcsImageAssetStore } from "../GcsImageAssetStore";

/**
 * Regression: an assetId is not a capability.
 *
 * `getPublicUrl`/`exists` used to fall back to an unscoped legacy path
 * ({basePath}/{assetId}, no owner segment) when the caller's own path missed.
 * assetId arrives straight from `req.query.assetId` on the image-asset view
 * route, so any authenticated user who learned another user's legacy assetId
 * — from a log line, a shared link, an exported session — was handed a signed
 * URL for that image.
 *
 * Ownership must come from the path the requester's own uid builds, with no
 * second lookup that drops it. LocalImageAssetStore never had the fallback,
 * so the two adapters at this seam now agree.
 */

const BASE_PATH = "image-previews";

/** A bucket where only the listed object paths exist. */
const bucketWithObjects = (
  present: string[],
): { name: string; file: (path: string) => unknown } => {
  const existing = new Set(present);
  return {
    name: "test-bucket",
    file: vi.fn((objectPath: string) => ({
      name: objectPath,
      exists: vi.fn().mockResolvedValue([existing.has(objectPath)]),
      getSignedUrl: vi
        .fn()
        .mockResolvedValue([
          `https://storage.googleapis.com/test-bucket/${objectPath}?X-Goog-Signature=sig`,
        ]),
    })),
  };
};

const storeOver = (bucket: ReturnType<typeof bucketWithObjects>) =>
  new GcsImageAssetStore({
    bucket: bucket as never,
    minter: new SignedUrlMinter(bucket as never),
    basePath: BASE_PATH,
    signedUrlTtlMs: 3_600_000,
    cacheControl: "public",
  });

describe("regression: image assets resolve only under their owner's path", () => {
  it("refuses an unscoped legacy object rather than signing it for whoever asks", async () => {
    // The exact shape the migration was written for: an object sitting at the
    // pre-userId path, with nothing under the requester's own prefix.
    const store = storeOver(bucketWithObjects([`${BASE_PATH}/asset-42`]));

    await expect(store.getPublicUrl("asset-42", "user-b")).resolves.toBeNull();
    await expect(store.exists("asset-42", "user-b")).resolves.toBe(false);
  });

  it("does not hand one user a URL for another user's asset", async () => {
    const store = storeOver(
      bucketWithObjects([`${BASE_PATH}/user-a/asset-42`]),
    );

    await expect(store.getPublicUrl("asset-42", "user-b")).resolves.toBeNull();
    await expect(store.exists("asset-42", "user-b")).resolves.toBe(false);
  });

  it("still resolves the asset for its actual owner", async () => {
    const store = storeOver(
      bucketWithObjects([`${BASE_PATH}/user-a/asset-42`]),
    );

    await expect(store.getPublicUrl("asset-42", "user-a")).resolves.toContain(
      `${BASE_PATH}/user-a/asset-42`,
    );
    await expect(store.exists("asset-42", "user-a")).resolves.toBe(true);
  });
});
