import { describe, it, expect, vi } from "vitest";
import { SignedUrlMinter } from "@infrastructure/signedUrl/SignedUrlMinter";
import { GcsVideoAssetStore } from "../GcsVideoAssetStore";

/**
 * Pin for the paid-content durability invariant (owner directive: "a user
 * should never not be able to view and act upon any generated content they
 * pay for").
 *
 * The 24h retention sweeper (VideoAssetRetentionService → cleanupExpired)
 * exists to clean the STAGING namespace where providers first drop renders
 * (video-previews/). The durable copies users keep live under
 * users/{uid}/generations/… and must be unreachable by the sweeper — by
 * construction, not by luck: the listing is scoped to the store's own
 * basePath prefix.
 *
 * This pins that confinement against the tempting future refactor of
 * widening the listing ("sweep everything old") — which would silently
 * delete every user's paid clips a day after render.
 */

describe("regression: the retention sweep is confined to the staging namespace", () => {
  it("lists only under the store's own basePath prefix", async () => {
    const getFiles = vi.fn().mockResolvedValue([[]]);
    const store = new GcsVideoAssetStore({
      bucket: { getFiles, file: vi.fn() } as unknown as never,
      minter: new SignedUrlMinter({ file: vi.fn() } as unknown as never),
      basePath: "video-previews",
      signedUrlTtlMs: 3_600_000,
      cacheControl: "public",
    });

    await store.cleanupExpired(Date.now() - 24 * 3600 * 1000, 100);

    expect(getFiles).toHaveBeenCalledTimes(1);
    expect(getFiles).toHaveBeenCalledWith({ prefix: "video-previews/" });
  });

  it("deletes nothing when given a non-positive cutoff", async () => {
    const getFiles = vi.fn();
    const store = new GcsVideoAssetStore({
      bucket: { getFiles, file: vi.fn() } as unknown as never,
      minter: new SignedUrlMinter({ file: vi.fn() } as unknown as never),
      basePath: "video-previews",
      signedUrlTtlMs: 3_600_000,
      cacheControl: "public",
    });

    const deleted = await store.cleanupExpired(0, 100);

    expect(deleted).toBe(0);
    expect(getFiles).not.toHaveBeenCalled();
  });
});
