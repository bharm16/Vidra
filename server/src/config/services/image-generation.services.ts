import type { DIContainer } from "@infrastructure/DIContainer";
import { logger } from "@infrastructure/Logger";
import type { LLMClient } from "@clients/LLMClient";
import { ImageGenerationService } from "@services/image-generation/ImageGenerationService";
import { ReplicateFluxKontextFastProvider } from "@services/image-generation/providers/ReplicateFluxKontextFastProvider";
import { ReplicateFluxSchnellProvider } from "@services/image-generation/providers/ReplicateFluxSchnellProvider";
import type { ImagePreviewProvider } from "@services/image-generation/providers/types";
import type { ImageAssetStore } from "@services/image-generation/storage";
import {
  parseImagePreviewProviderOrder,
  resolveImagePreviewProviderSelection,
} from "@services/image-generation/providers/registry";
import { StoryboardFramePlanner } from "@services/image-generation/storyboard/StoryboardFramePlanner";
import { StoryboardPreviewService } from "@services/image-generation/storyboard/StoryboardPreviewService";
import type { CassetteStore } from "@server/replay/CassetteStore";
import { RecordReplayImagePreviewProvider } from "@server/replay/RecordReplayImagePreviewProvider";
import { resolveAllFlags } from "../feature-flags.ts";
import type { ServiceConfig } from "./service-config.types.ts";

/**
 * Every image preview provider registration that feeds ImageGenerationService.
 * A provider missing from this list never reaches the service; a provider in
 * it is replay-wrapped by `throughReplaySeam` below, so no provider can escape
 * the seam by omission.
 */
export const IMAGE_PREVIEW_PROVIDER_TOKENS = [
  "replicateFluxSchnellProvider",
  "replicateFluxKontextFastProvider",
] as const;

/**
 * Single gateway for every image preview provider registration: wraps the
 * provider in the record/replay seam whenever REPLAY_MODE is active, and
 * returns null (with the usual warning) when the live provider has no token.
 */
function throughReplaySeam(
  provider: ImagePreviewProvider,
  replayCassetteStore: CassetteStore | null,
): ImagePreviewProvider | null {
  if (replayCassetteStore) {
    const { flags } = resolveAllFlags(process.env);
    if (flags.replayMode === "replay") {
      return new RecordReplayImagePreviewProvider({
        mode: "replay",
        store: replayCassetteStore,
        inner: provider,
      });
    }
    if (flags.replayMode === "record" && provider.isAvailable()) {
      return new RecordReplayImagePreviewProvider({
        mode: "record",
        store: replayCassetteStore,
        inner: provider,
      });
    }
  }

  if (!provider.isAvailable()) {
    logger.warn("REPLICATE_API_TOKEN not provided, image provider disabled", {
      provider: provider.id,
    });
    return null;
  }
  return provider;
}

export function registerImageGenerationServices(container: DIContainer): void {
  container.register(
    "storyboardFramePlanner",
    (geminiClient: LLMClient | null, openAIClient: LLMClient | null) => {
      if (!geminiClient) {
        logger.warn(
          "Gemini client not available, storyboard frame planner disabled",
        );
        return null;
      }
      if (!openAIClient) {
        logger.warn(
          "OpenAI client not available, vision-based storyboard planning disabled (text-only fallback)",
        );
      }
      return new StoryboardFramePlanner({
        llmClient: geminiClient,
        visionLlmClient: openAIClient,
      });
    },
    ["geminiClient", "openAIClient"],
  );

  container.register(
    "replicateFluxSchnellProvider",
    (config: ServiceConfig, replayCassetteStore: CassetteStore | null) =>
      throughReplaySeam(
        new ReplicateFluxSchnellProvider({
          ...(config.replicate.apiToken
            ? { apiToken: config.replicate.apiToken }
            : {}),
        }),
        replayCassetteStore,
      ),
    ["config", "replayCassetteStore"],
  );

  container.register(
    "replicateFluxKontextFastProvider",
    (config: ServiceConfig, replayCassetteStore: CassetteStore | null) =>
      throughReplaySeam(
        new ReplicateFluxKontextFastProvider({
          ...(config.replicate.apiToken
            ? { apiToken: config.replicate.apiToken }
            : {}),
        }),
        replayCassetteStore,
      ),
    ["config", "replayCassetteStore"],
  );

  container.register(
    "imageGenerationService",
    (
      replicateProvider: ImagePreviewProvider | null,
      kontextProvider: ImagePreviewProvider | null,
      imageAssetStore: ImageAssetStore,
      config: ServiceConfig,
    ) => {
      const providers = [replicateProvider, kontextProvider].filter(
        Boolean,
      ) as ImagePreviewProvider[];

      if (providers.length === 0) {
        logger.warn("No image preview providers configured");
        return null;
      }

      const vp = config.videoProviders;
      const selection = resolveImagePreviewProviderSelection(
        vp.imagePreviewProvider,
      );
      if (vp.imagePreviewProvider && !selection) {
        logger.warn("Invalid IMAGE_PREVIEW_PROVIDER value", {
          value: vp.imagePreviewProvider,
        });
      }

      const rawOrder = vp.imagePreviewProviderOrder.join(",") || undefined;
      const fallbackOrder = parseImagePreviewProviderOrder(rawOrder);
      if (
        vp.imagePreviewProviderOrder.length > 0 &&
        fallbackOrder.length === 0
      ) {
        logger.warn("No valid IMAGE_PREVIEW_PROVIDER_ORDER entries found", {
          value: vp.imagePreviewProviderOrder.join(","),
        });
      }

      return new ImageGenerationService({
        providers,
        assetStore: imageAssetStore,
        defaultProvider: selection ?? "auto",
        fallbackOrder,
      });
    },
    [...IMAGE_PREVIEW_PROVIDER_TOKENS, "imageAssetStore", "config"],
  );

  container.register(
    "storyboardPreviewService",
    (
      imageGenerationService: ImageGenerationService | null,
      storyboardFramePlanner: StoryboardFramePlanner | null,
    ) => {
      if (!imageGenerationService || !storyboardFramePlanner) {
        logger.warn("Storyboard preview service disabled", {
          imageGenerationServiceAvailable: Boolean(imageGenerationService),
          storyboardFramePlannerAvailable: Boolean(storyboardFramePlanner),
        });
        return null;
      }
      return new StoryboardPreviewService({
        imageGenerationService,
        storyboardFramePlanner,
      });
    },
    ["imageGenerationService", "storyboardFramePlanner"],
  );
}
