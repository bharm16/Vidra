import Replicate from "replicate";
import { logger } from "@infrastructure/Logger";
import { generateId } from "@utils/uid";
import { StorageService } from "@services/storage/StorageService";
import { assertUrlSafe } from "@server/shared/urlValidation";
import type { FrameBridge, StyleMatchOptions, StyleReference } from "./types";

const DEFAULT_IP_ADAPTER_MODEL =
  "lucataco/ip-adapter-sdxl:cbe488c8df305a99d155b038abdf003a0bba4e82352e561fbaab2c8c9b70a96e";

export const STYLE_STRENGTH_PRESETS = {
  loose: 0.4,
  balanced: 0.6,
  strict: 0.8,
  exact: 0.95,
} as const;

export class StyleReferenceService {
  private readonly replicate: Replicate;
  private readonly ipAdapterModel: string;
  private readonly log = logger.child({ service: "StyleReferenceService" });

  constructor(
    private storage: StorageService,
    replicateApiToken?: string,
    ipAdapterModel?: string,
  ) {
    this.replicate = new Replicate(
      replicateApiToken ? { auth: replicateApiToken } : {},
    );
    this.ipAdapterModel = ipAdapterModel || DEFAULT_IP_ADAPTER_MODEL;
  }

  async createFromVideo(
    videoId: string,
    frame: FrameBridge,
  ): Promise<StyleReference> {
    return {
      id: this.generateId(),
      sourceVideoId: videoId,
      sourceFrameIndex: 0,
      frameUrl: frame.frameUrl,
      frameTimestamp: frame.frameTimestamp,
      resolution: frame.resolution,
      aspectRatio: frame.aspectRatio,
      extractedAt: new Date(),
    };
  }

  async createFromImage(
    imageUrl: string,
    resolution: { width: number; height: number },
  ): Promise<StyleReference> {
    return {
      id: this.generateId(),
      sourceVideoId: "image-upload",
      sourceFrameIndex: 0,
      frameUrl: imageUrl,
      frameTimestamp: 0,
      resolution,
      aspectRatio: this.calculateAspectRatio(
        resolution.width,
        resolution.height,
      ),
      extractedAt: new Date(),
    };
  }

  async generateStyledKeyframe(options: StyleMatchOptions): Promise<string> {
    this.log.info("Generating style-matched keyframe", {
      strength: options.strength,
      hasNegativePrompt: Boolean(options.negativePrompt),
    });

    const startTime = Date.now();

    const modelId = this.ipAdapterModel as
      | `${string}/${string}`
      | `${string}/${string}:${string}`;
    const output = (await this.replicate.run(modelId, {
      input: {
        prompt: options.prompt,
        ip_adapter_image: options.styleReferenceUrl,
        ip_adapter_scale: options.strength,
        negative_prompt:
          options.negativePrompt || "blurry, low quality, distorted",
        num_inference_steps: 30,
        guidance_scale: 7.5,
        width: this.getWidthForAspectRatio(options.aspectRatio),
        height: this.getHeightForAspectRatio(options.aspectRatio),
      },
    })) as string[];

    if (!output || !output[0]) {
      throw new Error("IP-Adapter returned no output");
    }

    const storedUrl = await this.storeKeyframe(
      options.userId,
      output[0],
      options,
    );

    this.log.info("Style-matched keyframe generated", {
      durationMs: Date.now() - startTime,
    });

    return storedUrl;
  }

  private async storeKeyframe(
    userId: string,
    sourceUrl: string,
    options: StyleMatchOptions,
  ): Promise<string> {
    assertUrlSafe(sourceUrl, "styleReferenceUrl");
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Failed to download keyframe (${response.status})`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());

    const stored = await this.storage.savePreviewImage(userId, buffer, {
      prompt: options.prompt.slice(0, 200),
      strength: options.strength.toString(),
      source: "ip-adapter",
    });

    return stored.viewUrl;
  }

  private getWidthForAspectRatio(ratio?: string): number {
    switch (ratio) {
      case "9:16":
        return 768;
      case "1:1":
        return 1024;
      case "4:3":
        return 1152;
      case "3:4":
        return 896;
      case "16:9":
      default:
        return 1024;
    }
  }

  private getHeightForAspectRatio(ratio?: string): number {
    switch (ratio) {
      case "9:16":
        return 1344;
      case "1:1":
        return 1024;
      case "4:3":
        return 896;
      case "3:4":
        return 1152;
      case "16:9":
      default:
        return 576;
    }
  }

  private calculateAspectRatio(width: number, height: number): string {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(width, height);
    return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
  }

  private generateId(): string {
    return generateId("styleref");
  }
}
