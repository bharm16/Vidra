import { describe, it, expect, vi } from "vitest";
import { SignedUrlService } from "../services/SignedUrlService";
import { SignedUrlLedger } from "../services/SignedUrlLedger";
import { GcsImageAssetStore } from "@services/image-generation/storage/GcsImageAssetStore";

/**
 * Regression companion to the media-proxy rescue hardening: the rescue only
 * honors grants on the signed-URL ledger, so every mint site must record —
 * otherwise freshly minted URLs would lose their rescue and media would go
 * dark at signed-URL expiry again (the exact failure the ledger exists to
 * prevent). Pins the two mint families: the storage-domain signer and the
 * asset stores' internal signing helper.
 */

const SIGNATURE = "dd".repeat(64);

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

describe("regression: every mint records its grant on the ledger", () => {
  it("SignedUrlService.getViewUrl records the minted grant for its path", async () => {
    const path = "users/u1/previews/images/1785598164559-abc.webp";
    const mockFile = {
      getSignedUrl: vi
        .fn()
        .mockResolvedValue([
          `https://storage.googleapis.com/b/${path}?X-Goog-Signature=${SIGNATURE}`,
        ]),
      exists: vi.fn().mockResolvedValue([true]),
    };
    const mockStorage = {
      bucket: vi.fn().mockReturnValue({ file: vi.fn(() => mockFile) }),
    };
    const ledger = makeLedger();
    const service = new SignedUrlService(
      mockStorage as unknown as never,
      "b",
      ledger,
    );

    await service.getViewUrl(path);
    await settle();

    expect(await ledger.isMintedGrant(path, SIGNATURE)).toBe(true);
    // The grant is bound to its path — it must not transfer.
    expect(
      await ledger.isMintedGrant(
        "users/u2/previews/images/other.webp",
        SIGNATURE,
      ),
    ).toBe(false);
  });

  it("GcsImageAssetStore records grants minted by its signing helper", async () => {
    const objectPath = "image-previews/u1/asset-42";
    const mockFile = {
      name: objectPath,
      exists: vi.fn().mockResolvedValue([true]),
      getSignedUrl: vi
        .fn()
        .mockResolvedValue([
          `https://storage.googleapis.com/b/${objectPath}?X-Goog-Signature=${SIGNATURE}`,
        ]),
    };
    const ledger = makeLedger();
    const store = new GcsImageAssetStore({
      bucket: { file: vi.fn(() => mockFile) } as unknown as never,
      basePath: "image-previews",
      signedUrlTtlMs: 3_600_000,
      cacheControl: "public",
      ledger,
    });

    const url = await store.getPublicUrl("asset-42", "u1");
    await settle();

    expect(url).toContain(SIGNATURE);
    expect(await ledger.isMintedGrant(objectPath, SIGNATURE)).toBe(true);
  });
});
