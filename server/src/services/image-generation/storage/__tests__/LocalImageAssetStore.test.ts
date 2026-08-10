import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { LocalImageAssetStore } from "../LocalImageAssetStore";

vi.mock("uuid", () => ({
  v4: vi.fn(() => "test-id"),
}));

describe("LocalImageAssetStore", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "image-store-"));
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  describe("error handling", () => {
    it("throws when fetching the source image fails", async () => {
      const store = new LocalImageAssetStore({
        directory: tempDir,
        publicPath: "/public/images",
      });

      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Server Error",
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        store.storeFromUrl("https://example.com/image.webp", "user-1"),
      ).rejects.toThrow("Failed to fetch remote media: 500 Server Error");
    });

    it("propagates filesystem write failures", async () => {
      const invalidPath = path.join(tempDir, "not-a-dir");
      await fs.writeFile(invalidPath, "file");

      const store = new LocalImageAssetStore({
        directory: invalidPath,
        publicPath: "/public/images",
      });

      await expect(
        store.storeFromBuffer(Buffer.from("data"), "image/png", "user-1"),
      ).rejects.toThrow();
    });

    it("returns false when file lookups fail", async () => {
      const invalidPath = path.join(tempDir, "not-a-dir");
      await fs.writeFile(invalidPath, "file");

      const store = new LocalImageAssetStore({
        directory: invalidPath,
        publicPath: "/public/images",
      });

      const exists = await store.exists("missing-id", "user-1");

      expect(exists).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("returns null when the asset does not exist", async () => {
      const store = new LocalImageAssetStore({
        directory: tempDir,
        publicPath: "/public/images",
      });

      const result = await store.getPublicUrl("missing-id", "user-1");

      expect(result).toBeNull();
    });

    it("defaults to .webp extension for unknown content types", async () => {
      const store = new LocalImageAssetStore({
        directory: tempDir,
        publicPath: "/public/images",
      });

      const result = await store.storeFromBuffer(
        Buffer.from("data"),
        "application/octet-stream",
        "user-1",
      );
      const expectedPath = path.join(tempDir, "user-1", "test-id.webp");
      const stat = await fs.stat(expectedPath);

      expect(result.url).toBe("/public/images/user-1/test-id");
      expect(stat.size).toBe(4);
    });
  });

  describe("core behavior", () => {
    it("stores buffers locally with the computed public URL", async () => {
      const store = new LocalImageAssetStore({
        directory: tempDir,
        publicPath: "/public/images",
      });

      const result = await store.storeFromBuffer(
        Buffer.from("image-data"),
        "image/png",
        "user-1",
      );

      expect(result.id).toBe("test-id");
      expect(result.url).toBe("/public/images/user-1/test-id");
      expect(result.storagePath).toBe("user-1/test-id.png");
      expect(result.sizeBytes).toBe(10);
    });

    it("scopes asset lookups by owner", async () => {
      const store = new LocalImageAssetStore({
        directory: tempDir,
        publicPath: "/public/images",
      });

      await store.storeFromBuffer(
        Buffer.from("image-data"),
        "image/png",
        "user-1",
      );

      await expect(store.getPublicUrl("test-id", "user-2")).resolves.toBeNull();
      await expect(store.exists("test-id", "user-2")).resolves.toBe(false);
      await expect(store.getPublicUrl("test-id", "user-1")).resolves.toBe(
        "/public/images/user-1/test-id",
      );
    });

    it("removes expired files based on mtime and returns the delete count", async () => {
      const store = new LocalImageAssetStore({
        directory: tempDir,
        publicPath: "/public/images",
      });

      const stalePath = path.join(tempDir, "old-file.webp");
      const freshPath = path.join(tempDir, "new-file.webp");
      await fs.writeFile(stalePath, "old");
      await fs.writeFile(freshPath, "new");

      const staleTime = Date.now() - 10_000;
      const freshTime = Date.now();
      await fs.utimes(stalePath, staleTime / 1000, staleTime / 1000);
      await fs.utimes(freshPath, freshTime / 1000, freshTime / 1000);

      const deleted = await store.cleanupExpired(Date.now() - 1000);

      expect(deleted).toBe(1);
      await expect(fs.stat(stalePath)).rejects.toThrow();
      const freshStat = await fs.stat(freshPath);
      expect(freshStat.size).toBe(3);
    });
  });
});
