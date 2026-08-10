import { describe, it, expect } from "vitest";
import { SignedUrlLedger } from "../SignedUrlLedger";
import { SignedUrlMinter } from "../SignedUrlMinter";
import { createFakeBucket, SIGNATURE } from "./fakeGcsSigning";
import { SignedUrlService } from "@services/storage/services/SignedUrlService";
import { GcsImageAssetStore } from "@services/image-generation/storage/GcsImageAssetStore";
import { GcsVideoAssetStore } from "@services/video-generation/storage/GcsVideoAssetStore";
import { GCSStorageService } from "@services/convergence/storage/StorageService";

/**
 * Regression companion to the media-proxy rescue hardening: the rescue only
 * honors grants on the signed-URL ledger, so every mint site must record —
 * otherwise freshly minted URLs lose their rescue and media goes dark at
 * signed-URL expiry (the exact failure the ledger exists to prevent).
 *
 * The fake bucket here signs the way `@google-cloud/storage` does, dispatching
 * on the requested version. That is load-bearing: the previous fakes returned
 * a v4-shaped URL unconditionally, so a store that had quietly fallen back to
 * the SDK's v2 default still looked green while recording nothing at all.
 */

const makeLedger = (): SignedUrlLedger => {
  const store = new Map<string, unknown>();
  return new SignedUrlLedger({
    get: async <T>(key: string): Promise<T | null> =>
      store.has(key) ? (store.get(key) as T) : null,
    set: async (key: string, value: unknown) => {
      store.set(key, value);
      return true;
    },
  });
};

// Recording is fire-and-forget; let the microtask queue drain before asserting.
const settle = async (): Promise<void> => {
  await new Promise((resolve) => setImmediate(resolve));
};

const objectPathOf = (signedUrl: string): string =>
  new URL(signedUrl).pathname.replace("/test-bucket/", "");

describe("regression: every mint site records a v4 grant on the ledger", () => {
  it("the storage-domain signer records its view URL", async () => {
    const path = "users/u1/previews/images/1785598164559-abc.webp";
    const ledger = makeLedger();
    const service = new SignedUrlService(
      new SignedUrlMinter(createFakeBucket() as never, ledger),
    );

    const { viewUrl } = await service.getViewUrl(path);
    await settle();

    expect(new URL(viewUrl).searchParams.get("X-Goog-Signature")).toBe(
      SIGNATURE,
    );
    expect(await ledger.isMintedGrant(path, SIGNATURE)).toBe(true);
  });

  it("the image asset store records the grant behind getPublicUrl", async () => {
    const ledger = makeLedger();
    const bucket = createFakeBucket();
    const store = new GcsImageAssetStore({
      bucket: bucket as never,
      minter: new SignedUrlMinter(bucket as never, ledger),
      basePath: "image-previews",
      signedUrlTtlMs: 3_600_000,
      cacheControl: "public",
    });

    const url = await store.getPublicUrl("asset-42", "u1");
    await settle();

    expect(url).not.toBeNull();
    expect(
      await ledger.isMintedGrant("image-previews/u1/asset-42", SIGNATURE),
    ).toBe(true);
  });

  it("the video asset store records the grant behind getPublicUrl", async () => {
    const ledger = makeLedger();
    const bucket = createFakeBucket();
    const store = new GcsVideoAssetStore({
      bucket: bucket as never,
      minter: new SignedUrlMinter(bucket as never, ledger),
      basePath: "video-previews",
      signedUrlTtlMs: 3_600_000,
      cacheControl: "public",
    });

    const url = await store.getPublicUrl("asset-7");
    await settle();

    expect(url).not.toBeNull();
    expect(
      await ledger.isMintedGrant("video-previews/asset-7", SIGNATURE),
    ).toBe(true);
  });

  it("the convergence store records the grant behind uploadBuffer", async () => {
    const ledger = makeLedger();
    const bucket = createFakeBucket();
    const store = new GCSStorageService(
      bucket as never,
      new SignedUrlMinter(bucket as never, ledger),
      3_600_000,
    );

    const url = await store.uploadBuffer(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      "user-1",
      "image/png",
      "frame",
    );
    await settle();

    expect(new URL(url).searchParams.get("X-Goog-Signature")).toBe(SIGNATURE);
    expect(await ledger.isMintedGrant(objectPathOf(url), SIGNATURE)).toBe(true);
  });
});
