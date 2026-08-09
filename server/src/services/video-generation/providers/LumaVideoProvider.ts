import type { LumaAI } from "lumaai";
import type { VideoModelId } from "@shared/videoModels";
import type { VideoAssetStore } from "../storage";
import { storeVideoFromUrl } from "../storage/utils";
import type { VideoGenerationOptions } from "../types";
import { generateLumaVideo } from "./lumaProvider";
import {
  missingCredential,
  type VideoGenerateResult,
  type VideoProvider,
  type VideoProviderLog,
} from "./types";

/** Luma Dream Machine (Ray-3). Serves one model, so `modelId` is unused. */
export class LumaVideoProvider implements VideoProvider {
  readonly id = "luma" as const;
  readonly displayName = "Luma Dream Machine";
  readonly requiredKey = "LUMA_API_KEY";

  private readonly luma: LumaAI | null;

  constructor(options: { luma?: LumaAI | null } = {}) {
    this.luma = options.luma ?? null;
  }

  isAvailable(): boolean {
    return this.luma !== null;
  }

  async generate(
    prompt: string,
    _modelId: VideoModelId,
    options: VideoGenerationOptions,
    assetStore: VideoAssetStore,
    log: VideoProviderLog,
  ): Promise<VideoGenerateResult> {
    if (!this.luma) missingCredential(this.id);

    const url = await generateLumaVideo(this.luma, prompt, options, log);
    const asset = await storeVideoFromUrl(assetStore, url, log);
    return { asset };
  }
}
