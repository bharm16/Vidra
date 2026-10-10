import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildReplicateInput,
  generateReplicateVideo,
} from "../replicateProvider";
import type { VideoModelId } from "@shared/videoModels";

describe("buildReplicateInput", () => {
  it("includes a rounded seed when provided", () => {
    const modelId = "wan-video/wan-2.2-t2v-fast" as VideoModelId;
    const input = buildReplicateInput(modelId, "prompt", {
      aspectRatio: "16:9",
      seed: 42.7,
    });

    expect(input.seed).toBe(43);
  });

  it("preserves a seed of 0", () => {
    const modelId = "wan-video/wan-2.2-t2v-fast" as VideoModelId;
    const input = buildReplicateInput(modelId, "prompt", {
      aspectRatio: "16:9",
      seed: 0,
    });

    expect(input.seed).toBe(0);
  });

  it("defaults prompt_extend to true for Wan inputs", () => {
    const modelId = "wan-video/wan-2.2-t2v-fast" as VideoModelId;
    const input = buildReplicateInput(modelId, "prompt", {});

    expect(input.prompt_extend).toBe(true);
  });

  it("respects promptExtend override for Wan inputs", () => {
    const modelId = "wan-video/wan-2.2-t2v-fast" as VideoModelId;
    const input = buildReplicateInput(modelId, "prompt", {
      promptExtend: false,
    });

    expect(input.prompt_extend).toBe(false);
  });

  it("maps Wan 2.5 inputs to resolution/duration and prompt expansion flag", () => {
    const modelId = "wan-video/wan-2.5-i2v" as VideoModelId;
    const input = buildReplicateInput(modelId, "prompt", {
      promptExtend: false,
      size: "1280x720",
      seconds: "8",
      startImage: "https://example.com/image.png",
    });

    expect(input.enable_prompt_expansion).toBe(false);
    expect(input.resolution).toBe("720p");
    expect(input.duration).toBe(8);
    expect(input.image).toBe("https://example.com/image.png");
    expect(input.prompt_extend).toBeUndefined();
  });
});

describe("generateReplicateVideo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("wraps extensionless startImage in a Blob for Replicate", async () => {
    const run = vi.fn().mockResolvedValue("https://example.com/video.mp4");
    const replicate = { run } as unknown as import("replicate").default;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "image/png" },
      arrayBuffer: async () => new ArrayBuffer(4),
    });
    vi.stubGlobal("fetch", fetchMock);

    const log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    await generateReplicateVideo(
      replicate,
      "prompt",
      "wan-video/wan-2.2-t2v-fast" as VideoModelId,
      { startImage: "https://example.com/image" },
      log,
    );

    const input = (run.mock.calls[0]?.[1] as { input: Record<string, unknown> })
      .input;
    if (!(input.image instanceof Blob)) throw new Error("expected image Blob");
    expect(input.image.type).toBe("image/png");
    expect(await input.image.arrayBuffer()).toEqual(new ArrayBuffer(4));
  });
});
