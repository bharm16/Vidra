import { logger } from "@infrastructure/Logger";
import { assertUrlSafe } from "@server/shared/urlValidation";
import type { AssetService } from "@services/asset/AssetService";
import type KeyframeGenerationService from "@services/video-generation/KeyframeGenerationService";
import { StorageService } from "@services/storage/StorageService";
import type { CharacterKeyframeOptions } from "./types";

export class CharacterKeyframeService {
  private readonly log = logger.child({ service: "CharacterKeyframeService" });

  constructor(
    private keyframeService: KeyframeGenerationService,
    private assetService: AssetService,
    private storage: StorageService,
  ) {}

  async generateKeyframe(options: CharacterKeyframeOptions): Promise<string> {
    const { userId, prompt, characterAssetId, aspectRatio, faceStrength } =
      options;

    const character = await this.assetService.getAssetForGeneration(
      userId,
      characterAssetId,
    );
    if (!character.primaryImageUrl) {
      throw new Error("Character has no primary reference image");
    }

    this.log.info("Generating PuLID keyframe", {
      userId,
      characterAssetId,
    });

    const keyframe = await this.keyframeService.generateKeyframe({
      prompt,
      character: {
        primaryImageUrl: character.primaryImageUrl,
        negativePrompt: character.negativePrompt,
        faceEmbedding: character.faceEmbedding,
      },
      aspectRatio,
      faceStrength,
    });

    assertUrlSafe(keyframe.imageUrl, "characterKeyframeImageUrl");
    const response = await fetch(keyframe.imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download keyframe (${response.status})`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const stored = await this.storage.savePreviewImage(userId, buffer, {
      source: "pulid",
      characterAssetId,
    });

    return stored.viewUrl;
  }
}
