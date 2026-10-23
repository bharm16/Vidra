import { describe, expect, it, vi, beforeEach } from "vitest";
import { generateVeoVideo } from "../veoProvider";
import type { VideoAssetStore, StoredVideoAsset } from "../../storage";
import type { VeoGenerationInput } from "../veo/operations";

const {
  fetchAsVeoInlineMock,
  startVeoGenerationMock,
  waitForVeoOperationMock,
  extractVeoVideoUriMock,
  downloadVeoVideoStreamMock,
} = vi.hoisted(() => ({
  fetchAsVeoInlineMock: vi.fn(),
  startVeoGenerationMock: vi.fn(),
  waitForVeoOperationMock: vi.fn(),
  extractVeoVideoUriMock: vi.fn(),
  downloadVeoVideoStreamMock: vi.fn(),
}));

vi.mock("../veo/imageUtils", () => ({
  fetchAsVeoInline: fetchAsVeoInlineMock,
}));

vi.mock("../veo/operations", () => ({
  startVeoGeneration: startVeoGenerationMock,
  waitForVeoOperation: waitForVeoOperationMock,
  extractVeoVideoUri: extractVeoVideoUriMock,
}));

vi.mock("../veo/download", () => ({
  downloadVeoVideoStream: downloadVeoVideoStreamMock,
}));

const makeAssetStore = (): VideoAssetStore =>
  ({
    storeFromBuffer: vi.fn(),
    storeFromStream: vi.fn(),
    getStream: vi.fn(),
    getPublicUrl: vi.fn(),
    cleanupExpired: vi.fn(),
  }) as unknown as VideoAssetStore;

const makeInline = (mimeType: string, data: string) => ({
  inlineData: { mimeType, data },
});

const makeReadableStream = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.close();
    },
  });

describe("generateVeoVideo", () => {
  beforeEach(() => {
    fetchAsVeoInlineMock.mockReset();
    startVeoGenerationMock.mockReset();
    waitForVeoOperationMock.mockReset();
    extractVeoVideoUriMock.mockReset();
    downloadVeoVideoStreamMock.mockReset();

    startVeoGenerationMock.mockResolvedValue("operations/veo-123");
    waitForVeoOperationMock.mockResolvedValue({ response: { id: "response" } });
    extractVeoVideoUriMock.mockReturnValue(
      "https://storage.example.com/video.mp4",
    );
    downloadVeoVideoStreamMock.mockResolvedValue({
      stream: makeReadableStream(),
      contentType: "video/mp4",
    });
  });

  it("handles text-only generation without URL fetch conversion", async () => {
    const asset: StoredVideoAsset = {
      id: "asset-1",
      url: "https://cdn.example.com/video.mp4",
      contentType: "video/mp4",
      createdAt: Date.now(),
    };
    const assetStore = makeAssetStore();
    vi.mocked(assetStore.storeFromStream).mockResolvedValue(asset);

    const result = await generateVeoVideo(
      "key",
      "https://veo.example.com",
      "a prompt",
      {},
      assetStore,
      { info: vi.fn() },
    );

    expect(fetchAsVeoInlineMock).not.toHaveBeenCalled();
    expect(startVeoGenerationMock).toHaveBeenCalledWith(
      "https://veo.example.com",
      "key",
      { prompt: "a prompt" },
      "veo-3.1-generate-preview",
      undefined,
    );
    expect(result).toEqual(asset);
  });

  it("maps startImage into Veo startImage inline input", async () => {
    const assetStore = makeAssetStore();
    vi.mocked(assetStore.storeFromStream).mockResolvedValue({
      id: "asset-2",
      url: "https://cdn.example.com/video.mp4",
      contentType: "video/mp4",
      createdAt: Date.now(),
    });
    fetchAsVeoInlineMock.mockResolvedValue(
      makeInline("image/png", "start-base64"),
    );

    await generateVeoVideo(
      "key",
      "https://veo.example.com",
      "a prompt",
      { startImage: "https://images.example.com/start.png" },
      assetStore,
      { info: vi.fn() },
    );

    expect(fetchAsVeoInlineMock).toHaveBeenCalledWith(
      "https://images.example.com/start.png",
      "image",
      {},
      undefined,
    );
    const input = startVeoGenerationMock.mock
      .calls[0]?.[2] as VeoGenerationInput;
    expect(input.startImage).toEqual(makeInline("image/png", "start-base64"));
  });

  it("maps endImage into Veo lastFrame", async () => {
    const assetStore = makeAssetStore();
    vi.mocked(assetStore.storeFromStream).mockResolvedValue({
      id: "asset-3",
      url: "https://cdn.example.com/video.mp4",
      contentType: "video/mp4",
      createdAt: Date.now(),
    });
    fetchAsVeoInlineMock.mockResolvedValue(
      makeInline("image/png", "end-base64"),
    );

    await generateVeoVideo(
      "key",
      "https://veo.example.com",
      "a prompt",
      { endImage: "https://images.example.com/end.png" },
      assetStore,
      { info: vi.fn() },
    );

    expect(fetchAsVeoInlineMock).toHaveBeenCalledWith(
      "https://images.example.com/end.png",
      "image",
      {},
      undefined,
    );
    const input = startVeoGenerationMock.mock
      .calls[0]?.[2] as VeoGenerationInput;
    expect(input.lastFrame).toEqual(makeInline("image/png", "end-base64"));
  });

  it("maps referenceImages into Veo referenceImages payload", async () => {
    const assetStore = makeAssetStore();
    vi.mocked(assetStore.storeFromStream).mockResolvedValue({
      id: "asset-4",
      url: "https://cdn.example.com/video.mp4",
      contentType: "video/mp4",
      createdAt: Date.now(),
    });
    fetchAsVeoInlineMock
      .mockResolvedValueOnce(makeInline("image/png", "r1"))
      .mockResolvedValueOnce(makeInline("image/jpeg", "r2"));

    await generateVeoVideo(
      "key",
      "https://veo.example.com",
      "a prompt",
      {
        referenceImages: [
          { url: "https://images.example.com/ref-1.png", type: "asset" },
          { url: "https://images.example.com/ref-2.jpg", type: "style" },
        ],
      },
      assetStore,
      { info: vi.fn() },
    );

    expect(fetchAsVeoInlineMock).toHaveBeenNthCalledWith(
      1,
      "https://images.example.com/ref-1.png",
      "image",
      {},
      undefined,
    );
    expect(fetchAsVeoInlineMock).toHaveBeenNthCalledWith(
      2,
      "https://images.example.com/ref-2.jpg",
      "image",
      {},
      undefined,
    );
    const input = startVeoGenerationMock.mock
      .calls[0]?.[2] as VeoGenerationInput;
    expect(input.referenceImages).toEqual([
      { image: makeInline("image/png", "r1"), referenceType: "asset" },
      { image: makeInline("image/jpeg", "r2"), referenceType: "style" },
    ]);
  });

  it("maps extendVideoUrl into Veo extendVideo input with video kind fetch", async () => {
    const assetStore = makeAssetStore();
    vi.mocked(assetStore.storeFromStream).mockResolvedValue({
      id: "asset-5",
      url: "https://cdn.example.com/video.mp4",
      contentType: "video/mp4",
      createdAt: Date.now(),
    });
    fetchAsVeoInlineMock.mockResolvedValue(
      makeInline("video/mp4", "video-base64"),
    );

    await generateVeoVideo(
      "key",
      "https://veo.example.com",
      "a prompt",
      { extendVideoUrl: "https://videos.example.com/input.mp4" },
      assetStore,
      { info: vi.fn() },
    );

    expect(fetchAsVeoInlineMock).toHaveBeenCalledWith(
      "https://videos.example.com/input.mp4",
      "video",
      {},
      undefined,
    );
    const input = startVeoGenerationMock.mock
      .calls[0]?.[2] as VeoGenerationInput;
    expect(input.extendVideo).toEqual(makeInline("video/mp4", "video-base64"));
  });

  it("maps aspectRatio, seconds, seed, and size to Veo parameters", async () => {
    const assetStore = makeAssetStore();
    vi.mocked(assetStore.storeFromStream).mockResolvedValue({
      id: "asset-6",
      url: "https://cdn.example.com/video.mp4",
      contentType: "video/mp4",
      createdAt: Date.now(),
    });

    await generateVeoVideo(
      "key",
      "https://veo.example.com",
      "a prompt",
      {
        aspectRatio: "16:9",
        seconds: "6",
        seed: 777,
        size: "4k",
      },
      assetStore,
      { info: vi.fn() },
    );

    const input = startVeoGenerationMock.mock
      .calls[0]?.[2] as VeoGenerationInput;
    expect(input.parameters).toEqual({
      aspectRatio: "16:9",
      durationSeconds: 6,
      seed: 777,
      resolution: "4k",
    });
  });
});
