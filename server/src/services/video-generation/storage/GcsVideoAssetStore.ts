import { pipeline } from "node:stream/promises";
import { v4 as uuidv4 } from "uuid";
import type { Bucket } from "@google-cloud/storage";
import { logger } from "@infrastructure/Logger";
import type { SignedUrlMinter } from "@infrastructure/signedUrl/SignedUrlMinter";
import type {
  StoredVideoAsset,
  VideoAssetStore,
  VideoAssetStream,
} from "./types";

interface GcsVideoAssetStoreOptions {
  bucket: Bucket;
  minter: SignedUrlMinter;
  basePath: string;
  signedUrlTtlMs: number;
  cacheControl: string;
}

function isGcsNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === 404
  );
}

export class GcsVideoAssetStore implements VideoAssetStore {
  private readonly bucket: Bucket;
  private readonly minter: SignedUrlMinter;
  private readonly basePath: string;
  private readonly signedUrlTtlMs: number;
  private readonly cacheControl: string;
  private readonly log = logger.child({ service: "GcsVideoAssetStore" });

  constructor(options: GcsVideoAssetStoreOptions) {
    this.bucket = options.bucket;
    this.minter = options.minter;
    this.basePath = options.basePath.replace(/^\/+|\/+$/g, "");
    this.signedUrlTtlMs = options.signedUrlTtlMs;
    this.cacheControl = options.cacheControl;
  }

  async storeFromBuffer(
    buffer: Buffer,
    contentType: string,
  ): Promise<StoredVideoAsset> {
    const id = uuidv4();
    const objectPath = this.objectPath(id);
    const file = this.bucket.file(objectPath);

    await file.save(buffer, {
      contentType,
      resumable: false,
      metadata: {
        cacheControl: this.cacheControl,
      },
      preconditionOpts: { ifGenerationMatch: 0 },
    });

    const [[metadata], { url }] = await Promise.all([
      file.getMetadata(),
      this.minter.mintRead(objectPath, { ttlMs: this.signedUrlTtlMs }),
    ]);
    const resolvedSize = Number(metadata.size || 0);
    const sizeBytes =
      Number.isFinite(resolvedSize) && resolvedSize > 0
        ? resolvedSize
        : undefined;
    return {
      id,
      url,
      contentType,
      createdAt: Date.now(),
      ...(sizeBytes !== undefined ? { sizeBytes } : {}),
    };
  }

  async storeFromStream(
    stream: NodeJS.ReadableStream,
    contentType: string,
  ): Promise<StoredVideoAsset> {
    const id = uuidv4();
    const objectPath = this.objectPath(id);
    const file = this.bucket.file(objectPath);

    await pipeline(
      stream,
      file.createWriteStream({
        metadata: {
          contentType,
          cacheControl: this.cacheControl,
        },
        preconditionOpts: { ifGenerationMatch: 0 },
      }),
    );

    const [[metadata], { url }] = await Promise.all([
      file.getMetadata(),
      this.minter.mintRead(objectPath, { ttlMs: this.signedUrlTtlMs }),
    ]);
    const resolvedSize = Number(metadata.size || 0);
    const sizeBytes =
      Number.isFinite(resolvedSize) && resolvedSize > 0
        ? resolvedSize
        : undefined;
    return {
      id,
      url,
      contentType,
      createdAt: Date.now(),
      ...(sizeBytes !== undefined ? { sizeBytes } : {}),
    };
  }

  async getStream(assetId: string): Promise<VideoAssetStream | null> {
    const file = this.bucket.file(this.objectPath(assetId));

    try {
      const [metadata] = await file.getMetadata();
      const contentType =
        typeof metadata.contentType === "string"
          ? metadata.contentType
          : "video/mp4";
      const resolvedSize = Number(metadata.size || 0);
      const sizeBytes =
        Number.isFinite(resolvedSize) && resolvedSize > 0
          ? resolvedSize
          : undefined;

      return {
        stream: file.createReadStream(),
        contentType,
        ...(sizeBytes !== undefined ? { contentLength: sizeBytes } : {}),
      };
    } catch (error) {
      if (isGcsNotFound(error)) return null;
      throw error;
    }
  }

  async getPublicUrl(assetId: string): Promise<string | null> {
    try {
      // Signed URLs are minted without a GCS round-trip, so signing alone
      // cannot detect a missing object — mintReadIfPresent probes first.
      // Downstream (e.g. GradingService.matchPalette) relies on
      // null-on-missing for clean short-circuit behavior.
      const grant = await this.minter.mintReadIfPresent(
        this.objectPath(assetId),
        { ttlMs: this.signedUrlTtlMs },
      );
      if (!grant) {
        this.log.warn("Video asset missing in GCS", { assetId });
        return null;
      }
      return grant.url;
    } catch (error) {
      if (isGcsNotFound(error)) {
        this.log.warn("Video asset missing in GCS", { assetId });
        return null;
      }
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.log.warn("Failed to generate video signed URL", {
        assetId,
        error: errorMessage,
      });
      return null;
    }
  }

  async cleanupExpired(
    olderThanMs: number,
    maxItems?: number,
  ): Promise<number> {
    if (!Number.isFinite(olderThanMs) || olderThanMs <= 0) {
      return 0;
    }

    const prefix = `${this.basePath}/`;
    const [files] = await this.bucket.getFiles({ prefix });
    let deleted = 0;

    for (const file of files) {
      if (maxItems && deleted >= maxItems) {
        break;
      }

      try {
        const [metadata] = await file.getMetadata();
        const createdAt = metadata.timeCreated
          ? Date.parse(metadata.timeCreated)
          : NaN;
        if (!Number.isFinite(createdAt) || createdAt > olderThanMs) {
          continue;
        }

        await file.delete();
        deleted += 1;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.log.warn("Failed to delete expired video asset", {
          fileName: file.name,
          error: errorMessage,
        });
      }
    }

    return deleted;
  }

  private objectPath(assetId: string): string {
    return `${this.basePath}/${assetId}`;
  }
}
