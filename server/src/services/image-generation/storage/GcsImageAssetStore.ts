/**
 * GCS Image Asset Store
 *
 * Stores generated images to Google Cloud Storage.
 * Uses @google-cloud/storage directly with GOOGLE_APPLICATION_CREDENTIALS.
 */

import { v4 as uuidv4 } from "uuid";
import type { Bucket } from "@google-cloud/storage";
import { logger } from "@infrastructure/Logger";
import type { SignedUrlMinter } from "@infrastructure/signedUrl/SignedUrlMinter";
import { fetchRemoteMedia } from "@services/owned-media";
import type { ImageAssetStore, StoredImageAsset } from "./types";

const IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

interface GcsImageAssetStoreOptions {
  bucket: Bucket;
  minter: SignedUrlMinter;
  basePath: string;
  signedUrlTtlMs: number;
  cacheControl: string;
}

export class GcsImageAssetStore implements ImageAssetStore {
  private readonly bucket: Bucket;
  private readonly minter: SignedUrlMinter;
  private readonly basePath: string;
  private readonly signedUrlTtlMs: number;
  private readonly cacheControl: string;
  private readonly log = logger.child({ service: "GcsImageAssetStore" });

  constructor(options: GcsImageAssetStoreOptions) {
    this.bucket = options.bucket;
    this.minter = options.minter;
    this.basePath = options.basePath.replace(/^\/+|\/+$/g, "");
    this.signedUrlTtlMs = options.signedUrlTtlMs;
    this.cacheControl = options.cacheControl;
  }

  async storeFromUrl(
    sourceUrl: string,
    userId: string,
    contentType?: string,
  ): Promise<StoredImageAsset> {
    const id = uuidv4();
    const objectPath = this.objectPath(userId, id);

    this.log.debug("Fetching image from source URL", {
      sourceUrl: sourceUrl.slice(0, 100),
    });

    const remoteMedia = await fetchRemoteMedia({
      sourceUrl,
      fieldName: "sourceUrl",
      allowedContentTypes: IMAGE_CONTENT_TYPES,
      maxBytes: MAX_IMAGE_BYTES,
    });
    const resolvedContentType = contentType || remoteMedia.contentType;

    await this.uploadBuffer(
      objectPath,
      remoteMedia.buffer,
      resolvedContentType,
      remoteMedia.sourceUrl.slice(0, 500),
    );

    const [metadata] = await this.bucket.file(objectPath).getMetadata();
    const { url, expiresAtMs } = await this.minter.mintRead(objectPath, {
      ttlMs: this.signedUrlTtlMs,
    });
    const resolvedSize = Number(metadata.size || 0);
    const sizeBytes =
      Number.isFinite(resolvedSize) && resolvedSize > 0
        ? resolvedSize
        : undefined;

    this.log.info("Stored image to GCS", {
      id,
      sizeBytes,
      contentType: resolvedContentType,
    });

    return {
      id,
      storagePath: objectPath,
      url,
      contentType: resolvedContentType,
      createdAt: Date.now(),
      expiresAt: expiresAtMs,
      ...(sizeBytes !== undefined ? { sizeBytes } : {}),
    };
  }

  async storeFromBuffer(
    buffer: Buffer,
    contentType: string,
    userId: string,
  ): Promise<StoredImageAsset> {
    const id = uuidv4();
    const objectPath = this.objectPath(userId, id);

    await this.uploadBuffer(objectPath, buffer, contentType);

    const [metadata] = await this.bucket.file(objectPath).getMetadata();
    const { url, expiresAtMs } = await this.minter.mintRead(objectPath, {
      ttlMs: this.signedUrlTtlMs,
    });
    const resolvedSize = Number(metadata.size || 0);
    const sizeBytes =
      Number.isFinite(resolvedSize) && resolvedSize > 0
        ? resolvedSize
        : undefined;

    return {
      id,
      storagePath: objectPath,
      url,
      contentType,
      createdAt: Date.now(),
      expiresAt: expiresAtMs,
      ...(sizeBytes !== undefined ? { sizeBytes } : {}),
    };
  }

  async getPublicUrl(assetId: string, userId: string): Promise<string | null> {
    try {
      // Current path convention: {basePath}/{userId}/{assetId}
      const grant = await this.minter.mintReadIfPresent(
        this.objectPath(userId, assetId),
        { ttlMs: this.signedUrlTtlMs },
      );
      if (grant) {
        return grant.url;
      }

      // Fallback: legacy path convention without userId prefix: {basePath}/{assetId}
      // Assets created before the userId-scoped path change live here.
      const legacyGrant = await this.minter.mintReadIfPresent(
        this.legacyObjectPath(assetId),
        { ttlMs: this.signedUrlTtlMs },
      );
      if (legacyGrant) {
        this.log.info("Resolved image from legacy path (no userId prefix)", {
          assetId,
          userId,
        });
        return legacyGrant.url;
      }

      return null;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.log.warn("Failed to generate image signed URL", {
        assetId,
        userId,
        error: errorMessage,
      });
      return null;
    }
  }

  async exists(assetId: string, userId: string): Promise<boolean> {
    const file = this.bucket.file(this.objectPath(userId, assetId));
    const [exists] = await file.exists();
    if (exists) return true;

    // Fallback: check legacy path without userId prefix
    const legacyFile = this.bucket.file(this.legacyObjectPath(assetId));
    const [legacyExists] = await legacyFile.exists();
    return legacyExists;
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
        this.log.warn("Failed to delete expired image asset", {
          fileName: file.name,
          error: errorMessage,
        });
      }
    }

    return deleted;
  }

  private objectPath(userId: string, assetId: string): string {
    return `${this.basePath}/${this.sanitizeUserId(userId)}/${assetId}`;
  }

  /** Legacy path convention used before userId-scoped storage was introduced. */
  private legacyObjectPath(assetId: string): string {
    return `${this.basePath}/${assetId}`;
  }

  private sanitizeUserId(userId: string): string {
    const trimmed = userId.trim();
    if (trimmed.length === 0) {
      return "anonymous";
    }
    return trimmed.replace(/[^a-zA-Z0-9._:@-]/g, "_");
  }

  private async uploadBuffer(
    objectPath: string,
    buffer: Buffer,
    contentType: string,
    sourceUrl?: string,
  ): Promise<void> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Create fresh file reference for each attempt to avoid stale stream state
        const file = this.bucket.file(objectPath);
        await file.save(buffer, {
          resumable: false,
          validation: false,
          contentType,
          metadata: {
            cacheControl: this.cacheControl,
            ...(sourceUrl ? { metadata: { sourceUrl } } : {}),
          },
          preconditionOpts: { ifGenerationMatch: 0 },
        });
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (
          attempt < maxRetries &&
          lastError.message.includes("stream was destroyed")
        ) {
          this.log.warn("GCS upload stream error, retrying", {
            attempt,
            maxRetries,
          });
          await new Promise((r) => setTimeout(r, 100 * attempt));
        } else {
          throw lastError;
        }
      }
    }

    throw lastError;
  }
}
