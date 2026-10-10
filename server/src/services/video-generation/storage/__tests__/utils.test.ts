import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "node:stream";
import { ReadableStream as WebReadableStream } from "node:stream/web";
import { toNodeReadableStream, storeVideoFromUrl } from "../utils";

describe("toNodeReadableStream", () => {
  describe("error handling", () => {
    it("throws when body is null", () => {
      expect(() => toNodeReadableStream(null)).toThrow(
        "Response body is empty",
      );
    });
  });
});

describe("storeVideoFromUrl", () => {
  const mockAssetStore = {
    storeFromStream: vi.fn(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockAssetStore.storeFromStream.mockReset();
  });

  describe("error handling", () => {
    it("throws when fetch returns non-ok response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          text: () => Promise.resolve("Not Found"),
        }),
      );

      await expect(
        storeVideoFromUrl(
          mockAssetStore as never,
          "https://example.com/video.mp4",
        ),
      ).rejects.toThrow("Video download failed (404): Not Found");

      vi.unstubAllGlobals();
    });

    it("truncates error body to 400 chars", async () => {
      const longBody = "x".repeat(500);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          text: () => Promise.resolve(longBody),
        }),
      );

      await expect(
        storeVideoFromUrl(
          mockAssetStore as never,
          "https://example.com/video.mp4",
        ),
      ).rejects.toThrow(`Video download failed (500): ${"x".repeat(400)}`);

      vi.unstubAllGlobals();
    });
  });

  describe("core behavior", () => {
    it("calls assetStore.storeFromStream with content type from response", async () => {
      const mockBody = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      });

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          headers: new Headers({ "content-type": "video/webm" }),
          body: mockBody,
        }),
      );

      const storedAsset = {
        id: "asset-1",
        url: "https://storage/asset-1.webm",
      };
      mockAssetStore.storeFromStream.mockResolvedValue(storedAsset);

      const result = await storeVideoFromUrl(
        mockAssetStore as never,
        "https://example.com/video.webm",
      );

      expect(result).toEqual(storedAsset);
      const copiedStream = mockAssetStore.storeFromStream.mock.calls[0]?.[0];
      if (!(copiedStream instanceof Readable))
        throw new Error("expected readable video stream");
      const chunks: Buffer[] = [];
      for await (const chunk of copiedStream) chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks)).toEqual(Buffer.from([1, 2, 3]));
      expect(mockAssetStore.storeFromStream).toHaveBeenCalledWith(
        expect.anything(),
        "video/webm",
      );

      vi.unstubAllGlobals();
    });

    it("defaults content type to video/mp4 when header missing", async () => {
      const mockBody = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1]));
          controller.close();
        },
      });

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          headers: new Headers(),
          body: mockBody,
        }),
      );

      mockAssetStore.storeFromStream.mockResolvedValue({ id: "asset-2" });

      await storeVideoFromUrl(
        mockAssetStore as never,
        "https://example.com/video",
      );

      expect(mockAssetStore.storeFromStream).toHaveBeenCalledWith(
        expect.anything(),
        "video/mp4",
      );

      vi.unstubAllGlobals();
    });
  });
});
