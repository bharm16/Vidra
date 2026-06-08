import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { logger } from "@infrastructure/Logger";
import { assertUrlSafe } from "@server/shared/urlValidation";
import { FaceEmbeddingService } from "@services/asset/FaceEmbeddingService";
import type { StorageService } from "@services/storage/StorageService";
import type { QualityGateResult } from "./types";
import { DEFAULT_QUALITY_THRESHOLDS } from "./constants";

interface QualityGateOptions {
  userId: string;
  referenceImageUrl: string;
  generatedVideoUrl: string;
  characterReferenceUrl?: string;
  styleThreshold?: number;
  identityThreshold?: number;
}

type ClipPipeline = (
  input: Buffer,
  options: { pool: boolean },
) => Promise<{ data?: ArrayLike<number> }>;

export class QualityGateService {
  private readonly log = logger.child({ service: "QualityGateService" });
  private readonly faceEmbedding: FaceEmbeddingService | null;
  private readonly disableClip: boolean;
  private static clipPipelinePromise: Promise<ClipPipeline> | null = null;

  constructor(
    faceEmbedding?: FaceEmbeddingService | null,
    private storage?: StorageService,
    options?: { disableClip?: boolean },
  ) {
    this.faceEmbedding = faceEmbedding ?? null;
    this.disableClip = options?.disableClip ?? false;
  }

  async evaluate(options: QualityGateOptions): Promise<QualityGateResult> {
    const { referenceImageUrl, generatedVideoUrl } = options;

    const frameBuffer = await this.extractMidFrame(generatedVideoUrl);
    const referenceBuffer = await this.downloadImage(referenceImageUrl);
    let styleScore = await this.compareClipSimilarity(
      referenceBuffer,
      frameBuffer,
    );
    if (styleScore === undefined) {
      styleScore = await this.compareHistogram(referenceBuffer, frameBuffer);
    }

    let identityScore: number | undefined;
    if (options.characterReferenceUrl && this.faceEmbedding && this.storage) {
      try {
        const ref = await this.faceEmbedding.extractEmbedding(
          options.characterReferenceUrl,
        );
        const stored = await this.storage.savePreviewImage(
          options.userId,
          frameBuffer,
          { source: "quality-gate" },
        );
        const candidate = await this.faceEmbedding.extractEmbedding(
          stored.viewUrl,
        );
        identityScore = this.faceEmbedding.computeSimilarity(
          ref.embedding,
          candidate.embedding,
        );
      } catch (error) {
        this.log.warn("Identity similarity check failed", {
          error: (error as Error).message,
        });
      }
    }

    const styleThreshold =
      options.styleThreshold ?? DEFAULT_QUALITY_THRESHOLDS.styleSimilarity;
    const identityThreshold =
      options.identityThreshold ??
      DEFAULT_QUALITY_THRESHOLDS.identitySimilarity;

    const passedStyle =
      styleScore !== undefined ? styleScore >= styleThreshold : true;
    const passedIdentity =
      identityScore !== undefined ? identityScore >= identityThreshold : true;

    const result: QualityGateResult = {
      passed: passedStyle && passedIdentity,
    };
    if (styleScore !== undefined) {
      result.styleScore = styleScore;
    }
    if (identityScore !== undefined) {
      result.identityScore = identityScore;
    }
    return result;
  }

  private async extractMidFrame(videoUrl: string): Promise<Buffer> {
    const duration = await this.getVideoDuration(videoUrl);
    const timestamp = duration > 0 ? duration / 2 : 0;
    const tempDir = await fs.mkdtemp(join(tmpdir(), "quality-"));

    try {
      const outputPath = join(tempDir, "frame.png");
      const args = [
        "-y",
        "-ss",
        String(Math.max(0, timestamp)),
        "-i",
        videoUrl,
        "-frames:v",
        "1",
        "-f",
        "image2",
        "-vcodec",
        "png",
        outputPath,
      ];

      await this.exec("ffmpeg", args);
      return await fs.readFile(outputPath);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async getVideoDuration(videoUrl: string): Promise<number> {
    const args = [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      videoUrl,
    ];

    const output = await this.execWithOutput("ffprobe", args);
    const duration = Number(output.trim());
    return Number.isFinite(duration) ? duration : 0;
  }

  private async compareHistogram(
    referenceBuffer: Buffer,
    frameBuffer: Buffer,
  ): Promise<number> {
    const refHist = await this.computeHistogram(referenceBuffer);
    const frameHist = await this.computeHistogram(frameBuffer);

    return this.correlation(refHist, frameHist);
  }

  private async compareClipSimilarity(
    referenceBuffer: Buffer,
    frameBuffer: Buffer,
  ): Promise<number | undefined> {
    const pipeline = await this.getClipPipeline();
    if (!pipeline) return undefined;

    try {
      const [refTensor, frameTensor] = await Promise.all([
        pipeline(referenceBuffer, { pool: true }),
        pipeline(frameBuffer, { pool: true }),
      ]);

      const refEmbedding = this.normalizeEmbedding(
        this.extractEmbedding(refTensor),
      );
      const frameEmbedding = this.normalizeEmbedding(
        this.extractEmbedding(frameTensor),
      );

      if (refEmbedding.length === 0 || frameEmbedding.length === 0) {
        return undefined;
      }

      const similarity = this.cosineSimilarity(refEmbedding, frameEmbedding);
      return Math.max(0, Math.min(1, similarity));
    } catch (error) {
      this.log.warn("CLIP similarity check failed, falling back to histogram", {
        error: (error as Error).message,
      });
      return undefined;
    }
  }

  private async getClipPipeline(): Promise<ClipPipeline | null> {
    if (this.disableClip) {
      return null;
    }

    if (!QualityGateService.clipPipelinePromise) {
      QualityGateService.clipPipelinePromise = (async () => {
        const transformers = await import("@huggingface/transformers");
        const pipeline = await transformers.pipeline(
          "image-feature-extraction",
          "Xenova/clip-vit-base-patch32",
        );
        return pipeline as unknown as ClipPipeline;
      })();
    }

    try {
      return await QualityGateService.clipPipelinePromise;
    } catch (error) {
      this.log.warn("Failed to load CLIP pipeline, falling back to histogram", {
        error: (error as Error).message,
      });
      QualityGateService.clipPipelinePromise = null;
      return null;
    }
  }

  private extractEmbedding(tensor: { data?: ArrayLike<number> }): Float32Array {
    const raw = tensor?.data;
    if (!raw || typeof raw.length !== "number") return new Float32Array();
    if (raw instanceof Float32Array) return raw;
    return Float32Array.from(Array.from(raw));
  }

  private normalizeEmbedding(embedding: Float32Array): Float32Array {
    let norm = 0;
    for (let i = 0; i < embedding.length; i += 1) {
      const value = embedding[i] ?? 0;
      norm += value * value;
    }
    const denom = Math.sqrt(norm) || 1;
    const normalized = new Float32Array(embedding.length);
    for (let i = 0; i < embedding.length; i += 1) {
      normalized[i] = (embedding[i] ?? 0) / denom;
    }
    return normalized;
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) return 0;
    let sum = 0;
    for (let i = 0; i < a.length; i += 1) {
      sum += (a[i] ?? 0) * (b[i] ?? 0);
    }
    return sum;
  }

  private async computeHistogram(buffer: Buffer): Promise<number[]> {
    const { data } = await sharp(buffer)
      .resize(256, 256, { fit: "cover" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const bins = 32;
    const hist = new Array(bins * 3).fill(0);

    for (let i = 0; i < data.length; i += 3) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      hist[Math.floor((r / 256) * bins)] += 1;
      hist[bins + Math.floor((g / 256) * bins)] += 1;
      hist[2 * bins + Math.floor((b / 256) * bins)] += 1;
    }

    const norm = Math.sqrt(hist.reduce((sum, v) => sum + v * v, 0)) || 1;
    return hist.map((v) => v / norm);
  }

  private correlation(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let sum = 0;
    for (let i = 0; i < a.length; i += 1) {
      sum += (a[i] ?? 0) * (b[i] ?? 0);
    }
    return sum;
  }

  private async downloadImage(url: string): Promise<Buffer> {
    assertUrlSafe(url, "qualityGateImageUrl");
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image (${response.status})`);
    }
    return Buffer.from(await response.arrayBuffer());
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

  private async execWithOutput(
    command: string,
    args: string[],
  ): Promise<string> {
    return await new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(
            new Error(`${command} failed (${code}): ${stderr.slice(0, 400)}`),
          );
        }
      });
    });
  }

  // no-op: identity comparisons upload to storage for URL access
}
