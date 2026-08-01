import { Storage, type GetSignedUrlConfig } from "@google-cloud/storage";
import { STORAGE_CONFIG } from "../config/storageConfig";
import { logger } from "@infrastructure/Logger";
import type { SignedUrlLedger } from "./SignedUrlLedger";

type SuccessLogLevel = "debug" | "info";

export class SignedUrlService {
  private readonly storage: Storage;
  private readonly bucket;
  private readonly ledger: SignedUrlLedger | null;
  private readonly log = logger.child({ service: "SignedUrlService" });

  constructor(
    storage: Storage,
    bucketName: string = STORAGE_CONFIG.bucketName,
    ledger: SignedUrlLedger | null = null,
  ) {
    this.storage = storage;
    this.bucket = this.storage.bucket(bucketName);
    this.ledger = ledger;
  }

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
        const file = this.bucket.file(path);
        const expiresAtMs = Date.now() + STORAGE_CONFIG.urlExpiration.upload;

        const extensionHeaders: Record<string, string> = {
          "x-goog-if-generation-match": "0",
        };
        const options: GetSignedUrlConfig = {
          version: "v4",
          action: "write",
          expires: expiresAtMs,
          contentType,
        };

        if (maxSize) {
          extensionHeaders["x-goog-content-length-range"] = `0,${maxSize}`;
        }
        options.extensionHeaders = extensionHeaders;

        const [url] = await file.getSignedUrl(options);
        return {
          uploadUrl: url,
          expiresAt: new Date(expiresAtMs).toISOString(),
        };
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
      const file = this.bucket.file(path);
      const expiresAtMs = Date.now() + STORAGE_CONFIG.urlExpiration.view;
      const [url] = await file.getSignedUrl({
        version: "v4",
        action: "read",
        expires: expiresAtMs,
        responseDisposition: disposition,
      });
      // The media proxy's bucket rescue honors only grants on this ledger.
      this.ledger?.record(path, url);

      return {
        viewUrl: url,
        expiresAt: new Date(expiresAtMs).toISOString(),
      };
    });
  }

  /**
   * Sign a view URL only when the object actually exists. Plain getViewUrl
   * signs blindly (GCS mints URLs for absent objects), which would turn a
   * caller's honest 404 into a URL that dies at the bucket.
   */
  async getViewUrlIfPresent(
    path: string,
    disposition = "inline",
  ): Promise<{ viewUrl: string; expiresAt: string } | null> {
    const exists = await this.withTiming("existsCheck", { path }, async () => {
      const [fileExists] = await this.bucket.file(path).exists();
      return fileExists;
    });
    if (!exists) {
      return null;
    }
    return this.getViewUrl(path, disposition);
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
        const file = this.bucket.file(path);
        const downloadName = filename || path.split("/").pop() || "download";
        const expiresAtMs = Date.now() + STORAGE_CONFIG.urlExpiration.download;

        const [url] = await file.getSignedUrl({
          version: "v4",
          action: "read",
          expires: expiresAtMs,
          responseDisposition: `attachment; filename="${downloadName}"`,
        });
        this.ledger?.record(path, url);

        return {
          downloadUrl: url,
          expiresAt: new Date(expiresAtMs).toISOString(),
        };
      },
    );
  }
}

export default SignedUrlService;
