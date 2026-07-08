import { Storage } from "@google-cloud/storage";
import { SignedUrlService } from "./services/SignedUrlService";
import { UploadService } from "./services/UploadService";
import { RetentionService } from "./services/RetentionService";
import { safeUrlHost } from "@shared/utils/url";
import { logger } from "@infrastructure/Logger";
import {
  STORAGE_CONFIG,
  STORAGE_TYPES,
  resolveStorageTypeKey,
  type StorageType,
} from "./config/storageConfig";
import { generateStoragePath, validatePathOwnership } from "./utils/pathUtils";
import { createForbiddenError } from "./utils/httpError";

function normalizeContentType(value: string): string {
  const [primary] = value.split(";");
  return (primary ?? "").trim().toLowerCase();
}

function resolveExtension(contentType: string): string {
  const normalized = normalizeContentType(contentType);
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "video/quicktime") return "mov";
  const parts = normalized.split("/");
  return parts[1] || "bin";
}

function isAllowedContentType(type: StorageType, contentType: string): boolean {
  const key = resolveStorageTypeKey(type);
  const allowed = STORAGE_CONFIG.allowedContentTypes[key] || [];
  const normalized = normalizeContentType(contentType);
  return allowed.some((allowedType) => normalized.startsWith(allowedType));
}

type SuccessLogLevel = "debug" | "info";

export class StorageService {
  private readonly storage: Storage;
  private readonly bucket;
  private readonly signedUrlService: SignedUrlService;
  private readonly uploadService: UploadService;
  private readonly retentionService: RetentionService;
  private readonly log = logger.child({ service: "StorageService" });

  constructor(
    dependencies: {
      storage?: Storage;
      bucketName?: string;
      signedUrlService?: SignedUrlService;
      uploadService?: UploadService;
      retentionService?: RetentionService;
    } = {},
  ) {
    if (!dependencies.storage) {
      throw new Error("StorageService requires an injected Storage instance");
    }
    this.storage = dependencies.storage;
    const bucketName = dependencies.bucketName || STORAGE_CONFIG.bucketName;
    this.bucket = this.storage.bucket(bucketName);
    this.signedUrlService =
      dependencies.signedUrlService ||
      new SignedUrlService(this.storage, bucketName);
    this.uploadService =
      dependencies.uploadService || new UploadService(this.storage, bucketName);
    this.retentionService =
      dependencies.retentionService ||
      new RetentionService(this.storage, bucketName);
  }

  private async withTiming<T>(
    operation: string,
    meta: Record<string, unknown>,
    fn: () => Promise<T>,
    successLevel: SuccessLogLevel = "info",
  ): Promise<T> {
    const startTime = Date.now();
    this.log.debug("Storage operation started", { operation, ...meta });

    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      const payload = { operation, duration, ...meta };

      if (successLevel === "info") {
        this.log.info("Storage operation completed", payload);
      } else {
        this.log.debug("Storage operation completed", payload);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log.error("Storage operation failed", error as Error, {
        operation,
        duration,
        ...meta,
      });
      throw error;
    }
  }

  async getUploadUrl(
    userId: string,
    type: StorageType,
    contentType: string,
    _metadata: Record<string, unknown> = {},
  ): Promise<{
    uploadUrl: string;
    storagePath: string;
    expiresAt: string;
    maxSizeBytes: number;
  }> {
    if (!Object.values(STORAGE_TYPES).includes(type)) {
      throw new Error(`Invalid storage type: ${type}`);
    }

    const normalizedContentType = normalizeContentType(contentType);
    if (!isAllowedContentType(type, normalizedContentType)) {
      throw new Error(
        `Invalid content type ${normalizedContentType} for type ${type}`,
      );
    }

    const extension = resolveExtension(normalizedContentType);
    const path = generateStoragePath(userId, type, extension);
    const maxSize = STORAGE_CONFIG.maxFileSize[resolveStorageTypeKey(type)];

    const result = await this.withTiming(
      "getUploadUrl",
      {
        userId,
        type,
        contentType: normalizedContentType,
        maxSizeBytes: maxSize,
        storagePath: path,
      },
      async () => {
        const { uploadUrl, expiresAt } =
          await this.signedUrlService.getUploadUrl(
            path,
            normalizedContentType,
            maxSize,
          );

        void _metadata;

        return {
          uploadUrl,
          storagePath: path,
          expiresAt,
          maxSizeBytes: maxSize,
        };
      },
    );

    return result;
  }

  async saveFromUrl(
    userId: string,
    sourceUrl: string,
    type: StorageType,
    metadata: Record<string, unknown> = {},
  ): Promise<{
    storagePath: string;
    viewUrl: string;
    expiresAt: string;
    sizeBytes: number;
    contentType: string;
    createdAt: string;
  }> {
    if (!Object.values(STORAGE_TYPES).includes(type)) {
      throw new Error(`Invalid storage type: ${type}`);
    }

    const result = await this.withTiming(
      "saveFromUrl",
      {
        userId,
        type,
        sourceHost: safeUrlHost(sourceUrl),
      },
      async () => {
        const uploadResult = await this.uploadService.uploadFromUrl(
          sourceUrl,
          userId,
          type,
          metadata,
        );

        const { viewUrl, expiresAt } = await this.signedUrlService.getViewUrl(
          uploadResult.storagePath,
        );

        return {
          ...uploadResult,
          viewUrl,
          expiresAt,
        };
      },
    );

    return result;
  }

  async saveFromBuffer(
    userId: string,
    buffer: Buffer,
    type: StorageType,
    contentType: string,
    metadata: Record<string, unknown> = {},
  ): Promise<{
    storagePath: string;
    viewUrl: string;
    expiresAt: string;
    sizeBytes: number;
    contentType: string;
    createdAt: string;
  }> {
    if (!Object.values(STORAGE_TYPES).includes(type)) {
      throw new Error(`Invalid storage type: ${type}`);
    }

    const result = await this.withTiming(
      "saveFromBuffer",
      {
        userId,
        type,
        contentType: normalizeContentType(contentType),
        sizeBytes: buffer.length,
      },
      async () => {
        const uploadResult = await this.uploadService.uploadFromBuffer(
          buffer,
          userId,
          type,
          contentType,
          metadata,
        );

        const { viewUrl, expiresAt } = await this.signedUrlService.getViewUrl(
          uploadResult.storagePath,
        );

        return {
          ...uploadResult,
          viewUrl,
          expiresAt,
        };
      },
    );

    return result;
  }

  /**
   * Persist a preview image. The storage type (PREVIEW_IMAGE) and content
   * type (image/png) are fixed for this verb, so callers never name
   * STORAGE_TYPES or the mime — the type catalogue stays internal to storage.
   */
  async savePreviewImage(
    userId: string,
    buffer: Buffer,
    metadata: Record<string, unknown> = {},
  ): Promise<{
    storagePath: string;
    viewUrl: string;
    expiresAt: string;
    sizeBytes: number;
    contentType: string;
    createdAt: string;
  }> {
    return this.saveFromBuffer(
      userId,
      buffer,
      STORAGE_TYPES.PREVIEW_IMAGE,
      "image/png",
      metadata,
    );
  }

  async uploadBuffer(
    userId: string,
    type: StorageType,
    buffer: Buffer,
    contentType: string,
    metadata: Record<string, unknown> = {},
  ): Promise<{
    storagePath: string;
    viewUrl: string;
    expiresAt: string;
    sizeBytes: number;
    contentType: string;
  }> {
    if (!Object.values(STORAGE_TYPES).includes(type)) {
      throw new Error(`Invalid storage type: ${type}`);
    }

    const result = await this.withTiming(
      "uploadBuffer",
      {
        userId,
        type,
        contentType: normalizeContentType(contentType),
        sizeBytes: buffer.length,
      },
      async () => {
        const uploadResult = await this.uploadService.uploadBuffer(
          buffer,
          userId,
          type,
          contentType,
          metadata,
        );

        const { viewUrl, expiresAt } = await this.signedUrlService.getViewUrl(
          uploadResult.storagePath,
        );

        return {
          ...uploadResult,
          viewUrl,
          expiresAt,
        };
      },
    );

    return result;
  }

  async uploadStream(
    userId: string,
    type: StorageType,
    stream: NodeJS.ReadableStream,
    sizeBytes: number,
    contentType: string,
    metadata: Record<string, unknown> = {},
  ): Promise<{
    storagePath: string;
    viewUrl: string;
    expiresAt: string;
    sizeBytes: number;
    contentType: string;
  }> {
    if (!Object.values(STORAGE_TYPES).includes(type)) {
      throw new Error(`Invalid storage type: ${type}`);
    }

    const result = await this.withTiming(
      "uploadStream",
      {
        userId,
        type,
        contentType: normalizeContentType(contentType),
        sizeBytes,
      },
      async () => {
        const uploadResult = await this.uploadService.uploadStream(
          stream,
          sizeBytes,
          userId,
          type,
          contentType,
          metadata,
        );

        const { viewUrl, expiresAt } = await this.signedUrlService.getViewUrl(
          uploadResult.storagePath,
        );

        return {
          ...uploadResult,
          viewUrl,
          expiresAt,
        };
      },
    );

    return result;
  }

  async confirmUpload(
    userId: string,
    storagePath: string,
  ): Promise<{
    storagePath: string;
    sizeBytes: number;
    contentType: string | undefined;
    createdAt: string;
  }> {
    return this.withTiming("confirmUpload", { userId, storagePath }, async () =>
      this.uploadService.confirmUpload(storagePath, userId),
    );
  }

  async getViewUrl(
    userId: string,
    storagePath: string,
  ): Promise<{ viewUrl: string; expiresAt: string; storagePath: string }> {
    if (!validatePathOwnership(storagePath, userId)) {
      throw createForbiddenError(
        "Unauthorized - cannot access files belonging to other users",
      );
    }

    return this.withTiming(
      "getViewUrl",
      { userId, storagePath },
      async () => {
        const result = await this.signedUrlService.getViewUrl(storagePath);
        return {
          ...result,
          storagePath,
        };
      },
      "debug",
    );
  }

  /**
   * Resolve a fresh view URL for a storage path WITHOUT an owner check.
   *
   * The sole caller is public clip sharing (ADR-0010 site-scope D8): an
   * explicit, owner-scoped Share already minted a record that IS the access
   * grant, so the public read legitimately bypasses per-request ownership.
   * Do NOT use for user-facing reads — use getViewUrl, which enforces it.
   */
  async getSharedViewUrl(
    storagePath: string,
  ): Promise<{ viewUrl: string; expiresAt: string }> {
    return this.signedUrlService.getViewUrl(storagePath);
  }

  async getDownloadUrl(
    userId: string,
    storagePath: string,
    filename?: string | null,
  ): Promise<{ downloadUrl: string; expiresAt: string }> {
    if (!validatePathOwnership(storagePath, userId)) {
      throw createForbiddenError(
        "Unauthorized - cannot access files belonging to other users",
      );
    }

    return this.withTiming(
      "getDownloadUrl",
      { userId, storagePath, hasFilename: Boolean(filename) },
      async () => this.signedUrlService.getDownloadUrl(storagePath, filename),
      "debug",
    );
  }

  async listFiles(
    userId: string,
    options: {
      type?: string | null;
      limit?: number;
      pageToken?: string | null;
    } = {},
  ): Promise<{ items: unknown[]; nextCursor: string | null }> {
    return this.withTiming(
      "listFiles",
      {
        userId,
        type: options.type ?? null,
        limit: options.limit ?? null,
        hasPageToken: Boolean(options.pageToken),
      },
      async () => this.retentionService.listUserFiles(userId, options),
      "debug",
    );
  }

  async deleteFile(
    userId: string,
    storagePath: string,
  ): Promise<{ deleted: boolean; path: string }> {
    return this.withTiming("deleteFile", { userId, storagePath }, async () =>
      this.retentionService.deleteFile(storagePath, userId),
    );
  }

  async deleteFiles(
    userId: string,
    storagePaths: string[],
  ): Promise<{ deleted: number; failed: number; details: unknown[] }> {
    return this.withTiming(
      "deleteFiles",
      { userId, pathsCount: storagePaths.length },
      async () => this.retentionService.deleteFiles(storagePaths, userId),
    );
  }

  async getStorageUsage(userId: string): Promise<{
    totalBytes: number;
    totalMB: number;
    byType: Record<string, number>;
    fileCount: number;
  }> {
    return this.withTiming(
      "getStorageUsage",
      { userId },
      async () => this.retentionService.getUserStorageUsage(userId),
      "debug",
    );
  }

  async fileExists(storagePath: string): Promise<boolean> {
    return this.withTiming(
      "fileExists",
      { storagePath },
      async () => {
        const file = this.bucket.file(storagePath);
        const [exists] = await file.exists();
        return exists;
      },
      "debug",
    );
  }

  async getFileMetadata(
    userId: string,
    storagePath: string,
  ): Promise<{
    storagePath: string;
    sizeBytes: number;
    contentType: string | undefined;
    createdAt: string;
    updatedAt: string | undefined;
    metadata: Record<string, unknown>;
  }> {
    if (!validatePathOwnership(storagePath, userId)) {
      throw createForbiddenError("Unauthorized");
    }

    return this.withTiming(
      "getFileMetadata",
      { userId, storagePath },
      async () => {
        const file = this.bucket.file(storagePath);
        const [metadata] = await file.getMetadata();

        return {
          storagePath,
          sizeBytes: Number.parseInt(String(metadata.size ?? "0"), 10),
          contentType: metadata.contentType,
          createdAt: metadata.timeCreated ?? new Date().toISOString(),
          updatedAt: metadata.updated,
          metadata: metadata.metadata || {},
        };
      },
      "debug",
    );
  }
}

export default StorageService;
