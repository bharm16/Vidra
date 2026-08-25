import {
  ProviderContinuityCapabilities,
  ContinuityStrategy,
  StyleReference,
} from "./types";
import { logger } from "@infrastructure/Logger";
import {
  isKlingModelId,
  isLumaModelId,
  isOpenAISoraModelId,
  isVeoModelId,
} from "@config/videoModelRegistry";
import { getModelCapabilities } from "@services/video-generation/availability";
import type { VideoModelId } from "@shared/videoModels";

const PROVIDER_DEFAULTS: Record<string, ProviderContinuityCapabilities> = {
  runway: {
    supportsNativeStyleReference: true,
    supportsNativeCharacterReference: true,
    supportsStartImage: true,
    supportsSeedPersistence: true,
    supportsExtendVideo: true,
    styleReferenceParam: "style_reference",
  },
  kling: {
    supportsNativeStyleReference: false,
    supportsNativeCharacterReference: true,
    supportsStartImage: true,
    supportsSeedPersistence: false,
    supportsExtendVideo: false,
  },
  luma: {
    supportsNativeStyleReference: false,
    supportsNativeCharacterReference: false,
    supportsStartImage: true,
    supportsSeedPersistence: false,
    supportsExtendVideo: true,
  },
  veo: {
    supportsNativeStyleReference: false,
    supportsNativeCharacterReference: false,
    supportsStartImage: true,
    supportsSeedPersistence: false,
    supportsExtendVideo: false,
  },
  sora: {
    supportsNativeStyleReference: false,
    supportsNativeCharacterReference: false,
    supportsStartImage: true,
    supportsSeedPersistence: false,
    supportsExtendVideo: false,
  },
  replicate: {
    supportsNativeStyleReference: false,
    supportsNativeCharacterReference: false,
    supportsStartImage: true,
    supportsSeedPersistence: true,
    supportsExtendVideo: false,
  },
};

export class ProviderStyleAdapter {
  private readonly log = logger.child({ service: "ProviderStyleAdapter" });

  getContinuityStrategy(
    provider: string,
    mode: "frame-bridge" | "style-match" | "native" | "none",
    modelId?: VideoModelId,
  ): ContinuityStrategy {
    const caps = this.getCapabilities(provider, modelId);

    if (mode === "native" && caps.supportsNativeStyleReference) {
      return { type: "native-style-ref", provider };
    }

    if (mode === "frame-bridge" && caps.supportsStartImage) {
      return { type: "frame-bridge" };
    }

    if (mode === "style-match") {
      if (caps.supportsNativeStyleReference) {
        return { type: "native-style-ref", provider };
      }
      return { type: "ip-adapter" };
    }

    if (
      mode === "frame-bridge" &&
      !caps.supportsStartImage &&
      caps.supportsNativeStyleReference
    ) {
      return { type: "native-style-ref", provider };
    }

    return { type: "none" };
  }

  async buildGenerationOptions(
    provider: string,
    baseOptions: Record<string, unknown>,
    styleRef: StyleReference,
    strength: number,
  ): Promise<{ options: Record<string, unknown> }> {
    const caps = this.getCapabilities(provider);
    if (caps.supportsNativeStyleReference && caps.styleReferenceParam) {
      this.log.info("Using native style reference", { provider });
      return {
        options: {
          ...baseOptions,
          [caps.styleReferenceParam]: styleRef.frameUrl,
          style_reference_weight: strength,
        },
      };
    }

    return { options: baseOptions };
  }

  getProviderFromModel(modelId: VideoModelId): string {
    if (isKlingModelId(modelId)) return "kling";
    if (isLumaModelId(modelId)) return "luma";
    if (isOpenAISoraModelId(modelId)) return "sora";
    if (isVeoModelId(modelId)) return "veo";
    return "replicate";
  }

  getCapabilities(
    provider: string,
    modelId?: VideoModelId,
  ): ProviderContinuityCapabilities {
    const base = (PROVIDER_DEFAULTS[provider] ??
      PROVIDER_DEFAULTS.replicate) as ProviderContinuityCapabilities;
    if (!modelId) return base;
    const modelCaps = getModelCapabilities(modelId);
    return {
      supportsNativeStyleReference:
        modelCaps.supportsStyleReference ?? base.supportsNativeStyleReference,
      supportsNativeCharacterReference:
        modelCaps.supportsCharacterReference ??
        base.supportsNativeCharacterReference,
      supportsStartImage: modelCaps.supportsImageInput,
      supportsSeedPersistence:
        modelCaps.supportsSeed ?? base.supportsSeedPersistence,
      supportsExtendVideo:
        modelCaps.supportsExtendVideo ?? base.supportsExtendVideo,
      ...(base.styleReferenceParam
        ? { styleReferenceParam: base.styleReferenceParam }
        : {}),
      ...(base.maxStyleReferenceImages !== undefined
        ? { maxStyleReferenceImages: base.maxStyleReferenceImages }
        : {}),
    };
  }
}
