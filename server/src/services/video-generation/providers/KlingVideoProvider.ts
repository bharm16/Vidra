import type { KlingModelId, VideoModelId } from "@shared/videoModels";
import type { VideoAssetStore } from "../storage";
import { storeVideoFromUrl } from "../storage/utils";
import type { VideoGenerationOptions } from "../types";
import { DEFAULT_KLING_BASE_URL, generateKlingVideo } from "./klingProvider";
import { normalizeBaseUrl } from "@clients/videoProviderClients";
import {
  missingCredential,
  type VideoGenerateResult,
  type VideoProvider,
  type VideoProviderLog,
} from "./types";

/** Kling (official API). Raw HTTP, so it holds a key rather than an SDK. */
export class KlingVideoProvider implements VideoProvider {
  readonly id = "kling" as const;
  readonly displayName = "Kling";
  readonly requiredKey = "KLING_API_KEY";

  private readonly apiKey: string | null;
  private readonly baseUrl: string;

  constructor(options: { apiKey?: string | null; baseUrl?: string } = {}) {
    this.apiKey = options.apiKey ?? null;
    this.baseUrl = normalizeBaseUrl(options.baseUrl, DEFAULT_KLING_BASE_URL);
  }

  isAvailable(): boolean {
    return this.apiKey !== null;
  }

  async generate(
    prompt: string,
    modelId: VideoModelId,
    options: VideoGenerationOptions,
    assetStore: VideoAssetStore,
    log: VideoProviderLog,
  ): Promise<VideoGenerateResult> {
    if (!this.apiKey) missingCredential(this.id);

    const { url, resolvedAspectRatio } = await generateKlingVideo(
      this.apiKey,
      this.baseUrl,
      prompt,
      modelId as KlingModelId,
      options,
      log,
    );
    const asset = await storeVideoFromUrl(assetStore, url, log);
    return {
      asset,
      ...(resolvedAspectRatio ? { resolvedAspectRatio } : {}),
    };
  }
}
