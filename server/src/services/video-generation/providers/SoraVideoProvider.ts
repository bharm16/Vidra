import type OpenAI from "openai";
import type { SoraModelId, VideoModelId } from "@shared/videoModels";
import type { VideoAssetStore } from "../storage";
import type { VideoGenerationOptions } from "../types";
import { generateSoraVideo } from "./soraProvider";
import {
  missingCredential,
  type VideoGenerateResult,
  type VideoProvider,
  type VideoProviderLog,
} from "./types";

/**
 * OpenAI Sora.
 *
 * Stores through the asset store itself rather than returning a URL: Sora
 * hands back a stream (`openai.videos.downloadContent`), not a fetchable
 * link. That difference stays hidden behind `generate`.
 */
export class SoraVideoProvider implements VideoProvider {
  readonly id = "openai" as const;
  readonly displayName = "OpenAI Sora";
  readonly requiredKey = "OPENAI_API_KEY";

  private readonly openai: OpenAI | null;

  constructor(options: { openai?: OpenAI | null } = {}) {
    this.openai = options.openai ?? null;
  }

  isAvailable(): boolean {
    return this.openai !== null;
  }

  async generate(
    prompt: string,
    modelId: VideoModelId,
    options: VideoGenerationOptions,
    assetStore: VideoAssetStore,
    log: VideoProviderLog,
  ): Promise<VideoGenerateResult> {
    if (!this.openai) missingCredential(this.id);

    const { asset, resolvedAspectRatio } = await generateSoraVideo(
      this.openai,
      prompt,
      modelId as SoraModelId,
      options,
      assetStore,
      log,
    );
    return {
      asset,
      ...(resolvedAspectRatio ? { resolvedAspectRatio } : {}),
    };
  }
}
