import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateReplicateVideo } from "@services/video-generation/providers/replicateProvider";
import { generateVeoVideo } from "@services/video-generation/providers/veoProvider";
import type { VideoModelId } from "@services/video-generation/types";
import type {
  StoredVideoAsset,
  VideoAssetStore,
} from "@services/video-generation/storage";

// Provider prompt policies run through the actual adapter invocation with
// process-external generation/storage boundaries mocked. Wan and Veo preserve
// empty words; legacy non-Wan Replicate models use their explicit substitute.

const RUNWAY_EMPTY_PROMPT_SUBSTITUTE = "subtle ambient motion";

const STORED_ASSET: StoredVideoAsset = {
  id: "asset-1",
  url: "https://cdn.example.com/video.mp4",
  contentType: "video/mp4",
  createdAt: 0,
};

const makeAssetStore = (): VideoAssetStore =>
  ({
    storeFromBuffer: vi.fn().mockResolvedValue(STORED_ASSET),
    storeFromStream: vi.fn().mockResolvedValue(STORED_ASSET),
    getStream: vi.fn(),
    getPublicUrl: vi.fn(),
    cleanupExpired: vi.fn(),
  }) as unknown as VideoAssetStore;

// ----------------------------------------------------------------------------
// Replicate (Wan + non-Wan/Runway-style) — Wan native, non-Wan substitutes
// ----------------------------------------------------------------------------

describe("Replicate adapter empty-prompt handling", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["empty", "", RUNWAY_EMPTY_PROMPT_SUBSTITUTE],
    ["whitespace", "   \n", RUNWAY_EMPTY_PROMPT_SUBSTITUTE],
    ["authored", "a horse running", "a horse running"],
  ])(
    "generateReplicateVideo sends the %s prompt policy through the SDK",
    async (_case, prompt, expected) => {
      const run = vi.fn().mockResolvedValue("https://example.com/video.mp4");
      const replicate = { run } as unknown as import("replicate").default;
      const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

      await generateReplicateVideo(
        replicate,
        prompt,
        "minimax/video-02" as VideoModelId,
        { startImage: "https://images.example.com/start.png" },
        log,
      );

      const input = (
        run.mock.calls[0]?.[1] as { input: Record<string, unknown> }
      ).input;
      expect(input.prompt).toBe(expected);
    },
  );

  it.each([
    ["wan-video/wan-2.2-i2v-fast", ""],
    ["wan-video/wan-2.5-i2v", "   "],
  ])(
    "generateReplicateVideo preserves native prompt bytes for %s",
    async (model, prompt) => {
      const run = vi.fn().mockResolvedValue("https://example.com/video.mp4");
      const replicate = { run } as unknown as import("replicate").default;
      const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

      await generateReplicateVideo(
        replicate,
        prompt,
        model as VideoModelId,
        { startImage: "https://images.example.com/start.png" },
        log,
      );

      const input = (
        run.mock.calls[0]?.[1] as { input: Record<string, unknown> }
      ).input;
      expect(input.prompt).toBe(prompt);
    },
  );
});

// ----------------------------------------------------------------------------
// Veo — native empty support
// ----------------------------------------------------------------------------

const veoMocks = vi.hoisted(() => ({
  fetchAsVeoInline: vi.fn(),
  startVeoGeneration: vi.fn(),
  waitForVeoOperation: vi.fn(),
  extractVeoVideoUri: vi.fn(),
  downloadVeoVideoStream: vi.fn(),
}));

vi.mock("@services/video-generation/providers/veo/imageUtils", () => ({
  fetchAsVeoInline: veoMocks.fetchAsVeoInline,
}));

vi.mock("@services/video-generation/providers/veo/operations", () => ({
  startVeoGeneration: veoMocks.startVeoGeneration,
  waitForVeoOperation: veoMocks.waitForVeoOperation,
  extractVeoVideoUri: veoMocks.extractVeoVideoUri,
}));

vi.mock("@services/video-generation/providers/veo/download", () => ({
  downloadVeoVideoStream: veoMocks.downloadVeoVideoStream,
}));

describe("Veo adapter empty-prompt handling", () => {
  beforeEach(() => {
    veoMocks.fetchAsVeoInline.mockReset();
    veoMocks.startVeoGeneration.mockReset();
    veoMocks.waitForVeoOperation.mockReset();
    veoMocks.extractVeoVideoUri.mockReset();
    veoMocks.downloadVeoVideoStream.mockReset();

    veoMocks.fetchAsVeoInline.mockResolvedValue({
      inlineData: { mimeType: "image/png", data: "BASE64" },
    });
    veoMocks.startVeoGeneration.mockResolvedValue("operations/veo-1");
    veoMocks.waitForVeoOperation.mockResolvedValue({
      response: { id: "response-1" },
    });
    veoMocks.extractVeoVideoUri.mockReturnValue(
      "https://storage.example.com/video.mp4",
    );
    veoMocks.downloadVeoVideoStream.mockResolvedValue({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1]));
          controller.close();
        },
      }),
      contentType: "video/mp4",
    });
  });

  it("forwards an empty prompt unchanged to startVeoGeneration", async () => {
    await generateVeoVideo(
      "api-key",
      "https://veo.example.com",
      "",
      { startImage: "https://images.example.com/start.png" },
      makeAssetStore(),
      { info: vi.fn() },
    );

    const input = veoMocks.startVeoGeneration.mock.calls[0]?.[2] as {
      prompt: string;
    };
    expect(input.prompt).toBe("");
  });
});
