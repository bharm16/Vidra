import { tmpdir } from "node:os";
import { join } from "node:path";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { logger } from "@infrastructure/Logger";
import { StorageService } from "@services/storage/StorageService";
import type { VideoAssetStore } from "@services/video-generation/storage";
import { assertUrlSafe } from "@server/shared/urlValidation";

export class GradingService {
  private readonly log = logger.child({ service: "GradingService" });
  private readonly assetStore: VideoAssetStore;
  private readonly storage: StorageService | undefined;

  constructor(assetStore: VideoAssetStore, storageService?: StorageService) {
    this.assetStore = assetStore;
    this.storage = storageService;
  }

  async matchPalette(
    assetId: string,
    referenceImageUrl: string,
  ): Promise<{ applied: boolean; assetId?: string; videoUrl?: string }> {
    assertUrlSafe(referenceImageUrl, "referenceImageUrl");

    const videoUrl = await this.assetStore.getPublicUrl(assetId);
    if (!videoUrl) {
      return { applied: false };
    }

    const tempDir = await fs.mkdtemp(join(tmpdir(), "grade-"));
    const inputPath = join(tempDir, "input.mp4");
    const refPath = join(tempDir, "ref.png");
    const outputPath = join(tempDir, "output.mp4");

    try {
      const [videoRes, refRes] = await Promise.all([
        fetch(videoUrl),
        fetch(referenceImageUrl),
      ]);

      if (!videoRes.ok) {
        throw new Error(`Failed to download video (${videoRes.status})`);
      }
      if (!refRes.ok) {
        throw new Error(
          `Failed to download reference image (${refRes.status})`,
        );
      }

      await fs.writeFile(inputPath, Buffer.from(await videoRes.arrayBuffer()));
      await fs.writeFile(refPath, Buffer.from(await refRes.arrayBuffer()));

      // Histogram match using ffmpeg's histmatch filter (best-effort)
      const args = [
        "-y",
        "-i",
        inputPath,
        "-i",
        refPath,
        "-filter_complex",
        "[0:v][1:v]histmatch,format=yuv420p",
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "18",
        outputPath,
      ];

      await this.exec("ffmpeg", args);

      const outputBuffer = await fs.readFile(outputPath);
      const stored = await this.assetStore.storeFromBuffer(
        outputBuffer,
        "video/mp4",
      );

      return { applied: true, assetId: stored.id, videoUrl: stored.url };
    } catch (error) {
      this.log.warn("Palette match failed, skipping", {
        error: (error as Error).message,
      });
      return { applied: false };
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  async matchImagePalette(
    userId: string,
    sourceImageUrl: string,
    referenceImageUrl: string,
  ): Promise<{ applied: boolean; imageUrl?: string }> {
    assertUrlSafe(sourceImageUrl, "sourceImageUrl");
    assertUrlSafe(referenceImageUrl, "referenceImageUrl");

    if (!this.storage) {
      return { applied: false };
    }

    const tempDir = await fs.mkdtemp(join(tmpdir(), "grade-img-"));
    const inputPath = join(tempDir, "input.png");
    const refPath = join(tempDir, "ref.png");
    const outputPath = join(tempDir, "output.png");

    try {
      const [sourceRes, refRes] = await Promise.all([
        fetch(sourceImageUrl),
        fetch(referenceImageUrl),
      ]);

      if (!sourceRes.ok) {
        throw new Error(
          `Failed to download source image (${sourceRes.status})`,
        );
      }
      if (!refRes.ok) {
        throw new Error(
          `Failed to download reference image (${refRes.status})`,
        );
      }

      await fs.writeFile(inputPath, Buffer.from(await sourceRes.arrayBuffer()));
      await fs.writeFile(refPath, Buffer.from(await refRes.arrayBuffer()));

      const args = [
        "-y",
        "-i",
        inputPath,
        "-i",
        refPath,
        "-filter_complex",
        "[0:v][1:v]histmatch,format=rgba",
        "-frames:v",
        "1",
        outputPath,
      ];

      await this.exec("ffmpeg", args);

      const outputBuffer = await fs.readFile(outputPath);
      const stored = await this.storage.savePreviewImage(userId, outputBuffer, {
        source: "continuity-style-transfer",
      });

      return { applied: true, imageUrl: stored.viewUrl };
    } catch (error) {
      this.log.warn("Image palette match failed, skipping", {
        error: (error as Error).message,
      });
      return { applied: false };
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  private async exec(command: string, args: string[]): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(`${command} failed (${code}): ${stderr.slice(0, 400)}`),
          );
        }
      });
    });
  }
}
