import { logger } from "@infrastructure/Logger";
import type { VideoAssetStore, VideoAssetStream } from "./storage";
import type {
  VideoAvailabilityReport,
  VideoAvailabilitySnapshot,
  VideoGenerationOptions,
  VideoGenerationResult,
  VideoGenerationServiceOptions,
  VideoModelAvailability,
  VideoProviderAvailability,
  VideoModelId,
} from "./types";
import type { VideoProviderMap } from "./providers/types";
import { getProviderAvailability } from "./providers/ProviderRegistry";
import { generateVideoWorkflow } from "./workflows/generateVideo";
import {
  getAvailabilityReport,
  getAvailabilitySnapshot,
  getModelAvailability,
} from "./availability";

/**
 * VideoGenerationService - Orchestrates video generation providers
 */
export class VideoGenerationService {
  private readonly providers: VideoProviderMap;
  private readonly log = logger.child({ service: "VideoGenerationService" });
  private readonly assetStore: VideoAssetStore;

  constructor(options: VideoGenerationServiceOptions) {
    this.providers = options.providers;
    if (!options.assetStore) {
      throw new Error(
        "VideoGenerationService requires an injected video asset store",
      );
    }
    this.assetStore = options.assetStore;
  }

  /**
   * Generate a video from a prompt
   *
   * @param prompt - The optimized prompt
   * @param options - Generation options (model, aspect ratio, etc.)
   * @returns Stored video asset details
   */
  async generateVideo(
    prompt: string,
    options: VideoGenerationOptions = {},
  ): Promise<VideoGenerationResult> {
    return await generateVideoWorkflow(
      prompt,
      options,
      this.providers,
      this.assetStore,
      this.log,
    );
  }

  public async getVideoContent(id: string): Promise<VideoAssetStream | null> {
    return await this.assetStore.getStream(id);
  }

  public async getVideoUrl(id: string): Promise<string | null> {
    return await this.assetStore.getPublicUrl(id);
  }

  public getProviderAvailability(): VideoProviderAvailability {
    return getProviderAvailability(this.providers);
  }

  public getModelAvailability(model?: string | null): VideoModelAvailability {
    return getModelAvailability(
      model,
      this.getProviderAvailability(),
      this.log,
    );
  }

  public getAvailabilityReport(modelIds: string[]): VideoAvailabilityReport {
    const availabilityLog = {
      warn: (message: string, meta?: Record<string, unknown>) => {
        if (
          message === "Unknown video model requested; falling back to default"
        ) {
          return;
        }
        this.log.warn(message, meta);
      },
    };

    return getAvailabilityReport(
      modelIds,
      this.getProviderAvailability(),
      availabilityLog,
    );
  }

  public getAvailabilitySnapshot(
    modelIds: VideoModelId[],
  ): VideoAvailabilitySnapshot {
    const availabilityLog = {
      warn: (message: string, meta?: Record<string, unknown>) => {
        if (
          message === "Unknown video model requested; falling back to default"
        ) {
          return;
        }
        this.log.warn(message, meta);
      },
    };

    return getAvailabilitySnapshot(
      modelIds,
      this.getProviderAvailability(),
      availabilityLog,
    );
  }
}
