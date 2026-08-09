import { describe, expect, it, vi } from "vitest";
import { AppError } from "@server/types/common";
import { generateVideoWorkflow } from "../workflows/generateVideo";
import {
  VIDEO_PROVIDER_CREDENTIALS,
  type VideoProvider,
  type VideoProviderMap,
} from "../providers/types";
import type { VideoAssetStore, StoredVideoAsset } from "../storage";

const createAssetStore = (): VideoAssetStore => ({
  storeFromBuffer: vi.fn(async () => ({
    id: "asset-buffer",
    url: "https://example.com/buffer.mp4",
    contentType: "video/mp4",
    createdAt: Date.now(),
  })),
  storeFromStream: vi.fn(async () => ({
    id: "asset-stream",
    url: "https://example.com/stream.mp4",
    contentType: "video/mp4",
    createdAt: Date.now(),
  })),
  getStream: vi.fn(async () => null),
  getPublicUrl: vi.fn(async () => null),
  cleanupExpired: vi.fn(async () => 0),
});

const createProvider = (
  id: VideoProvider["id"],
  isAvailable: boolean,
  asset: StoredVideoAsset,
): VideoProvider => ({
  id,
  displayName: id,
  requiredKey: VIDEO_PROVIDER_CREDENTIALS[id].requiredKey,
  isAvailable: () => isAvailable,
  generate: vi.fn(async () => ({ asset })),
});

const createProviderMap = (
  overrides?: Partial<Record<VideoProvider["id"], boolean>>,
): VideoProviderMap => {
  const sharedAsset: StoredVideoAsset = {
    id: "asset-1",
    url: "https://example.com/video.mp4",
    contentType: "video/mp4",
    createdAt: Date.now(),
  };

  return {
    replicate: createProvider(
      "replicate",
      overrides?.replicate ?? true,
      sharedAsset,
    ),
    openai: createProvider("openai", overrides?.openai ?? true, sharedAsset),
    luma: createProvider("luma", overrides?.luma ?? true, sharedAsset),
    kling: createProvider("kling", overrides?.kling ?? true, sharedAsset),
    gemini: createProvider("gemini", overrides?.gemini ?? true, sharedAsset),
  };
};

const createLog = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

describe("generateVideoWorkflow", () => {
  it("throws VIDEO_MODEL_UNAVAILABLE when credentials for requested model are missing", async () => {
    const providers = createProviderMap({
      openai: false,
      replicate: false,
      luma: false,
      kling: false,
      gemini: false,
    });
    const assetStore = createAssetStore();
    const log = createLog();

    await expect(
      generateVideoWorkflow(
        "cinematic prompt",
        { model: "sora-2" },
        providers,
        assetStore,
        log,
      ),
    ).rejects.toMatchObject({
      code: "VIDEO_MODEL_UNAVAILABLE",
      statusCode: 424,
    });
  });

  it("dispatches to provider resolved from canonical model id", async () => {
    const providers = createProviderMap({ openai: true });
    const assetStore = createAssetStore();
    const log = createLog();

    const result = await generateVideoWorkflow(
      "a runner through rain",
      { model: "sora-2" },
      providers,
      assetStore,
      log,
    );

    const openAIGenerate = providers.openai.generate;
    expect(openAIGenerate).toHaveBeenCalledTimes(1);
    expect(openAIGenerate).toHaveBeenCalledWith(
      "a runner through rain",
      "sora-2",
      expect.objectContaining({ model: "sora-2" }),
      assetStore,
      log,
    );

    expect(result).toMatchObject({
      assetId: "asset-1",
      videoUrl: "https://example.com/video.mp4",
      contentType: "video/mp4",
      inputMode: "t2v",
    });
  });

  it("uses i2v mode and startImageUrl when startImage is provided", async () => {
    const providers = createProviderMap({ openai: true });
    const assetStore = createAssetStore();
    const log = createLog();

    const result = await generateVideoWorkflow(
      "portrait shot",
      { model: "sora-2", startImage: "https://images.example.com/start.png" },
      providers,
      assetStore,
      log,
    );

    expect(result.inputMode).toBe("i2v");
    expect(result.startImageUrl).toBe("https://images.example.com/start.png");
  });

  it("uses i2v mode when inputReference is provided", async () => {
    const providers = createProviderMap({ openai: true });
    const assetStore = createAssetStore();
    const log = createLog();

    const result = await generateVideoWorkflow(
      "portrait shot",
      {
        model: "sora-2",
        inputReference: "https://images.example.com/reference.png",
      },
      providers,
      assetStore,
      log,
    );

    expect(result.inputMode).toBe("i2v");
    expect(result.startImageUrl).toBe(
      "https://images.example.com/reference.png",
    );
  });

  it("propagates provider errors and logs failure", async () => {
    const providers = createProviderMap({ openai: true });
    const assetStore = createAssetStore();
    const log = createLog();
    const providerError = new Error("Provider rate limit");
    providers.openai.generate = vi.fn(async () => {
      throw providerError;
    });

    await expect(
      generateVideoWorkflow(
        "a cat on skateboard",
        { model: "sora-2" },
        providers,
        assetStore,
        log,
      ),
    ).rejects.toThrow("Provider rate limit");

    expect(log.error).toHaveBeenCalledWith(
      "Video generation failed",
      providerError,
    );
  });

  it("passes through seed from provider generation result", async () => {
    const providers = createProviderMap({ openai: true });
    const assetStore = createAssetStore();
    const log = createLog();
    providers.openai.generate = vi.fn(async () => ({
      asset: {
        id: "asset-seeded",
        url: "https://example.com/seeded.mp4",
        contentType: "video/mp4",
        createdAt: Date.now(),
      },
      seed: 1234,
    }));

    const result = await generateVideoWorkflow(
      "seeded prompt",
      { model: "sora-2" },
      providers,
      assetStore,
      log,
    );

    expect(result.seed).toBe(1234);
  });

  it("returns structured AppError details for unsupported model selection", async () => {
    const providers = createProviderMap({
      replicate: true,
      openai: true,
      luma: true,
      kling: true,
      gemini: true,
    });
    const assetStore = createAssetStore();
    const log = createLog();

    await expect(
      generateVideoWorkflow(
        "x",
        { model: "not-a-model" as never },
        providers,
        assetStore,
        log,
      ),
    ).rejects.toBeInstanceOf(AppError);

    await expect(
      generateVideoWorkflow(
        "x",
        { model: "not-a-model" as never },
        providers,
        assetStore,
        log,
      ),
    ).rejects.toMatchObject({
      code: "VIDEO_MODEL_UNAVAILABLE",
      statusCode: 400,
      details: expect.objectContaining({
        reason: "unsupported_model",
      }),
    });
  });

  it("propagates resolvedAspectRatio from provider to result", async () => {
    const providers = createProviderMap({ kling: true });
    const assetStore = createAssetStore();
    const log = createLog();
    providers.kling.generate = vi.fn(async () => ({
      asset: {
        id: "asset-ar",
        url: "https://example.com/ar.mp4",
        contentType: "video/mp4",
        createdAt: Date.now(),
      },
      resolvedAspectRatio: "16:9",
    }));

    const result = await generateVideoWorkflow(
      "wide shot",
      { model: "kling-v2-1-master", aspectRatio: "21:9" },
      providers,
      assetStore,
      log,
    );

    expect(result.resolvedAspectRatio).toBe("16:9");
  });

  it("omits resolvedAspectRatio when provider does not return one", async () => {
    const providers = createProviderMap({ openai: true });
    const assetStore = createAssetStore();
    const log = createLog();

    const result = await generateVideoWorkflow(
      "simple prompt",
      { model: "sora-2" },
      providers,
      assetStore,
      log,
    );

    expect(result.resolvedAspectRatio).toBeUndefined();
  });

  it("enforces the workflow watchdog timeout when provider polling fails to terminate", async () => {
    const { setTimeoutPolicyConfig } = await import(
      "../providers/timeoutPolicy"
    );
    const savedPoll = 1000;
    const savedWorkflow = 2000;
    setTimeoutPolicyConfig({
      pollTimeoutMs: savedPoll,
      workflowTimeoutMs: savedWorkflow,
    });

    vi.useFakeTimers();
    try {
      const providers = createProviderMap({ openai: true });
      providers.openai.generate = vi.fn(
        () =>
          new Promise<{ asset: StoredVideoAsset }>(() => {
            // Intentionally unresolved promise for watchdog coverage.
          }),
      );

      const promise = generateVideoWorkflow(
        "watchdog prompt",
        { model: "sora-2" },
        providers,
        createAssetStore(),
        createLog(),
      );

      const assertion = expect(promise).rejects.toThrow(
        /workflow timeout exceeded/i,
      );
      await vi.advanceTimersByTimeAsync(11_000);
      await assertion;
    } finally {
      // Restore defaults
      setTimeoutPolicyConfig({
        pollTimeoutMs: 270_000,
        workflowTimeoutMs: 300_000,
      });
      vi.useRealTimers();
    }
  });
});
