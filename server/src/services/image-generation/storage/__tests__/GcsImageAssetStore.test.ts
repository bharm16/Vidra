import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockedFunction,
} from "vitest";
import { SignedUrlMinter } from "@infrastructure/signedUrl/SignedUrlMinter";
import { GcsImageAssetStore } from "../GcsImageAssetStore";
import { Readable } from "node:stream";
import * as networkBoundary from "@services/owned-media/PublicNetworkTransport";
import { logger } from "@infrastructure/Logger";

vi.mock("uuid", () => ({
  v4: vi.fn(() => "test-id"),
}));

type FileMock = {
  name: string;
  save: MockedFunction<
    (buffer: Buffer, options: Record<string, unknown>) => Promise<void>
  >;
  getMetadata: MockedFunction<() => Promise<[Record<string, string>]>>;
  getSignedUrl: MockedFunction<
    (options: Record<string, unknown>) => Promise<[string]>
  >;
  exists: MockedFunction<() => Promise<[boolean]>>;
  delete: MockedFunction<() => Promise<void>>;
};

let fileMock: FileMock;
let bucketMock: {
  file: MockedFunction<(path: string) => FileMock>;
  getFiles: MockedFunction<
    (options?: Record<string, unknown>) => Promise<[FileMock[]]>
  >;
};

const createFileMock = (name: string): FileMock => ({
  name,
  save: vi.fn(),
  getMetadata: vi.fn(),
  getSignedUrl: vi.fn(),
  exists: vi.fn(),
  delete: vi.fn(),
});

describe("GcsImageAssetStore", () => {
  beforeEach(() => {
    fileMock = createFileMock("image-previews/test-id");
    bucketMock = {
      file: vi.fn((path: string) => {
        void path;
        return fileMock;
      }),
      getFiles: vi.fn(),
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("error handling", () => {
    it("refuses historical credential-bearing sources before URL logging, reads or writes", async () => {
      const logged = vi.spyOn(logger, "debug");
      const network = vi.spyOn(networkBoundary, "requestPublicMedia").mockRejectedValue(new Error("No network request is permitted"));
      const store = new GcsImageAssetStore({
        bucket: bucketMock as never,
        minter: new SignedUrlMinter(bucketMock as never),
        basePath: "image-previews",
        signedUrlTtlMs: 60000,
        cacheControl: "private",
      });
      await expect(store.storeFromUrl("https://storage.googleapis.com/bucket/users/api-key:retired-key-fixture/input.png", "creator")).rejects.toThrow("This media is unavailable");
      expect(logged).not.toHaveBeenCalled();
      expect(network).not.toHaveBeenCalled();
      expect(fileMock.save).not.toHaveBeenCalled();
    });

    it("keeps sketch snapshot identification in object metadata for the dry-run inventory", async () => {
      const store = new GcsImageAssetStore({
        bucket: bucketMock as never,
        minter: new SignedUrlMinter(bucketMock as never),
        basePath: "image-previews",
        signedUrlTtlMs: 60000,
        cacheControl: "private, max-age=60",
      });
      fileMock.save.mockResolvedValue(undefined);
      fileMock.getMetadata.mockResolvedValue([{ size: "12" }]);
      fileMock.getSignedUrl.mockResolvedValue([
        "https://signed.example.com/snapshot",
      ]);
      await store.storeFromBuffer(
        Buffer.from("snapshot"),
        "image/png",
        "creator",
        { admissionSource: "sketch-snapshot" },
      );
      expect(fileMock.save.mock.calls[0]?.[1]).toMatchObject({
        metadata: {
          cacheControl: "private, max-age=60",
          metadata: { admissionSource: "sketch-snapshot" },
        },
      });
    });
    it("throws when fetching the source image fails", async () => {
      const store = new GcsImageAssetStore({
        bucket: bucketMock as never,
        minter: new SignedUrlMinter(bucketMock as never),
        basePath: "/image-previews/",
        signedUrlTtlMs: 60000,
        cacheControl: "public, max-age=60",
      });

      vi.spyOn(networkBoundary, "requestPublicMedia").mockResolvedValue({
        status: 404,
        statusText: "Not Found",
        headers: new Headers(),
        body: Readable.from([]),
      });

      await expect(
        store.storeFromUrl("https://example.com/missing.webp", "user-1"),
      ).rejects.toThrow("Failed to fetch remote media: 404 Not Found");
    });

    it("retries uploads when the GCS stream is destroyed", async () => {
      const store = new GcsImageAssetStore({
        bucket: bucketMock as never,
        minter: new SignedUrlMinter(bucketMock as never),
        basePath: "image-previews",
        signedUrlTtlMs: 60000,
        cacheControl: "public, max-age=60",
      });

      fileMock.save
        .mockRejectedValueOnce(new Error("stream was destroyed"))
        .mockResolvedValueOnce(undefined);
      fileMock.getMetadata.mockResolvedValueOnce([{ size: "512" }]);
      fileMock.getSignedUrl.mockResolvedValueOnce([
        "https://signed.example.com/asset",
      ]);

      const result = await store.storeFromBuffer(
        Buffer.from("image"),
        "image/webp",
        "user-1",
      );

      expect(result.url).toBe("https://signed.example.com/asset");
      expect(result.sizeBytes).toBe(512);
      expect(fileMock.save).toHaveBeenCalledTimes(2);
    });

    it("keeps assets whose metadata cannot be read during cleanup", async () => {
      const store = new GcsImageAssetStore({
        bucket: bucketMock as never,
        minter: new SignedUrlMinter(bucketMock as never),
        basePath: "image-previews",
        signedUrlTtlMs: 60000,
        cacheControl: "public, max-age=60",
      });

      const staleFile = createFileMock("image-previews/stale");
      staleFile.getMetadata.mockRejectedValueOnce(
        new Error("metadata unavailable"),
      );
      bucketMock.getFiles.mockResolvedValueOnce([[staleFile]]);

      const deleted = await store.cleanupExpired(Date.now() - 1000);

      expect(deleted).toBe(0);
    });
  });

  describe("core behavior", () => {
    it("stores fetched images and returns signed URLs", async () => {
      const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
      const store = new GcsImageAssetStore({
        bucket: bucketMock as never,
        minter: new SignedUrlMinter(bucketMock as never),
        basePath: "/image-previews/",
        signedUrlTtlMs: 60000,
        cacheControl: "public, max-age=60",
      });

      const buffer = Buffer.from("image");
      vi.spyOn(networkBoundary, "requestPublicMedia").mockResolvedValue({
        status: 200,
        statusText: "OK",
        body: Readable.from([buffer]),
        headers: new Headers({ "content-type": "image/png" }),
      });

      fileMock.getMetadata.mockResolvedValueOnce([{ size: "1024" }]);
      fileMock.getSignedUrl.mockResolvedValueOnce([
        "https://signed.example.com/asset",
      ]);

      const result = await store.storeFromUrl(
        "https://example.com/source.png",
        "user-1",
      );

      expect(bucketMock.file).toHaveBeenCalledWith(
        "image-previews/user-1/test-id",
      );
      expect(result.id).toBe("test-id");
      expect(result.url).toBe("https://signed.example.com/asset");
      expect(result.contentType).toBe("image/png");
      expect(result.sizeBytes).toBe(1024);
      expect(result.expiresAt).toBe(1_700_000_000_000 + 60000);

      nowSpy.mockRestore();
    });
  });
});
