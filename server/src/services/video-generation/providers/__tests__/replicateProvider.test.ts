import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildReplicateInput,
  generateReplicateVideo,
} from "../replicateProvider";
import type { VideoModelId } from "@shared/videoModels";
import { Readable } from "node:stream";
import * as networkBoundary from "@services/owned-media/PublicNetworkTransport";

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

  it("maps Wan 2.2 text-to-video settings onto the model's resolution and aspect_ratio inputs", () => {
    const modelId = "wan-video/wan-2.2-t2v-fast" as VideoModelId;
    const input = buildReplicateInput(modelId, "prompt", {
      aspectRatio: "9:16",
      size: "720p",
      numFrames: 121,
      fps: 16,
      promptExtend: false,
      negativePrompt: "blurry",
    });

    expect(input).toMatchObject({ resolution: "720p", aspect_ratio: "9:16", num_frames: 121, frames_per_second: 16, optimize_prompt: false });
    expect(input.size).toBeUndefined();
    expect(input.prompt_extend).toBeUndefined();
    expect(input.negative_prompt).toBeUndefined();
  });

  it("maps Wan 2.2 image-to-video sizes to a supported resolution without an aspect ratio", () => {
    const modelId = "wan-video/wan-2.2-i2v-fast" as VideoModelId;
    const input = buildReplicateInput(modelId, "prompt", {
      size: "720*1280",
      startImage: "https://example.com/image.png",
    });

    expect(input).toMatchObject({ resolution: "720p", image: "https://example.com/image.png" });
    expect(input.aspect_ratio).toBeUndefined();
    expect(buildReplicateInput(modelId, "prompt", { size: "480p", startImage: "x" }).resolution).toBe("480p");
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
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("wraps extensionless startImage in a Blob for Replicate", async () => {
    const run = vi.fn().mockResolvedValue("https://example.com/video.mp4");
    const replicate = { run } as unknown as import("replicate").default;
    vi.spyOn(networkBoundary, "requestPublicMedia").mockResolvedValue({
      status: 200,
      statusText: "OK",
      body: Readable.from([Buffer.alloc(4)]),
      headers: new Headers({ "content-type": "image/png" }),
    });

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
