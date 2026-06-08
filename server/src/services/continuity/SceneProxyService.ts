import { logger } from "@infrastructure/Logger";
import { assertUrlSafe } from "@server/shared/urlValidation";
import { generateId } from "@utils/uid";
import { StorageService } from "@services/storage/StorageService";
import sharp from "sharp";
import type { DepthEstimationFactory } from "./ports/DepthEstimationFactory";
import type { FrameBridgeService } from "./FrameBridgeService";
import type { SceneProxy, SceneProxyRender } from "./types";

type DepthPipeline = (input: Buffer) => Promise<{
  depth: {
    data: Uint8Array | Uint16Array | Float32Array;
    width: number;
    height: number;
  };
}>;

export class SceneProxyService {
  private readonly log = logger.child({ service: "SceneProxyService" });
  private depthPipelinePromise: Promise<DepthPipeline> | null = null;

  constructor(
    private storage: StorageService,
    private frameBridge: FrameBridgeService,
    private createDepthEstimationService: DepthEstimationFactory,
  ) {}

  async createProxyFromVideo(
    userId: string,
    videoId: string,
    videoUrl: string,
  ): Promise<SceneProxy> {
    try {
      const representative = await this.frameBridge.extractRepresentativeFrame(
        userId,
        videoId,
        videoUrl,
        "scene-proxy",
      );

      let depthMapUrl: string | undefined;
      let depthBuffer: Buffer | undefined;

      const depthService = this.createDepthEstimationService(userId);

      if (depthService.isAvailable()) {
        try {
          depthMapUrl = await depthService.estimateDepth(
            representative.frameUrl,
          );
        } catch (error) {
          this.log.warn(
            "Depth estimation service failed, falling back to local depth",
            {
              error: error instanceof Error ? error.message : String(error),
            },
          );
        }
      }

      if (!depthMapUrl) {
        const referenceBuffer = await this.downloadImage(
          representative.frameUrl,
        );
        depthBuffer = await this.estimateDepth(referenceBuffer);

        const depthStored = await this.storage.savePreviewImage(
          userId,
          depthBuffer,
          { source: "scene-proxy-depth" },
        );
        depthMapUrl = depthStored.viewUrl;
      }

      if (!depthMapUrl) {
        throw new Error("Failed to build depth map for scene proxy");
      }

      const resolvedDepthMapUrl = depthMapUrl;

      const variance = await this.computeDepthVariance(
        depthBuffer || (await this.downloadImage(resolvedDepthMapUrl)),
      );
      if (variance < 0.005) {
        return {
          id: this.generateId("proxy"),
          sourceVideoId: videoId,
          proxyType: "depth-parallax",
          referenceFrameUrl: representative.frameUrl,
          depthMapUrl: resolvedDepthMapUrl,
          createdAt: new Date(),
          status: "failed",
          error: "Insufficient parallax depth for scene proxy.",
        };
      }

      return {
        id: this.generateId("proxy"),
        sourceVideoId: videoId,
        proxyType: "depth-parallax",
        referenceFrameUrl: representative.frameUrl,
        depthMapUrl: resolvedDepthMapUrl,
        createdAt: new Date(),
        status: "ready",
      };
    } catch (error) {
      this.log.error("Scene proxy creation failed", error as Error);
      return {
        id: this.generateId("proxy"),
        sourceVideoId: videoId,
        proxyType: "depth-parallax",
        referenceFrameUrl: "",
        createdAt: new Date(),
        status: "failed",
        error: (error as Error).message,
      };
    }
  }

  async renderFromProxy(
    userId: string,
    proxy: SceneProxy,
    shotId: string,
    cameraPose?: {
      yaw?: number | undefined;
      pitch?: number | undefined;
      roll?: number | undefined;
      dolly?: number | undefined;
    },
  ): Promise<SceneProxyRender> {
    if (!proxy.referenceFrameUrl || !proxy.depthMapUrl) {
      throw new Error("Scene proxy is missing reference assets");
    }

    // Normalize at the boundary: strip undefined-valued fields so downstream
    // code (with exactOptionalPropertyTypes) can treat optional keys as absent
    // rather than `undefined`. Previously lived in ContinuityPostProcessingService.
    const normalizedCameraPose = cameraPose
      ? {
          ...(cameraPose.yaw !== undefined ? { yaw: cameraPose.yaw } : {}),
          ...(cameraPose.pitch !== undefined
            ? { pitch: cameraPose.pitch }
            : {}),
          ...(cameraPose.roll !== undefined ? { roll: cameraPose.roll } : {}),
          ...(cameraPose.dolly !== undefined
            ? { dolly: cameraPose.dolly }
            : {}),
        }
      : undefined;

    const [imageBuffer, depthBuffer] = await Promise.all([
      this.downloadImage(proxy.referenceFrameUrl),
      this.downloadImage(proxy.depthMapUrl),
    ]);

    const rendered = await this.renderParallax(
      imageBuffer,
      depthBuffer,
      normalizedCameraPose,
    );

    const stored = await this.storage.savePreviewImage(userId, rendered, {
      source: "scene-proxy-render",
    });

    const pose = normalizedCameraPose
      ? {
          yaw: normalizedCameraPose.yaw ?? 0,
          pitch: normalizedCameraPose.pitch ?? 0,
          ...(normalizedCameraPose.roll !== undefined
            ? { roll: normalizedCameraPose.roll }
            : {}),
          ...(normalizedCameraPose.dolly !== undefined
            ? { dolly: normalizedCameraPose.dolly }
            : {}),
        }
      : undefined;

    return {
      id: this.generateId("render"),
      proxyId: proxy.id,
      shotId,
      renderUrl: stored.viewUrl,
      ...(pose ? { cameraPose: pose } : {}),
      createdAt: new Date(),
    };
  }

  private async estimateDepth(imageBuffer: Buffer): Promise<Buffer> {
    try {
      const pipeline = await this.getDepthPipeline();
      const output = await pipeline(imageBuffer);
      const { data, width, height } = output.depth;

      const normalized = this.normalizeDepth(data);
      return await sharp(Buffer.from(normalized), {
        raw: { width, height, channels: 1 },
      })
        .png()
        .toBuffer();
    } catch (error) {
      this.log.warn("Depth estimation failed, using luminance fallback", {
        error: (error as Error).message,
      });
      const { data, info } = await sharp(imageBuffer)
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return await sharp(Buffer.from(data), {
        raw: { width: info.width, height: info.height, channels: 1 },
      })
        .png()
        .toBuffer();
    }
  }

  private normalizeDepth(
    data: Uint8Array | Uint16Array | Float32Array,
  ): Uint8Array {
    let min = Infinity;
    let max = -Infinity;
    for (const value of data) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
    const range = max - min || 1;
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i += 1) {
      const value = data[i] ?? 0;
      out[i] = Math.max(0, Math.min(255, ((value - min) / range) * 255));
    }
    return out;
  }

  private async renderParallax(
    imageBuffer: Buffer,
    depthBuffer: Buffer,
    cameraPose?: {
      yaw?: number;
      pitch?: number;
      roll?: number;
      dolly?: number;
    },
  ): Promise<Buffer> {
    const { data: rgb, info } = await sharp(imageBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { data: depth } = await sharp(depthBuffer)
      .resize(info.width, info.height)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;
    const channels = info.channels;

    const output = Buffer.alloc(width * height * channels, 0);
    const zBuffer = new Float32Array(width * height).fill(-Infinity);

    const yaw = cameraPose?.yaw ?? 0;
    const pitch = cameraPose?.pitch ?? 0;
    const scale = 0.05; // parallax scale

    const idx = (x: number, y: number) => y * width + x;

    // bucket by depth for simple occlusion (near overwrites far)
    const buckets: number[][] = Array.from({ length: 256 }, () => []);
    for (let i = 0; i < depth.length; i += 1) {
      const bucketIndex = depth[i] ?? 0;
      buckets[bucketIndex]?.push(i);
    }

    for (let d = 0; d < 256; d += 1) {
      const bucket = buckets[d];
      if (!bucket || bucket.length === 0) continue;
      const depthNorm = d / 255;
      const shiftX = (0.5 - depthNorm) * yaw * width * scale;
      const shiftY = (0.5 - depthNorm) * pitch * height * scale;

      for (const i of bucket) {
        const x = i % width;
        const y = Math.floor(i / width);
        const nx = Math.round(x + shiftX);
        const ny = Math.round(y + shiftY);
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

        const target = idx(nx, ny);
        if (depthNorm > (zBuffer[target] ?? -Infinity)) {
          zBuffer[target] = depthNorm;
          const srcOffset = i * channels;
          const dstOffset = target * channels;
          for (let c = 0; c < channels; c += 1) {
            output[dstOffset + c] = rgb[srcOffset + c] ?? 0;
          }
        }
      }
    }

    // simple hole fill
    for (let pass = 0; pass < 2; pass += 1) {
      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          const offset = idx(x, y) * channels;
          if ((output[offset + 3] ?? 0) === 0 && channels === 4) {
            const left = idx(x - 1, y) * channels;
            const right = idx(x + 1, y) * channels;
            const up = idx(x, y - 1) * channels;
            const down = idx(x, y + 1) * channels;
            const sources = [left, right, up, down];
            for (const src of sources) {
              if ((output[src + (channels - 1)] ?? 0) > 0) {
                for (let c = 0; c < channels; c += 1) {
                  output[offset + c] = output[src + c] ?? 0;
                }
                break;
              }
            }
          }
        }
      }
    }

    return await sharp(output, { raw: { width, height, channels } })
      .png()
      .toBuffer();
  }

  private async getDepthPipeline(): Promise<DepthPipeline> {
    if (!this.depthPipelinePromise) {
      this.depthPipelinePromise = (async () => {
        const transformers = await import("@huggingface/transformers");
        const pipeline = await transformers.pipeline(
          "depth-estimation",
          "Xenova/dpt-hybrid-midas",
        );
        return async (input: Buffer) => {
          const output = await pipeline(
            input as unknown as Parameters<typeof pipeline>[0],
          );
          return output as {
            depth: {
              data: Uint8Array | Uint16Array | Float32Array;
              width: number;
              height: number;
            };
          };
        };
      })();
    }

    return this.depthPipelinePromise;
  }

  private async downloadImage(url: string): Promise<Buffer> {
    assertUrlSafe(url, "sceneProxyImageUrl");
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image (${response.status})`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private async computeDepthVariance(depthMap: Buffer): Promise<number> {
    const { data } = await sharp(depthMap)
      .resize(128, 128, { fit: "cover" })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let sum = 0;
    let sumSq = 0;
    const n = data.length || 1;
    for (let i = 0; i < data.length; i += 1) {
      const value = (data[i] ?? 0) / 255;
      sum += value;
      sumSq += value * value;
    }
    const mean = sum / n;
    return sumSq / n - mean * mean;
  }

  private generateId(prefix: string): string {
    return generateId(prefix);
  }
}
