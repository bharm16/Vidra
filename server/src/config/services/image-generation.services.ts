import type { DIContainer } from '@infrastructure/DIContainer';
import { logger } from '@infrastructure/Logger';
import type { LLMClient } from '@clients/LLMClient';
import { ImageGenerationService } from '@services/image-generation/ImageGenerationService';
import { ReplicateFluxKontextFastProvider } from '@services/image-generation/providers/ReplicateFluxKontextFastProvider';
import { ReplicateFluxSchnellProvider } from '@services/image-generation/providers/ReplicateFluxSchnellProvider';
import { VideoToImagePromptTransformer } from '@services/image-generation/providers/VideoToImagePromptTransformer';
import type { ImagePreviewProvider } from '@services/image-generation/providers/types';
import type { ImageAssetStore } from '@services/image-generation/storage';
import {
  parseImagePreviewProviderOrder,
  resolveImagePreviewProviderSelection,
} from '@services/image-generation/providers/registry';
import { StoryboardFramePlanner } from '@services/image-generation/storyboard/StoryboardFramePlanner';
import { StoryboardPreviewService } from '@services/image-generation/storyboard/StoryboardPreviewService';
import { VideoPromptDetectionService } from '@services/video-prompt-analysis/services/detection/VideoPromptDetectionService';
import type { CassetteStore } from '@server/replay/CassetteStore';
import { RecordReplayImagePreviewProvider } from '@server/replay/RecordReplayImagePreviewProvider';
import { resolveAllFlags } from '../feature-flags.ts';
import type { ServiceConfig } from './service-config.types.ts';

export function registerImageGenerationServices(container: DIContainer): void {
  container.register(
    'videoPromptDetector',
    () => new VideoPromptDetectionService(),
    []
  );

  container.register(
    'videoToImageTransformer',
    (geminiClient: LLMClient | null) => {
      if (!geminiClient) {
        logger.warn(
          'Gemini client not available, video-to-image transformation disabled'
        );
        return null;
      }
      return new VideoToImagePromptTransformer({
        llmClient: geminiClient,
      });
    },
    ['geminiClient']
  );

  container.register(
    'storyboardFramePlanner',
    (geminiClient: LLMClient | null, openAIClient: LLMClient | null) => {
      if (!geminiClient) {
        logger.warn(
          'Gemini client not available, storyboard frame planner disabled'
        );
        return null;
      }
      if (!openAIClient) {
        logger.warn(
          'OpenAI client not available, vision-based storyboard planning disabled (text-only fallback)'
        );
      }
      return new StoryboardFramePlanner({
        llmClient: geminiClient,
        visionLlmClient: openAIClient,
      });
    },
    ['geminiClient', 'openAIClient']
  );

  container.register(
    'replicateFluxSchnellProvider',
    (
      transformer: VideoToImagePromptTransformer | null,
      videoPromptDetector: VideoPromptDetectionService,
      config: ServiceConfig,
      replayCassetteStore: CassetteStore | null
    ) => {
      const apiToken = config.replicate.apiToken;
      const liveProvider = apiToken
        ? new ReplicateFluxSchnellProvider({
            apiToken,
            promptTransformer: transformer,
            videoPromptDetector,
          })
        : null;

      if (replayCassetteStore) {
        const { flags } = resolveAllFlags(process.env);
        if (flags.replayMode === 'replay') {
          return new RecordReplayImagePreviewProvider({
            mode: 'replay',
            store: replayCassetteStore,
          });
        }
        if (flags.replayMode === 'record' && liveProvider) {
          return new RecordReplayImagePreviewProvider({
            mode: 'record',
            store: replayCassetteStore,
            inner: liveProvider,
          });
        }
      }

      if (!liveProvider) {
        logger.warn(
          'REPLICATE_API_TOKEN not provided, Replicate image provider disabled'
        );
      }
      return liveProvider;
    },
    [
      'videoToImageTransformer',
      'videoPromptDetector',
      'config',
      'replayCassetteStore',
    ]
  );

  container.register(
    'replicateFluxKontextFastProvider',
    (
      transformer: VideoToImagePromptTransformer | null,
      videoPromptDetector: VideoPromptDetectionService,
      config: ServiceConfig
    ) => {
      const apiToken = config.replicate.apiToken;
      if (!apiToken) {
        logger.warn(
          'REPLICATE_API_TOKEN not provided, Replicate image provider disabled'
        );
        return null;
      }
      return new ReplicateFluxKontextFastProvider({
        apiToken,
        promptTransformer: transformer,
        videoPromptDetector,
      });
    },
    ['videoToImageTransformer', 'videoPromptDetector', 'config']
  );

  container.register(
    'imageGenerationService',
    (
      replicateProvider: ImagePreviewProvider | null,
      kontextProvider: ReplicateFluxKontextFastProvider | null,
      imageAssetStore: ImageAssetStore,
      config: ServiceConfig
    ) => {
      const providers = [replicateProvider, kontextProvider].filter(
        Boolean
      ) as ImagePreviewProvider[];

      if (providers.length === 0) {
        logger.warn('No image preview providers configured');
        return null;
      }

      const vp = config.videoProviders;
      const selection = resolveImagePreviewProviderSelection(
        vp.imagePreviewProvider
      );
      if (vp.imagePreviewProvider && !selection) {
        logger.warn('Invalid IMAGE_PREVIEW_PROVIDER value', {
          value: vp.imagePreviewProvider,
        });
      }

      const rawOrder = vp.imagePreviewProviderOrder.join(',') || undefined;
      const fallbackOrder = parseImagePreviewProviderOrder(rawOrder);
      if (
        vp.imagePreviewProviderOrder.length > 0 &&
        fallbackOrder.length === 0
      ) {
        logger.warn('No valid IMAGE_PREVIEW_PROVIDER_ORDER entries found', {
          value: vp.imagePreviewProviderOrder.join(','),
        });
      }

      return new ImageGenerationService({
        providers,
        assetStore: imageAssetStore,
        defaultProvider: selection ?? 'auto',
        fallbackOrder,
      });
    },
    [
      'replicateFluxSchnellProvider',
      'replicateFluxKontextFastProvider',
      'imageAssetStore',
      'config',
    ]
  );

  container.register(
    'storyboardPreviewService',
    (
      imageGenerationService: ImageGenerationService | null,
      storyboardFramePlanner: StoryboardFramePlanner | null
    ) => {
      if (!imageGenerationService || !storyboardFramePlanner) {
        logger.warn('Storyboard preview service disabled', {
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
    ['imageGenerationService', 'storyboardFramePlanner']
  );
}
