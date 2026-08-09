import type Replicate from "replicate";
import type { VideoModelId } from "@shared/videoModels";
import type { VideoAssetStore } from "../storage";
import { storeVideoFromUrl } from "../storage/utils";
import type { VideoGenerationOptions } from "../types";
import { generateReplicateVideo } from "./replicateProvider";
import {
  missingCredential,
  type VideoGenerateResult,
  type VideoProvider,
  type VideoProviderLog,
} from "./types";

/** Wan and other Replicate-hosted video models. */
export class ReplicateVideoProvider implements VideoProvider {
  readonly id = "replicate" as const;
  readonly displayName = "Replicate";
  readonly requiredKey = "REPLICATE_API_TOKEN";

  private readonly replicate: Replicate | null;

  constructor(options: { replicate?: Replicate | null } = {}) {
    this.replicate = options.replicate ?? null;
  }

  isAvailable(): boolean {
    return this.replicate !== null;
  }

  async generate(
    prompt: string,
    modelId: VideoModelId,
    options: VideoGenerationOptions,
    assetStore: VideoAssetStore,
    log: VideoProviderLog,
  ): Promise<VideoGenerateResult> {
    if (!this.replicate) missingCredential(this.id);

    const { url, seed } = await generateReplicateVideo(
      this.replicate,
      prompt,
      modelId,
      options,
      log,
    );
    const asset = await storeVideoFromUrl(assetStore, url, log);
    return { asset, ...(seed !== undefined ? { seed } : {}) };
  }
}
