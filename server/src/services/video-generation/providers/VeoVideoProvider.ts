import type { VideoModelId } from "@shared/videoModels";
import type { VideoAssetStore } from "../storage";
import type { VideoGenerationOptions } from "../types";
import { DEFAULT_VEO_BASE_URL, generateVeoVideo } from "./veoProvider";
import { normalizeBaseUrl } from "@clients/videoProviderClients";
import {
  missingCredential,
  type VideoGenerateResult,
  type VideoProvider,
  type VideoProviderLog,
} from "./types";

/**
 * Google Veo, reached through the Gemini API.
 *
 * Stores through the asset store itself: Veo returns an authenticated URI
 * that has to be streamed, not a fetchable URL.
 */
export class VeoVideoProvider implements VideoProvider {
  readonly id = "gemini" as const;
  readonly displayName = "Google Veo";
  readonly requiredKey = "GEMINI_API_KEY";

  private readonly apiKey: string | null;
  private readonly baseUrl: string;

  constructor(options: { apiKey?: string | null; baseUrl?: string } = {}) {
    this.apiKey = options.apiKey ?? null;
    this.baseUrl = normalizeBaseUrl(options.baseUrl, DEFAULT_VEO_BASE_URL);
  }

  isAvailable(): boolean {
    return this.apiKey !== null;
  }

  async generate(
    prompt: string,
    _modelId: VideoModelId,
    options: VideoGenerationOptions,
    assetStore: VideoAssetStore,
    log: VideoProviderLog,
  ): Promise<VideoGenerateResult> {
    if (!this.apiKey) missingCredential(this.id);

    const asset = await generateVeoVideo(
      this.apiKey,
      this.baseUrl,
      prompt,
      options,
      assetStore,
      log,
    );
    return { asset };
  }
}
