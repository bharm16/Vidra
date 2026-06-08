import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import { GradingService } from "../GradingService";

describe("GradingService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns not applied when asset store does not provide a public URL", async () => {
    const service = new GradingService(
      {
        getPublicUrl: vi.fn().mockResolvedValue(null),
        storeFromBuffer: vi.fn(),
      } as never,
      undefined,
    );

    const result = await service.matchPalette(
      "asset-1",
      "https://example.com/ref.png",
    );

    expect(result).toEqual({ applied: false });
  });

  it("returns not applied when video download fails", async () => {
    const service = new GradingService(
      {
        getPublicUrl: vi
          .fn()
          .mockResolvedValue("https://example.com/video.mp4"),
        storeFromBuffer: vi.fn(),
      } as never,
      undefined,
    );

    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      {
        ok: false,
        status: 500,
        arrayBuffer: async () => new ArrayBuffer(0),
      },
    );

    const result = await service.matchPalette(
      "asset-1",
      "https://example.com/ref.png",
    );

    expect(result).toEqual({ applied: false });
  });

  it("returns not applied for image palette matching when storage service is unavailable", async () => {
    const service = new GradingService(
      {
        getPublicUrl: vi.fn(),
        storeFromBuffer: vi.fn(),
      } as never,
      undefined,
    );

    const result = await service.matchImagePalette(
      "user-1",
      "https://example.com/source.png",
      "https://example.com/ref.png",
    );

    expect(result).toEqual({ applied: false });
  });

  it("stores transformed image when image palette matching succeeds", async () => {
    const storage = {
      savePreviewImage: vi.fn().mockResolvedValue({
        viewUrl: "https://example.com/stored.png",
      }),
    };

    const service = new GradingService(
      {
        getPublicUrl: vi.fn(),
        storeFromBuffer: vi.fn(),
      } as never,
      storage as never,
    );

    const serviceAny = service as unknown as {
      exec: (command: string, args: string[]) => Promise<void>;
    };

    vi.spyOn(serviceAny, "exec").mockImplementation(
      async (_command: string, args: string[]) => {
        const outputPath = args[args.length - 1] as string;
        await fs.writeFile(outputPath, Buffer.from("graded-image"));
      },
    );

    (global.fetch as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Buffer.from("source"),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Buffer.from("reference"),
      });

    const result = await service.matchImagePalette(
      "user-1",
      "https://example.com/source.png",
      "https://example.com/ref.png",
    );

    expect(storage.savePreviewImage).toHaveBeenCalledWith(
      "user-1",
      expect.any(Buffer),
      expect.objectContaining({ source: "continuity-style-transfer" }),
    );
    expect(result).toEqual({
      applied: true,
      imageUrl: "https://example.com/stored.png",
    });
  });
});
