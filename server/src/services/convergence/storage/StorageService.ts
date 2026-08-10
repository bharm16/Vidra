/**
 * StorageService for Visual Convergence
 *
 * Handles storage of generated images in GCS and signed URL generation.
 * Replicate generates images with temporary URLs that expire,
 * so we need to persist them to GCS before storing in session state.
 *
 * @module convergence/storage
 */

import { Bucket, type File } from "@google-cloud/storage";
import { v4 as uuidv4 } from "uuid";
import { logger } from "@infrastructure/Logger";
import type { SignedUrlLedger } from "@services/storage/services/SignedUrlLedger";
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
   * @param destination GCS path (e.g., "convergence/userId123/image.png")
   * @returns Signed GCS URL
   */
  upload(tempUrl: string, destination: string): Promise<string>;

  /**
   * Upload multiple images in parallel
   * @param tempUrls Array of temporary Replicate URLs
   * @param destinationPrefix GCS path prefix (e.g., "convergence/userId123")
   * @returns Array of signed GCS URLs in same order
   */
  uploadBatch(tempUrls: string[], destinationPrefix: string): Promise<string[]>;

  /**
   * Upload a remote image URL to GCS with a generated filename
   * @param sourceUrl Remote URL to fetch
   * @param destinationPrefix GCS path prefix (e.g., "convergence/userId123/final-frame")
   * @returns Signed GCS URL
   */
  uploadFromUrl(sourceUrl: string, destinationPrefix: string): Promise<string>;

  /**
   * Upload a buffer to GCS with a provided destination path
   * @param buffer File contents
   * @param destination GCS object path
   * @param contentType MIME type for the file
   * @returns Signed GCS URL
   */
  uploadBuffer(
    buffer: Buffer,
    destination: string,
    contentType: string,
  ): Promise<string>;

  /**
   * Delete images (for cleanup on session abandonment)
   * @param gcsUrls Array of signed GCS URLs to delete
   */
  delete(gcsUrls: string[]): Promise<void>;

  /**
   * Refresh a signed GCS URL for a convergence object owned by the user.
   *
   * Returns null if the URL does not map to an object owned by that user.
   */
  refreshSignedUrl?(url: string, userId: string): Promise<string | null>;
}

export const isOwnedConvergenceObjectPath = (
  objectPath: string,
  userId: string,
): boolean => objectPath.startsWith(`convergence/${userId}/`);

// ============================================================================
// Configuration
// ============================================================================

let convergenceSignedUrlTtlMs = SESSION_TTL_MS;

export function setConvergenceStorageSignedUrlTtl(ttlSeconds: number): void {
  convergenceSignedUrlTtlMs = ttlSeconds * 1000;
}

const CONVERGENCE_STORAGE_CONFIG = {
  /** Default content type for uploaded images */
  defaultContentType: "image/png",
  /** Timeout for fetching from temporary URLs (5 minutes) */
  fetchTimeoutMs: 5 * 60 * 1000,
  /** Maximum concurrent uploads in a batch */
  maxConcurrentUploads: 10,
  get signedUrlTtlMs() {
    return convergenceSignedUrlTtlMs;
  },
} as const;

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
    private readonly signedUrlLedger?: SignedUrlLedger,
  ) {}

  getBucketName(): string {
    return this.bucket.name;
  }

  /**
   * Upload a single image from temporary URL to GCS
   *
   * @param tempUrl - Temporary URL (e.g., from Replicate)
   * @param destination - GCS path for the file
   * @returns Signed GCS URL
   * @throws Error if fetch or upload fails
   */
  async upload(tempUrl: string, destination: string): Promise<string> {
    const startTime = Date.now();
    this.log.debug("Starting image upload", {
      destination,
      tempUrlHost: this.getUrlHost(tempUrl),
    });

    try {
      // Fetch image from temporary URL with timeout
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        CONVERGENCE_STORAGE_CONFIG.fetchTimeoutMs,
      );

      let response: Response;
      try {
        response = await fetch(tempUrl, {
          signal: controller.signal,
          redirect: "follow",
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        throw new Error(
          `Failed to fetch image: ${response.status} ${response.statusText}`,
        );
      }

      // Get the image data as buffer
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Determine content type from response or use default
      const contentType = this.normalizeContentType(
        response.headers.get("content-type") ||
          CONVERGENCE_STORAGE_CONFIG.defaultContentType,
      );

      // Upload to GCS
      const file = this.bucket.file(destination);
      const saveOptions: Parameters<typeof file.save>[1] = {
        contentType,
        metadata: {
          cacheControl: "public, max-age=31536000", // 1 year cache
          metadata: {
            sourceUrl: tempUrl.slice(0, 200), // Truncate for metadata limits
            uploadedAt: new Date().toISOString(),
          },
        },
      };

      await file.save(buffer, saveOptions);

      const signedUrl = await this.getSignedUrl(file);
      const duration = Date.now() - startTime;

      this.log.info("Image upload completed", {
        destination,
        sizeBytes: buffer.length,
        contentType,
        duration,
      });

      return signedUrl;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log.error("Image upload failed", error as Error, {
        destination,
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
   * @param destinationPrefix - GCS path prefix (e.g., "convergence/userId123")
   * @returns Array of signed GCS URLs in same order as input
   * @throws Error if any upload fails
   */
  async uploadBatch(
    tempUrls: string[],
    destinationPrefix: string,
  ): Promise<string[]> {
    if (tempUrls.length === 0) {
      return [];
    }

    const startTime = Date.now();
    this.log.debug("Starting batch upload", {
      count: tempUrls.length,
      destinationPrefix,
    });

    try {
      // Generate unique destinations for each URL
      const uploadPromises = tempUrls.map((url) => {
        const filename = `${uuidv4()}.png`;
        const destination = `${destinationPrefix}/${filename}`;
        return this.upload(url, destination);
      });

      // Execute all uploads in parallel
      const results = await Promise.all(uploadPromises);

      const duration = Date.now() - startTime;
      this.log.info("Batch upload completed", {
        count: tempUrls.length,
        destinationPrefix,
        duration,
      });

      return results;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log.error("Batch upload failed", error as Error, {
        count: tempUrls.length,
        destinationPrefix,
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
    destinationPrefix: string,
  ): Promise<string> {
    const sanitizedPrefix = destinationPrefix.replace(/\/+$/, "");
    const destination = `${sanitizedPrefix}/${uuidv4()}.png`;
    return this.upload(sourceUrl, destination);
  }

  /**
   * Upload a buffer directly to GCS.
   */
  async uploadBuffer(
    buffer: Buffer,
    destination: string,
    contentType: string,
  ): Promise<string> {
    const startTime = Date.now();
    const normalizedContentType = this.normalizeContentType(
      contentType || CONVERGENCE_STORAGE_CONFIG.defaultContentType,
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

      const signedUrl = await this.getSignedUrl(file);
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
  async delete(gcsUrls: string[]): Promise<void> {
    if (gcsUrls.length === 0) {
      return;
    }

    const startTime = Date.now();
    this.log.debug("Starting batch delete", { count: gcsUrls.length });

    const deletePromises = gcsUrls.map(async (url) => {
      try {
        const path = this.extractObjectPath(url);
        if (!path) {
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

    const file = this.bucket.file(objectPath);
    const signedUrl = await this.getSignedUrl(file);

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
   * Normalize content type by removing charset and other parameters
   */
  private normalizeContentType(contentType: string): string {
    return contentType.split(";")[0]?.trim().toLowerCase() || "image/png";
  }

  /**
   * Generate a signed URL for a stored object.
   */
  private async getSignedUrl(file: File): Promise<string> {
    const expiresAt = Date.now() + CONVERGENCE_STORAGE_CONFIG.signedUrlTtlMs;
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: expiresAt,
    });
    this.signedUrlLedger?.record(file.name, url);
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
   * Extract object path from a signed or unsigned GCS URL.
   */
  private extractObjectPath(url: string): string | null {
    if (!url) {
      return null;
    }

    if (!url.includes("://")) {
      const path = url.replace(/^\/+/, "");
      return path || null;
    }

    try {
      const urlObj = new URL(url);
      const host = urlObj.hostname;
      const path = urlObj.pathname.replace(/^\/+/, "");

      if (host === "storage.googleapis.com") {
        const parts = path.split("/").filter(Boolean);
        if (parts[0] !== this.bucket.name) {
          return null;
        }
        const objectPath = parts.slice(1).join("/");
        return objectPath || null;
      }

      if (host === `${this.bucket.name}.storage.googleapis.com`) {
        return path || null;
      }

      if (host.endsWith(".storage.googleapis.com")) {
        const bucketFromHost = host.slice(0, -".storage.googleapis.com".length);
        if (bucketFromHost !== this.bucket.name) {
          return null;
        }
        return path || null;
      }

      return null;
    } catch {
      return null;
    }
  }
}

/**
 * Create a GCSStorageService with a provided bucket.
 */
export function createGCSStorageService(
  bucket: Bucket,
  signedUrlLedger?: SignedUrlLedger,
): GCSStorageService {
  return new GCSStorageService(bucket, signedUrlLedger);
}

export default GCSStorageService;
