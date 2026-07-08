import { logger } from "@infrastructure/Logger";
import type { ImageGenerationService } from "@services/image-generation/ImageGenerationService";
import { stripPreviewSections } from "@services/image-generation/promptSanitization";
import type { ImagePreviewSpeedMode } from "@services/image-generation/providers/types";
import { StoryboardFramePlanner } from "./StoryboardFramePlanner";
import {
  BASE_PROVIDER,
  EDIT_PROVIDER,
  STORYBOARD_FRAME_COUNT,
} from "./constants";
import { buildEditPrompt } from "./prompts";
import {
  computeEditSeed,
  computeSeedBase,
  normalizeSeedImageUrl,
  resolveChainingUrl,
} from "./storyboardUtils";

export { STORYBOARD_FRAME_COUNT } from "./constants";

export interface StoryboardPreviewRequest {
  prompt: string;
  aspectRatio?: string;
  seedImageUrl?: string;
  referenceImageUrl?: string;
  speedMode?: ImagePreviewSpeedMode;
  seed?: number;
  userId?: string;
}

export interface StoryboardPreviewResult {
  imageUrls: string[];
  storagePaths: string[];
  deltas: string[];
  baseImageUrl: string;
}

export interface StoryboardPreviewServiceOptions {
  imageGenerationService: ImageGenerationService;
  storyboardFramePlanner: StoryboardFramePlanner;
}

export class StoryboardPreviewService {
  private readonly imageGenerationService: ImageGenerationService;
  private readonly storyboardFramePlanner: StoryboardFramePlanner;
  private readonly log = logger.child({ service: "StoryboardPreviewService" });

  constructor(options: StoryboardPreviewServiceOptions) {
    this.imageGenerationService = options.imageGenerationService;
    this.storyboardFramePlanner = options.storyboardFramePlanner;
  }

  async generateStoryboard(
    request: StoryboardPreviewRequest,
  ): Promise<StoryboardPreviewResult> {
    const trimmedPrompt = request.prompt.trim();
    if (!trimmedPrompt) {
      throw new Error("Prompt is required and must be a non-empty string");
    }
    const storyboardPrompt = stripPreviewSections(trimmedPrompt);

    const userId = request.userId ?? "anonymous";
    const seedImageUrl = normalizeSeedImageUrl(request.seedImageUrl);
    const referenceImageUrl = normalizeSeedImageUrl(request.referenceImageUrl);
    const effectiveReferenceImageUrl = seedImageUrl
      ? undefined
      : referenceImageUrl;
    this.log.info("Storyboard preview generation started", {
      userId,
      promptLength: storyboardPrompt.length,
      originalPromptLength: trimmedPrompt.length,
      aspectRatio: request.aspectRatio,
      speedMode: request.speedMode,
      seedProvided: request.seed !== undefined,
      hasSeedImage: Boolean(seedImageUrl),
      hasReferenceImage: Boolean(referenceImageUrl),
    });
    const { baseImageUrl, baseProviderUrl, baseStoragePath } =
      await this.resolveBaseImage({
        prompt: storyboardPrompt,
        ...(request.aspectRatio ? { aspectRatio: request.aspectRatio } : {}),
        ...(seedImageUrl ? { seedImageUrl } : {}),
        ...(effectiveReferenceImageUrl
          ? { referenceImageUrl: effectiveReferenceImageUrl }
          : {}),
        ...(request.speedMode ? { speedMode: request.speedMode } : {}),
        userId,
      });
    const baseProvider = seedImageUrl
      ? "seed-image"
      : effectiveReferenceImageUrl
        ? EDIT_PROVIDER
        : BASE_PROVIDER;
    this.log.info("Storyboard base image resolved", {
      userId,
      baseProvider,
      usedSeedImage: Boolean(seedImageUrl),
      usedReferenceImage: Boolean(effectiveReferenceImageUrl),
    });

    const deltas = await this.storyboardFramePlanner.planDeltas(
      storyboardPrompt,
      STORYBOARD_FRAME_COUNT,
      baseProviderUrl,
    );

    if (deltas.length !== STORYBOARD_FRAME_COUNT - 1) {
      throw new Error(
        "Storyboard planner did not return the expected number of deltas",
      );
    }

    this.log.info("Storyboard deltas planned", {
      userId,
      deltaCount: deltas.length,
    });

    const { imageUrls, storagePaths } = await this.generateKeyframes({
      baseImageUrl,
      baseProviderUrl,
      ...(baseStoragePath ? { baseStoragePath } : {}),
      keyframeDescriptions: deltas,
      prompt: storyboardPrompt,
      ...(request.aspectRatio ? { aspectRatio: request.aspectRatio } : {}),
      ...(request.speedMode ? { speedMode: request.speedMode } : {}),
      ...(request.seed !== undefined ? { seed: request.seed } : {}),
      userId,
    });

    this.log.info("Storyboard frames generated", {
      userId,
      imageCount: imageUrls.length,
      baseProvider,
      editProvider: EDIT_PROVIDER,
    });

    return {
      imageUrls,
      storagePaths,
      deltas,
      baseImageUrl,
    };
  }

  private async resolveBaseImage(options: {
    prompt: string;
    aspectRatio?: string;
    seedImageUrl?: string;
    referenceImageUrl?: string;
    speedMode?: ImagePreviewSpeedMode;
    userId: string;
  }): Promise<{
    baseImageUrl: string;
    baseProviderUrl: string;
    baseStoragePath?: string;
  }> {
    const normalizedSeedImageUrl = normalizeSeedImageUrl(options.seedImageUrl);
    if (normalizedSeedImageUrl) {
      return {
        baseImageUrl: normalizedSeedImageUrl,
        baseProviderUrl: normalizedSeedImageUrl,
      };
    }

    const referenceImageUrl = normalizeSeedImageUrl(options.referenceImageUrl);
    const provider = referenceImageUrl ? EDIT_PROVIDER : BASE_PROVIDER;

    let baseResult;
    try {
      baseResult = await this.imageGenerationService.generatePreview(
        options.prompt,
        {
          ...(options.aspectRatio ? { aspectRatio: options.aspectRatio } : {}),
          provider,
          ...(referenceImageUrl ? { inputImageUrl: referenceImageUrl } : {}),
          ...(options.speedMode ? { speedMode: options.speedMode } : {}),
          userId: options.userId,
        },
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.log.error(
        "Storyboard base image generation failed",
        error instanceof Error ? error : new Error(errorMessage),
        {
          userId: options.userId,
          provider,
          aspectRatio: options.aspectRatio,
          usedReferenceImage: Boolean(referenceImageUrl),
        },
      );
      throw error;
    }

    return {
      baseImageUrl: baseResult.imageUrl,
      baseProviderUrl: resolveChainingUrl(baseResult),
      ...(baseResult.storagePath
        ? { baseStoragePath: baseResult.storagePath }
        : {}),
    };
  }

  private async generateKeyframes(options: {
    baseImageUrl: string;
    baseProviderUrl: string;
    baseStoragePath?: string;
    keyframeDescriptions: string[];
    prompt: string;
    aspectRatio?: string;
    speedMode?: ImagePreviewSpeedMode;
    seed?: number;
    userId: string;
  }): Promise<{ imageUrls: string[]; storagePaths: string[] }> {
    const imageUrls: string[] = [options.baseImageUrl];
    const storagePaths: string[] = [options.baseStoragePath ?? ""];
    const seedBase = computeSeedBase(options.seed);

    const framePromises = options.keyframeDescriptions.map(
      async (description, index) => {
        const framePrompt = buildEditPrompt(options.prompt, description);
        const editSeed = computeEditSeed(seedBase, index);

        try {
          this.log.debug("Storyboard keyframe generation started", {
            userId: options.userId,
            frameIndex: index + 1,
            descriptionPreview: description.slice(0, 120),
          });

          const result = await this.imageGenerationService.generatePreview(
            framePrompt,
            {
              ...(options.aspectRatio
                ? { aspectRatio: options.aspectRatio }
                : {}),
              provider: EDIT_PROVIDER,
              inputImageUrl: options.baseProviderUrl,
              ...(options.speedMode ? { speedMode: options.speedMode } : {}),
              userId: options.userId,
              ...(editSeed !== undefined ? { seed: editSeed } : {}),
            },
          );

          return {
            index,
            imageUrl: result.imageUrl,
            storagePath: result.storagePath ?? "",
          };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          this.log.error(
            "Storyboard keyframe generation failed",
            error instanceof Error ? error : new Error(errorMessage),
            {
              userId: options.userId,
              frameIndex: index + 1,
              descriptionPreview: description.slice(0, 160),
              provider: EDIT_PROVIDER,
            },
          );
          throw error;
        }
      },
    );

    const results = await Promise.all(framePromises);
    results.sort((left, right) => left.index - right.index);
    for (const result of results) {
      imageUrls.push(result.imageUrl);
      storagePaths.push(result.storagePath);
    }

    return { imageUrls, storagePaths };
  }
}
