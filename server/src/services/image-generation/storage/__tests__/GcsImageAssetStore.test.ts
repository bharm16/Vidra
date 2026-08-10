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
  });

  describe("error handling", () => {
    it("throws when fetching the source image fails", async () => {
      const store = new GcsImageAssetStore({
        bucket: bucketMock as never,
        minter: new SignedUrlMinter(bucketMock as never),
        basePath: "/image-previews/",
        signedUrlTtlMs: 60000,
        cacheControl: "public, max-age=60",
      });

      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });
      vi.stubGlobal("fetch", fetchMock);

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

    it("handles delete errors when cleaning up expired assets", async () => {
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

  describe("edge cases", () => {
    it("returns null when the asset does not exist", async () => {
      const store = new GcsImageAssetStore({
        bucket: bucketMock as never,
        minter: new SignedUrlMinter(bucketMock as never),
        basePath: "image-previews",
        signedUrlTtlMs: 60000,
        cacheControl: "public, max-age=60",
      });

      fileMock.exists.mockResolvedValueOnce([false]);

      const result = await store.getPublicUrl("missing-id", "user-1");

      expect(result).toBeNull();
    });

    it("returns 0 when cleanup is called with an invalid threshold", async () => {
      const store = new GcsImageAssetStore({
        bucket: bucketMock as never,
        minter: new SignedUrlMinter(bucketMock as never),
        basePath: "image-previews",
        signedUrlTtlMs: 60000,
        cacheControl: "public, max-age=60",
      });

      const deleted = await store.cleanupExpired(-1);

      expect(deleted).toBe(0);
    });

    it("omits sizeBytes when metadata size is not positive", async () => {
      const store = new GcsImageAssetStore({
        bucket: bucketMock as never,
        minter: new SignedUrlMinter(bucketMock as never),
        basePath: "image-previews",
        signedUrlTtlMs: 60000,
        cacheControl: "public, max-age=60",
      });

      const buffer = Buffer.from("image");
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        arrayBuffer: () => Promise.resolve(buffer.buffer),
        headers: { get: vi.fn().mockReturnValue("image/webp") },
      });
      vi.stubGlobal("fetch", fetchMock);

      fileMock.getMetadata.mockResolvedValueOnce([{ size: "0" }]);
      fileMock.getSignedUrl.mockResolvedValueOnce([
        "https://signed.example.com/asset",
      ]);

      const result = await store.storeFromUrl(
        "https://example.com/source.webp",
        "user-1",
      );

      expect(result.sizeBytes).toBeUndefined();
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
      const arrayBuffer = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      );
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        arrayBuffer: () => Promise.resolve(arrayBuffer),
        headers: { get: vi.fn().mockReturnValue("image/png") },
      });
      vi.stubGlobal("fetch", fetchMock);

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
