import { pipeline } from "node:stream/promises";
import { v4 as uuidv4 } from "uuid";
import type { Bucket, File } from "@google-cloud/storage";
import { logger } from "@infrastructure/Logger";
import type {
  StoredVideoAsset,
  VideoAssetStore,
  VideoAssetStream,
} from "./types";

/** Structural slice of the signed-URL ledger (kept import-free across domains). */
interface SignedUrlRecorder {
  record(objectPath: string, signedUrl: string): void;
}

interface GcsVideoAssetStoreOptions {
  bucket: Bucket;
  basePath: string;
  signedUrlTtlMs: number;
  cacheControl: string;
  ledger?: SignedUrlRecorder | null;
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
  private readonly basePath: string;
  private readonly signedUrlTtlMs: number;
  private readonly cacheControl: string;
  private readonly ledger: SignedUrlRecorder | null;
  private readonly log = logger.child({ service: "GcsVideoAssetStore" });

  constructor(options: GcsVideoAssetStoreOptions) {
    this.bucket = options.bucket;
    this.basePath = options.basePath.replace(/^\/+|\/+$/g, "");
    this.signedUrlTtlMs = options.signedUrlTtlMs;
    this.cacheControl = options.cacheControl;
    this.ledger = options.ledger ?? null;
  }

  async storeFromBuffer(
    buffer: Buffer,
    contentType: string,
  ): Promise<StoredVideoAsset> {
    const id = uuidv4();
    const file = this.bucket.file(this.objectPath(id));

    await file.save(buffer, {
      contentType,
      resumable: false,
      metadata: {
        cacheControl: this.cacheControl,
      },
      preconditionOpts: { ifGenerationMatch: 0 },
    });

    const [[metadata], url] = await Promise.all([
      file.getMetadata(),
      this.getSignedUrl(file),
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
    const file = this.bucket.file(this.objectPath(id));

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

    const [[metadata], url] = await Promise.all([
      file.getMetadata(),
      this.getSignedUrl(file),
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
    const file = this.bucket.file(this.objectPath(assetId));
    try {
      // V4 signed URLs are signed client-side without any GCS round-trip, so
      // getSignedUrl alone cannot detect a missing object. Probe with
      // getMetadata first; downstream (e.g. GradingService.matchPalette)
      // relies on null-on-missing for clean short-circuit behavior.
      await file.getMetadata();
      return await this.getSignedUrl(file);
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

  private async getSignedUrl(file: File): Promise<string> {
    const expiresAt = Date.now() + this.signedUrlTtlMs;
    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: expiresAt,
    });
    // The media proxy's bucket rescue honors only grants on the ledger.
    this.ledger?.record(file.name, url);
    return url;
  }
}
