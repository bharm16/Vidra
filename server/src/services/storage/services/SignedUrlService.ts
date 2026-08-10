import { STORAGE_CONFIG } from "../config/storageConfig";
import { logger } from "@infrastructure/Logger";
import type { SignedUrlMinter } from "@infrastructure/signedUrl/SignedUrlMinter";

type SuccessLogLevel = "debug" | "info";

/**
 * Storage-domain grant policy: which TTL and disposition each verb gets.
 * The signing itself — version, ledger recording — belongs to the minter.
 */
export class SignedUrlService {
  private readonly log = logger.child({ service: "SignedUrlService" });

  constructor(private readonly minter: SignedUrlMinter) {}

  private async withTiming<T>(
    operation: string,
    meta: Record<string, unknown>,
    fn: () => Promise<T>,
    successLevel: SuccessLogLevel = "debug",
  ): Promise<T> {
    const startTime = Date.now();
    this.log.debug("Signed URL operation started", { operation, ...meta });

    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      const payload = { operation, duration, ...meta };

      if (successLevel === "info") {
        this.log.info("Signed URL operation completed", payload);
      } else {
        this.log.debug("Signed URL operation completed", payload);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log.error("Signed URL operation failed", error as Error, {
        operation,
        duration,
        ...meta,
      });
      throw error;
    }
  }

  async getUploadUrl(
    path: string,
    contentType: string,
    maxSize?: number | null,
  ): Promise<{
    uploadUrl: string;
    expiresAt: string;
  }> {
    return this.withTiming(
      "getUploadUrl",
      { path, contentType, maxSizeBytes: maxSize ?? null },
      async () => {
        const grant = await this.minter.mintWrite(path, {
          ttlMs: STORAGE_CONFIG.urlExpiration.upload,
          contentType,
          maxSizeBytes: maxSize ?? null,
        });
        return { uploadUrl: grant.url, expiresAt: grant.expiresAt };
      },
      "info",
    );
  }

  async getViewUrl(
    path: string,
    disposition = "inline",
  ): Promise<{
    viewUrl: string;
    expiresAt: string;
  }> {
    return this.withTiming("getViewUrl", { path, disposition }, async () => {
      const grant = await this.minter.mintRead(path, {
        ttlMs: STORAGE_CONFIG.urlExpiration.view,
        disposition,
      });
      return { viewUrl: grant.url, expiresAt: grant.expiresAt };
    });
  }

  /**
   * Sign a view URL only when the object actually exists, so a caller's
   * honest 404 stays a 404 instead of becoming a URL that dies at the bucket.
   */
  async getViewUrlIfPresent(
    path: string,
    disposition = "inline",
  ): Promise<{ viewUrl: string; expiresAt: string } | null> {
    return this.withTiming(
      "getViewUrlIfPresent",
      { path, disposition },
      async () => {
        const grant = await this.minter.mintReadIfPresent(path, {
          ttlMs: STORAGE_CONFIG.urlExpiration.view,
          disposition,
        });
        return grant
          ? { viewUrl: grant.url, expiresAt: grant.expiresAt }
          : null;
      },
    );
  }

  async getDownloadUrl(
    path: string,
    filename?: string | null,
  ): Promise<{
    downloadUrl: string;
    expiresAt: string;
  }> {
    return this.withTiming(
      "getDownloadUrl",
      { path, hasFilename: Boolean(filename) },
      async () => {
        const downloadName = filename || path.split("/").pop() || "download";
        const grant = await this.minter.mintRead(path, {
          ttlMs: STORAGE_CONFIG.urlExpiration.download,
          disposition: `attachment; filename="${downloadName}"`,
        });
        return { downloadUrl: grant.url, expiresAt: grant.expiresAt };
      },
    );
  }
}

export default SignedUrlService;
