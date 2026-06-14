/**
 * Regression: every Sora I2V render failed at the provider. Two stacked API
 * contract violations:
 *  1. "400 Invalid type for 'input_reference': expected an object, but got a
 *     file instead." — the provider fetched the start image and passed the raw
 *     fetch Response, which the SDK uploaded as a multipart file; the videos
 *     API requires an image-reference object ({ file_id | image_url }).
 *  2. "400 Inpaint image must match the requested width and height." — the
 *     API requires the reference image's dimensions to exactly match the
 *     requested output size.
 *
 * Invariant: for any Sora generation with a start image, input_reference is
 * an image-reference object whose image_url is a base64 data URL with
 * dimensions exactly matching the requested size — never an uploaded file.
 * T2v requests (no start image) send no input_reference at all.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { generateSoraVideo } from "../soraProvider";
import type OpenAI from "openai";
import type { VideoAssetStore } from "@services/video-generation/storage";

const START_IMAGE_URL = "https://images.example.com/first-frame.webp";

function createFakes() {
  const createMock = vi.fn().mockResolvedValue({
    id: "video_123",
    status: "completed",
  });
  const downloadMock = vi.fn().mockResolvedValue(
    new Response(new Blob([new Uint8Array([0, 1, 2])]), {
      headers: { "content-type": "video/mp4" },
    }),
  );
  const openai = {
    videos: {
      create: createMock,
      retrieve: vi.fn(),
      downloadContent: downloadMock,
    },
  } as unknown as OpenAI;

  const assetStore = {
    storeFromStream: vi.fn().mockResolvedValue({
      assetId: "asset_1",
      videoUrl: "/api/preview/video/asset_1",
      contentType: "video/mp4",
    }),
  } as unknown as VideoAssetStore;

  const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };

  return { openai, assetStore, log, createMock };
}

async function stubFetchWithImage(
  width: number,
  height: number,
): Promise<void> {
  const png = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 220, g: 180, b: 90 },
    },
  })
    .png()
    .toBuffer();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(new Uint8Array(png), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    ),
  );
}

describe("regression: Sora input_reference wire shape", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the start image as an image-reference object sized to the request, never a file", async () => {
    // Source frame deliberately NOT 1280x720 — the provider must resize.
    await stubFetchWithImage(1344, 768);
    const { openai, assetStore, log, createMock } = createFakes();

    await generateSoraVideo(
      openai,
      "gentle camera push",
      "sora-2",
      { startImage: START_IMAGE_URL, aspectRatio: "16:9" },
      assetStore,
      log,
    );

    expect(createMock).toHaveBeenCalledTimes(1);
    const inputReference = createMock.mock.calls[0]?.[0]?.input_reference;
    expect(typeof inputReference).toBe("object");
    expect(typeof inputReference.image_url).toBe("string");
    expect(inputReference.image_url.startsWith("data:image/jpeg;base64,")).toBe(
      true,
    );

    const encoded = inputReference.image_url.split(",")[1] as string;
    const metadata = await sharp(Buffer.from(encoded, "base64")).metadata();
    expect({ width: metadata.width, height: metadata.height }).toEqual({
      width: 1280,
      height: 720,
    });
  });

  it("sends no input_reference for t2v requests", async () => {
    const { openai, assetStore, log, createMock } = createFakes();

    await generateSoraVideo(
      openai,
      "a quiet street at dawn",
      "sora-2",
      { aspectRatio: "16:9" },
      assetStore,
      log,
    );

    const params = createMock.mock.calls[0]?.[0];
    expect(params).not.toHaveProperty("input_reference");
  });
});
