/**
 * StorageService for Visual Convergence
 *
 * Handles storage of generated images in GCS and signed URL generation.
 * Replicate generates images with temporary URLs that expire,
 * so we need to persist them to GCS before storing in session state.
 *
 * @module convergence/storage
 */

import { Bucket } from "@google-cloud/storage";
import { v4 as uuidv4 } from "uuid";
import { logger } from "@infrastructure/Logger";
import { fetchRemoteMedia } from "@services/owned-media";
import {
  bucketNamesMatch,
  parseGcsObjectUrl,
} from "@shared/utils/gcsObjectUrl";
import type { SignedUrlMinter } from "@infrastructure/signedUrl/SignedUrlMinter";
import { SESSION_TTL_MS } from "../constants";

// ============================================================================
// Interface
// ============================================================================

/**
 * Interface for storage operations in the convergence flow.
 * Abstracts GCS operations for easier testing and potential future storage backends.
 */
export interface StorageService {
  /**
   * Upload a single image from temporary URL to GCS
   * @param tempUrl Temporary Replicate URL
   * @param userId Authenticated owner of the new object
   * @param purpose Fixed media purpose; callers cannot supply a bucket path
   * @returns Signed GCS URL
   */
  upload(
    tempUrl: string,
    userId: string,
    purpose: ConvergenceMediaPurpose,
  ): Promise<string>;

  /**
   * Upload multiple images in parallel
   * @param tempUrls Array of temporary Replicate URLs
   * @param userId Authenticated owner of the new objects
   * @returns Array of signed GCS URLs in same order
   */
  uploadBatch(
    tempUrls: string[],
    userId: string,
    purpose: ConvergenceMediaPurpose,
  ): Promise<string[]>;

  /**
   * Upload a remote image URL to GCS with a generated filename
   * @param sourceUrl Remote URL to fetch
   * @param userId Authenticated owner of the new object
   * @returns Signed GCS URL
   */
  uploadFromUrl(
    sourceUrl: string,
    userId: string,
    purpose: ConvergenceMediaPurpose,
  ): Promise<string>;

  /**
   * Upload a buffer to the authenticated owner's fixed convergence namespace.
   * @param buffer File contents
   * @param userId Authenticated owner of the new object
   * @param contentType MIME type for the file
   * @returns Signed GCS URL
   */
  uploadBuffer(
    buffer: Buffer,
    userId: string,
    contentType: string,
    purpose: ConvergenceMediaPurpose,
  ): Promise<string>;

  /**
   * Delete images (for cleanup on session abandonment)
   * @param gcsUrls Array of signed GCS URLs to delete
   */
  delete(userId: string, gcsUrls: string[]): Promise<void>;

  /**
   * Refresh a signed GCS URL for a convergence object owned by the user.
   *
   * Returns null if the URL does not map to an object owned by that user.
   */
  refreshSignedUrl?(url: string, userId: string): Promise<string | null>;
}

export const CONVERGENCE_MEDIA_PURPOSES = [
  "upload",
  "frame",
  "preview",
] as const;
export type ConvergenceMediaPurpose =
  (typeof CONVERGENCE_MEDIA_PURPOSES)[number];

function convergenceOwnerSegment(userId: string): string {
  const normalized = userId.trim().replace(/[^a-zA-Z0-9._:@-]/g, "_");
  if (!normalized) {
    throw new Error("Convergence media owner is required");
  }
  return normalized;
}

export const isOwnedConvergenceObjectPath = (
  objectPath: string,
  userId: string,
): boolean =>
  objectPath.startsWith(`convergence/${convergenceOwnerSegment(userId)}/`);

// ============================================================================
// Configuration
// ============================================================================

export const DEFAULT_CONVERGENCE_SIGNED_URL_TTL_MS = SESSION_TTL_MS;

const CONVERGENCE_STORAGE_CONFIG = {
  /** Default content type for uploaded images */
  defaultContentType: "image/png",
  /** Timeout for fetching from temporary URLs (5 minutes) */
  fetchTimeoutMs: 5 * 60 * 1000,
  /** Convergence previews can be video, but remote intake still has a ceiling. */
  maxBytes: 500 * 1024 * 1024,
  /** Maximum concurrent uploads in a batch */
  maxConcurrentUploads: 10,
} as const;

const CONVERGENCE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

function extensionForContentType(contentType: string): string {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "video/quicktime") return "mov";
  return contentType.split("/")[1] || "bin";
}

function normalizeContentType(contentType: string): string {
  return contentType.split(";", 1)[0]?.trim().toLowerCase() || "";
}

function assertConvergenceContentType(contentType: string): string {
  const normalized = normalizeContentType(contentType);
  if (!CONVERGENCE_CONTENT_TYPES.includes(normalized as never)) {
    throw new Error(
      `Invalid convergence media content type: ${normalized || "unknown"}`,
    );
  }
  return normalized;
}

function buildConvergenceObjectPath(
  userId: string,
  purpose: ConvergenceMediaPurpose,
  contentType: string,
): string {
  return `convergence/${convergenceOwnerSegment(userId)}/${purpose}/${uuidv4()}.${extensionForContentType(contentType)}`;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * GCS implementation of StorageService for convergence images.
 *
 * Handles:
 * - Fetching images from temporary Replicate URLs
 * - Uploading to GCS and returning signed URLs
 * - Batch uploads with parallel processing
 * - Cleanup of abandoned session images
 */
export class GCSStorageService implements StorageService {
  private readonly log = logger.child({ service: "GCSStorageService" });

  constructor(
    private readonly bucket: Bucket,
    private readonly minter: SignedUrlMinter,
    private readonly signedUrlTtlMs: number = DEFAULT_CONVERGENCE_SIGNED_URL_TTL_MS,
  ) {}

  getBucketName(): string {
    return this.bucket.name;
  }

  /**
   * Upload a single image from temporary URL to GCS
   *
   * @param tempUrl - Temporary URL (e.g., from Replicate)
   * @param userId - Authenticated owner of the new object
   * @returns Signed GCS URL
   * @throws Error if fetch or upload fails
   */
  async upload(
    tempUrl: string,
    userId: string,
    purpose: ConvergenceMediaPurpose,
  ): Promise<string> {
    const startTime = Date.now();
    this.log.debug("Starting image upload", {
      userId,
      purpose,
      tempUrlHost: this.getUrlHost(tempUrl),
    });

    try {
      const remoteMedia = await fetchRemoteMedia({
        sourceUrl: tempUrl,
        fieldName: "tempUrl",
        allowedContentTypes: CONVERGENCE_CONTENT_TYPES,
        maxBytes: CONVERGENCE_STORAGE_CONFIG.maxBytes,
        timeoutMs: CONVERGENCE_STORAGE_CONFIG.fetchTimeoutMs,
      });
      const buffer = remoteMedia.buffer;
      const contentType = assertConvergenceContentType(remoteMedia.contentType);
      const destination = buildConvergenceObjectPath(
        userId,
        purpose,
        contentType,
      );

      // Upload to GCS
      const file = this.bucket.file(destination);
      const saveOptions: Parameters<typeof file.save>[1] = {
        contentType,
        metadata: {
          cacheControl: "public, max-age=31536000", // 1 year cache
          metadata: {
            sourceUrl: remoteMedia.sourceUrl.slice(0, 200),
            uploadedAt: new Date().toISOString(),
          },
        },
      };

      await file.save(buffer, saveOptions);

      const signedUrl = await this.getSignedUrl(destination);
      const duration = Date.now() - startTime;

      this.log.info("Image upload completed", {
        userId,
        purpose,
        sizeBytes: buffer.length,
        contentType,
        duration,
      });

      return signedUrl;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log.error("Image upload failed", error as Error, {
        userId,
        purpose,
        tempUrlHost: this.getUrlHost(tempUrl),
        duration,
      });
      throw error;
    }
  }

  /**
   * Upload multiple images in parallel
   *
   * @param tempUrls - Array of temporary URLs
   * @param userId - Authenticated owner of the new objects
   * @returns Array of signed GCS URLs in same order as input
   * @throws Error if any upload fails
   */
  async uploadBatch(
    tempUrls: string[],
    userId: string,
    purpose: ConvergenceMediaPurpose,
  ): Promise<string[]> {
    if (tempUrls.length === 0) {
      return [];
    }

    const startTime = Date.now();
    this.log.debug("Starting batch upload", {
      count: tempUrls.length,
      userId,
      purpose,
    });

    try {
      const uploadPromises = tempUrls.map((url) =>
        this.upload(url, userId, purpose),
      );

      // Execute all uploads in parallel
      const results = await Promise.all(uploadPromises);

      const duration = Date.now() - startTime;
      this.log.info("Batch upload completed", {
        count: tempUrls.length,
        userId,
        purpose,
        duration,
      });

      return results;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log.error("Batch upload failed", error as Error, {
        count: tempUrls.length,
        userId,
        purpose,
        duration,
      });
      throw error;
    }
  }

  /**
   * Upload a remote image URL to GCS with a generated filename.
   */
  async uploadFromUrl(
    sourceUrl: string,
    userId: string,
    purpose: ConvergenceMediaPurpose,
  ): Promise<string> {
    return this.upload(sourceUrl, userId, purpose);
  }

  /**
   * Upload a buffer directly to GCS.
   */
  async uploadBuffer(
    buffer: Buffer,
    userId: string,
    contentType: string,
    purpose: ConvergenceMediaPurpose,
  ): Promise<string> {
    const startTime = Date.now();
    const normalizedContentType = assertConvergenceContentType(
      contentType || CONVERGENCE_STORAGE_CONFIG.defaultContentType,
    );
    if (buffer.length > CONVERGENCE_STORAGE_CONFIG.maxBytes) {
      throw new Error(
        `Convergence media exceeds maximum size of ${CONVERGENCE_STORAGE_CONFIG.maxBytes} bytes`,
      );
    }
    const destination = buildConvergenceObjectPath(
      userId,
      purpose,
      normalizedContentType,
    );

    this.log.debug("Starting buffer upload", {
      destination,
      sizeBytes: buffer.length,
      contentType: normalizedContentType,
    });

    try {
      const file = this.bucket.file(destination);
      const saveOptions: Parameters<typeof file.save>[1] = {
        contentType: normalizedContentType,
        resumable: false,
        metadata: {
          cacheControl: "public, max-age=31536000",
          metadata: {
            uploadedAt: new Date().toISOString(),
          },
        },
      };

      await file.save(buffer, saveOptions);

      const signedUrl = await this.getSignedUrl(destination);
      const duration = Date.now() - startTime;

      this.log.info("Buffer upload completed", {
        destination,
        sizeBytes: buffer.length,
        contentType: normalizedContentType,
        duration,
      });

      return signedUrl;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log.error("Buffer upload failed", error as Error, {
        destination,
        sizeBytes: buffer.length,
        duration,
      });
      throw error;
    }
  }

  /**
   * Delete images from GCS (for cleanup on session abandonment)
   *
   * Silently ignores files that don't exist or can't be deleted.
   * This is intentional to ensure cleanup doesn't fail due to
   * already-deleted files.
   *
   * @param gcsUrls - Array of signed GCS URLs to delete
   */
  async delete(userId: string, gcsUrls: string[]): Promise<void> {
    if (gcsUrls.length === 0) {
      return;
    }

    const startTime = Date.now();
    this.log.debug("Starting batch delete", { count: gcsUrls.length });

    const deletePromises = gcsUrls.map(async (url) => {
      try {
        const path = this.extractObjectPath(url);
        if (!path || !isOwnedConvergenceObjectPath(path, userId)) {
          this.log.warn("Skipping non-matching URL in delete", { url });
          return;
        }

        await this.bucket.file(path).delete();

        this.log.debug("File deleted", { path });
      } catch (error) {
        // Ignore errors (file may already be deleted)
        this.log.debug("Delete failed (may already be deleted)", {
          url,
          error: (error as Error).message,
        });
      }
    });

    await Promise.all(deletePromises);

    const duration = Date.now() - startTime;
    this.log.info("Batch delete completed", {
      count: gcsUrls.length,
      duration,
    });
  }

  /**
   * Refresh a signed URL for a convergence object owned by the user.
   *
   * Returns null when the URL is not in the user's convergence namespace.
   */
  async refreshSignedUrl(url: string, userId: string): Promise<string | null> {
    const objectPath = this.extractObjectPath(url);
    if (!objectPath || !isOwnedConvergenceObjectPath(objectPath, userId)) {
      return null;
    }

    const signedUrl = await this.getSignedUrl(objectPath);

    this.log.debug("Refreshed signed URL for convergence media asset", {
      objectPath,
      sourceHost: this.getUrlHost(url),
    });

    return signedUrl;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Generate a signed URL for a stored object.
   */
  private async getSignedUrl(objectPath: string): Promise<string> {
    const { url } = await this.minter.mintRead(objectPath, {
      ttlMs: this.signedUrlTtlMs,
    });
    return url;
  }

  /**
   * Safely extract hostname from URL for logging
   */
  private getUrlHost(url: string): string | null {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }

  /**
   * Extract object path from a signed or unsigned GCS URL. A bare path is
   * accepted as-is — session records persist object paths, not only URLs.
   */
  private extractObjectPath(url: string): string | null {
    if (!url) {
      return null;
    }

    if (!url.includes("://")) {
      const path = url.split("/").filter(Boolean).join("/");
      return path || null;
    }

    const ref = parseGcsObjectUrl(url);
    if (!ref || !bucketNamesMatch(ref.bucket, this.bucket.name)) {
      return null;
    }
    return ref.objectPath;
  }
}

/**
 * Create a GCSStorageService with a provided bucket.
 */
export function createGCSStorageService(
  bucket: Bucket,
  minter: SignedUrlMinter,
  signedUrlTtlMs: number = DEFAULT_CONVERGENCE_SIGNED_URL_TTL_MS,
): GCSStorageService {
  return new GCSStorageService(bucket, minter, signedUrlTtlMs);
}

export default GCSStorageService;
