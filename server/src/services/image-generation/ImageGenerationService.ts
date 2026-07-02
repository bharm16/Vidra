/**
 * Image Generation Service
 *
 * Orchestrates preview image generation across providers and stores results.
 */

import { logger } from "@infrastructure/Logger";
import type { ImageGenerationOptions, ImageGenerationResult } from "./types";
import type {
  ImagePreviewProvider,
  ImagePreviewProviderId,
  ImagePreviewProviderSelection,
  ImagePreviewRequest,
} from "./providers/types";
import { buildProviderPlan } from "./providers/registry";
import type { ImageAssetStore } from "./storage";

type ImageGenerationServiceConfig = {
  providers: ImagePreviewProvider[];
  defaultProvider?: ImagePreviewProviderSelection;
  fallbackOrder?: ImagePreviewProviderId[];
  assetStore: ImageAssetStore;
  /** Skip storage and return provider URL directly (for testing) */
  skipStorage?: boolean;
};

export class ImageGenerationService {
  private readonly providers: ImagePreviewProvider[];
  private readonly defaultProvider: ImagePreviewProviderSelection;
  private readonly fallbackOrder: ImagePreviewProviderId[];
  private readonly assetStore: ImageAssetStore;
  private readonly skipStorage: boolean;
  private readonly log = logger.child({ service: "ImageGenerationService" });

  constructor(config: ImageGenerationServiceConfig) {
    this.providers = config.providers;
    this.defaultProvider = config.defaultProvider ?? "auto";
    this.fallbackOrder = config.fallbackOrder ?? [];
    this.assetStore = config.assetStore;
    this.skipStorage = config.skipStorage ?? false;
  }

  /**
   * Generate a preview image from a prompt
   */
  public async generatePreview(
    prompt: string | null | undefined,
    options: ImageGenerationOptions = {},
  ): Promise<ImageGenerationResult> {
    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      throw new Error("Prompt is required and must be a non-empty string");
    }

    const userId = options.userId ?? "anonymous";
    const trimmedPrompt = prompt.trim();
    const requestedProvider = options.provider ?? this.defaultProvider;

    const providerPlan = buildProviderPlan({
      providers: this.providers,
      requestedProvider,
      fallbackOrder: this.fallbackOrder,
      hasInputImage: Boolean(options.inputImageUrl?.trim()),
    });

    if (providerPlan.length === 0) {
      const error = new Error(
        `No available image preview providers for selection: ${requestedProvider}`,
      ) as Error & { statusCode?: number };
      error.statusCode = 503;
      throw error;
    }

    let lastError: unknown = null;

    for (const provider of providerPlan) {
      try {
        // Build request with only defined optional properties
        const request: ImagePreviewRequest = {
          prompt: trimmedPrompt,
          userId,
        };
        if (options.aspectRatio !== undefined)
          request.aspectRatio = options.aspectRatio;
        if (options.inputImageUrl !== undefined)
          request.inputImageUrl = options.inputImageUrl;
        if (options.seed !== undefined) request.seed = options.seed;
        if (options.speedMode !== undefined)
          request.speedMode = options.speedMode;
        if (options.outputQuality !== undefined)
          request.outputQuality = options.outputQuality;
        if (options.disablePromptTransformation !== undefined) {
          request.disablePromptTransformation =
            options.disablePromptTransformation;
        }

        const result = await provider.generatePreview(request);

        // Store to GCS unless skipped
        if (!this.skipStorage) {
          return await this.storeAndReturnResult(result, userId);
        }

        // Return provider URL directly (testing/development)
        return {
          imageUrl: result.imageUrl,
          providerUrl: result.imageUrl, // Same URL when skipping storage
          metadata: {
            aspectRatio: result.aspectRatio,
            model: result.model,
            duration: result.durationMs,
            generatedAt: new Date().toISOString(),
          },
        };
      } catch (error) {
        lastError = error;
        if (providerPlan.length > 1) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          this.log.warn("Image preview provider failed, trying next", {
            providerId: provider.id,
            errorMessage,
            userId,
          });
        }
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }

    throw new Error("Image generation failed");
  }

  /**
   * Get a signed URL for a stored image
   */
  public async getImageUrl(
    assetId: string,
    userId: string,
  ): Promise<string | null> {
    return await this.assetStore.getPublicUrl(assetId, userId);
  }

  /**
   * Check if an image exists
   */
  public async imageExists(assetId: string, userId: string): Promise<boolean> {
    return await this.assetStore.exists(assetId, userId);
  }

  /**
   * Store provider result to GCS and return enriched result
   */
  private async storeAndReturnResult(
    providerResult: {
      imageUrl: string;
      aspectRatio: string;
      model: string;
      durationMs: number;
    },
    userId: string,
  ): Promise<ImageGenerationResult> {
    const providerUrl = providerResult.imageUrl;

    try {
      const stored = await this.assetStore.storeFromUrl(
        providerResult.imageUrl,
        userId,
      );

      this.log.info("Stored generated image", {
        assetId: stored.id,
        sizeBytes: stored.sizeBytes,
        userId,
      });

      const result: ImageGenerationResult = {
        imageUrl: stored.url,
        providerUrl,
        storagePath: stored.storagePath,
        viewUrl: stored.url,
        metadata: {
          aspectRatio: providerResult.aspectRatio,
          model: providerResult.model,
          duration: providerResult.durationMs,
          generatedAt: new Date().toISOString(),
        },
      };

      if (stored.expiresAt !== undefined) {
        result.viewUrlExpiresAt = new Date(stored.expiresAt).toISOString();
      }
      if (stored.sizeBytes !== undefined) {
        result.sizeBytes = stored.sizeBytes;
      }

      return result;
    } catch (error) {
      this.log.error(
        "Failed to store image to GCS",
        error instanceof Error ? error : new Error(String(error)),
        { userId },
      );
      throw error;
    }
  }
}
