import { describe, expect, it, vi } from "vitest";
import { VIDEO_MODELS } from "@config/modelConfig";
import {
  getProviderAvailability,
  resolveAutoModelId,
  resolveProviderForModel,
} from "../ProviderRegistry";
import {
  VIDEO_PROVIDER_CREDENTIALS,
  type VideoProvider,
  type VideoProviderMap,
} from "../types";

const createProvider = (
  available: boolean,
  id: VideoProvider["id"],
): VideoProvider => ({
  id,
  displayName: id,
  requiredKey: VIDEO_PROVIDER_CREDENTIALS[id].requiredKey,
  isAvailable: () => available,
  generate: vi.fn(async () => ({
    asset: {
      id: "asset",
      url: "https://example.com/video.mp4",
      contentType: "video/mp4",
      createdAt: Date.now(),
    },
  })),
});

const createMap = (state: {
  replicate: boolean;
  openai: boolean;
  luma: boolean;
  kling: boolean;
  gemini: boolean;
}): VideoProviderMap => ({
  replicate: createProvider(state.replicate, "replicate"),
  openai: createProvider(state.openai, "openai"),
  luma: createProvider(state.luma, "luma"),
  kling: createProvider(state.kling, "kling"),
  gemini: createProvider(state.gemini, "gemini"),
});

describe("ProviderRegistry", () => {
  it("returns provider availability map from provider isAvailable()", () => {
    const providers = createMap({
      replicate: true,
      openai: false,
      luma: true,
      kling: false,
      gemini: true,
    });

    expect(getProviderAvailability(providers)).toEqual({
      replicate: true,
      openai: false,
      luma: true,
      kling: false,
      gemini: true,
    });
  });

  it("resolves auto-model with replicate highest priority", () => {
    expect(
      resolveAutoModelId({
        replicate: true,
        openai: true,
        luma: true,
        kling: true,
        gemini: true,
      }),
    ).toBe(VIDEO_MODELS.PRO);
  });

  it("resolves auto-model fallback order when replicate unavailable", () => {
    expect(
      resolveAutoModelId({
        replicate: false,
        openai: true,
        luma: true,
        kling: true,
        gemini: true,
      }),
    ).toBe(VIDEO_MODELS.SORA_2);

    expect(
      resolveAutoModelId({
        replicate: false,
        openai: false,
        luma: true,
        kling: true,
        gemini: true,
      }),
    ).toBe(VIDEO_MODELS.LUMA_RAY3);

    expect(
      resolveAutoModelId({
        replicate: false,
        openai: false,
        luma: false,
        kling: true,
        gemini: true,
      }),
    ).toBe(VIDEO_MODELS.KLING_V2_1);

    expect(
      resolveAutoModelId({
        replicate: false,
        openai: false,
        luma: false,
        kling: false,
        gemini: true,
      }),
    ).toBe(VIDEO_MODELS.VEO_3);
  });

  it("returns null for auto-model when no providers are available", () => {
    expect(
      resolveAutoModelId({
        replicate: false,
        openai: false,
        luma: false,
        kling: false,
        gemini: false,
      }),
    ).toBeNull();
  });

  it("maps model ids to expected provider keys", () => {
    expect(resolveProviderForModel(VIDEO_MODELS.SORA_2)).toBe("openai");
    expect(resolveProviderForModel(VIDEO_MODELS.SORA_2_PRO)).toBe("openai");
    expect(resolveProviderForModel(VIDEO_MODELS.LUMA_RAY3)).toBe("luma");
    expect(resolveProviderForModel(VIDEO_MODELS.KLING_V2_1)).toBe("kling");
    expect(resolveProviderForModel(VIDEO_MODELS.VEO_3)).toBe("gemini");
    expect(resolveProviderForModel(VIDEO_MODELS.PRO)).toBe("replicate");
  });
});
