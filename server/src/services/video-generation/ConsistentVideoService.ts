import type { VideoGenerationOptions } from "@services/video-generation/types";
import type KeyframeGenerationService from "./KeyframeGenerationService";
import type { KeyframeResult } from "./KeyframeGenerationService";
import AssetService from "@services/asset/AssetService";
import { logger } from "@infrastructure/Logger";

/**
 * Keyframe-only consistent generation. The full consistent-video pipeline
 * (prompt → keyframe → video) was removed with its dead /video and
 * /from-keyframe routes; /generate/consistent/keyframe is the surviving
 * surface.
 */
export class ConsistentVideoService {
  private readonly keyframeService: KeyframeGenerationService;
  private readonly assetService: AssetService;
  private readonly log = logger.child({ service: "ConsistentVideoService" });

  constructor(
    options: {
      keyframeService?: KeyframeGenerationService;
      assetService?: AssetService;
    } = {},
  ) {
    if (!options.keyframeService) {
      throw new Error("KeyframeGenerationService is required");
    }
    if (!options.assetService) {
      throw new Error("AssetService is required");
    }
    this.keyframeService = options.keyframeService;
    this.assetService = options.assetService;
  }

  async generateKeyframeOnly({
    userId,
    characterId,
    prompt,
    aspectRatio = "16:9",
    count = 1,
  }: {
    userId: string;
    characterId: string;
    prompt: string;
    aspectRatio?: VideoGenerationOptions["aspectRatio"];
    count?: number;
  }): Promise<KeyframeResult | KeyframeResult[]> {
    const resolved = await this.assetService.resolvePrompt(userId, prompt);
    const character = await this.assetService.getAssetForGeneration(
      userId,
      characterId,
    );
    const keyframeAspectRatio = this.resolveKeyframeAspectRatio(aspectRatio);

    if (count === 1) {
      return await this.keyframeService.generateKeyframe({
        prompt: resolved.expandedText,
        character: {
          primaryImageUrl: character.primaryImageUrl,
          negativePrompt: character.negativePrompt,
          faceEmbedding: character.faceEmbedding,
        },
        aspectRatio: keyframeAspectRatio,
      });
    }

    return await this.keyframeService.generateKeyframeOptions({
      prompt: resolved.expandedText,
      character: {
        primaryImageUrl: character.primaryImageUrl,
        negativePrompt: character.negativePrompt,
        faceEmbedding: character.faceEmbedding,
      },
      aspectRatio: keyframeAspectRatio,
      count,
    });
  }

  private resolveKeyframeAspectRatio(
    aspectRatio?: VideoGenerationOptions["aspectRatio"],
  ): "16:9" | "9:16" | "1:1" | "4:3" | "3:4" {
    if (!aspectRatio) return "16:9";
    const allowed = new Set<string>(["16:9", "9:16", "1:1", "4:3", "3:4"]);
    return allowed.has(aspectRatio)
      ? (aspectRatio as "16:9" | "9:16" | "1:1" | "4:3" | "3:4")
      : "16:9";
  }
}

export default ConsistentVideoService;
