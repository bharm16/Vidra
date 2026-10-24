import { Storage, type File } from "@google-cloud/storage";
import { sha256Hex } from "@utils/hash";
import { ownerSegment } from "@services/owned-media";
import { pipeline } from "node:stream/promises";
import {
  openRemoteMedia,
  type RemoteMediaStream,
} from "@services/owned-media/RemoteMediaFetcher";
import type { PublicNetworkDependencies } from "@services/owned-media/PublicNetworkTransport";
import {
  STORAGE_CONFIG,
  STORAGE_TYPES,
  resolveStorageTypeKey,
  type StorageType,
} from "../config/storageConfig";
import { generateStoragePath, validatePathOwnership } from "../utils/pathUtils";
import { createForbiddenError } from "../utils/httpError";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const RESUMABLE_THRESHOLD_BYTES = 5 * 1024 * 1024;
const PRECONDITION_OPTS = { ifGenerationMatch: 0 };

function normalizeContentType(value: string): string {
  const [primary] = value.split(";");
  return (primary ?? "").trim().toLowerCase();
}

function resolveExtension(contentType: string): string {
  const normalized = normalizeContentType(contentType);
  if (normalized === "image/jpeg") return "jpg";
  // Without this the subtype "svg+xml" would leak into the object name.
  if (normalized === "image/svg+xml") return "svg";
  if (normalized === "video/quicktime") return "mov";
  const parts = normalized.split("/");
  return parts[1] || "bin";
}

function isAllowedContentType(type: StorageType, contentType: string): boolean {
  const typeKey = resolveStorageTypeKey(type);
  const allowed = STORAGE_CONFIG.allowedContentTypes[typeKey] || [];
  const normalized = normalizeContentType(contentType);
  return allowed.some((allowedType) => normalized.startsWith(allowedType));
}

export class UploadService {
  private readonly storage: Storage;
  private readonly bucket;

  constructor(
    storage: Storage,
    bucketName: string = STORAGE_CONFIG.bucketName,
    private readonly network: PublicNetworkDependencies = {},
  ) {
    this.storage = storage;
    this.bucket = this.storage.bucket(bucketName);
  }

  async uploadFromUrl(
    sourceUrl: string,
    userId: string,
    type: StorageType,
    metadata: Record<string, unknown> = {},
  ): Promise<{
    storagePath: string;
    sizeBytes: number;
    contentType: string;
    createdAt: string;
  }> {
    if (!Object.values(STORAGE_TYPES).includes(type)) {
      throw new Error(`Invalid storage type: ${type}`);
    }

    const deliveryKey = type === "generation" && typeof metadata.legacyVideoJobId === "string" && typeof metadata.legacyVideoAssetId === "string"
      ? sha256Hex(JSON.stringify([userId, metadata.legacyVideoJobId, metadata.legacyVideoAssetId, sourceUrl])) : undefined;
    const deliveryPath = deliveryKey ? `users/${ownerSegment(userId)}/generations/legacy-${deliveryKey}.mp4` : undefined;
    const existingDelivery = async (): Promise<{ storagePath: string; sizeBytes: number; contentType: string; createdAt: string } | undefined> => {
      if (!deliveryPath) return undefined;
      try {
        const [row] = await this.bucket.file(deliveryPath).getMetadata();
        if (row.metadata?.legacyVideoDeliveryKey !== deliveryKey || !row.contentType || !isAllowedContentType(type, row.contentType) || !(Number(row.size) > 0)) throw new Error("The legacy delivery destination belongs to different output.");
        return { storagePath: deliveryPath, sizeBytes: Number(row.size), contentType: row.contentType, createdAt: row.timeCreated ?? new Date().toISOString() };
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === 404) return undefined;
        throw error;
      }
    };
    const recovered = await existingDelivery();
    if (recovered) return recovered;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    let remote: RemoteMediaStream | undefined;
    let destination: File | undefined;
    let writeStarted = false;
    let writeCompleted = false;

    try {
      const typeKey = resolveStorageTypeKey(type);
      remote = await openRemoteMedia({
        sourceUrl,
        fieldName: "sourceUrl",
        allowedContentTypes: STORAGE_CONFIG.allowedContentTypes[typeKey],
        maxBytes: STORAGE_CONFIG.maxFileSize[typeKey],
        signal: controller.signal,
      }, this.network);
      const { contentType, contentLength } = remote;

      const extension = resolveExtension(contentType);
      const path = deliveryPath ?? generateStoragePath(userId, type, extension);
      const file = this.bucket.file(path);
      destination = file;

      const model =
        typeof metadata.model === "string" ? metadata.model : "unknown";
      const promptId =
        typeof metadata.promptId === "string" ? metadata.promptId : "";

      writeStarted = true;
      await pipeline(remote.stream, file.createWriteStream({
        metadata: {
          contentType,
          metadata: {
            ...metadata,
            ...(deliveryKey ? { legacyVideoDeliveryKey: deliveryKey } : {}),
            userId,
            type,
            sourceUrl: remote.sourceUrl.slice(0, 200),
            model,
            promptId,
            createdAt: new Date().toISOString(),
          },
        },
        resumable: contentLength
          ? contentLength > RESUMABLE_THRESHOLD_BYTES
          : true,
        preconditionOpts: PRECONDITION_OPTS,
      }), { signal: controller.signal });
      writeCompleted = true;

      const [fileMetadata] = await file.getMetadata();

      return {
        storagePath: path,
        sizeBytes: Number.parseInt(String(fileMetadata.size ?? "0"), 10),
        contentType: fileMetadata.contentType || contentType,
        createdAt: fileMetadata.timeCreated ?? new Date().toISOString(),
      };
    } catch (error) {
      remote?.cancel(error instanceof Error ? error : new Error(String(error)));
      const code = typeof error === "object" && error !== null && "code" in error
        ? error.code
        : undefined;
      if (deliveryPath && (code === 412 || code === "412")) { const stored = await existingDelivery(); if (stored) return stored; }
      // A create-only collision belongs to an earlier write; never delete it.
      if (!deliveryPath && writeStarted && !writeCompleted && destination && code !== 412 && code !== "412") {
        try {
          await destination.delete({ ignoreNotFound: true });
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            "Remote upload failed and its partial object could not be removed",
          );
        }
      }
      throw error;
    } finally {
      remote?.cancel();
      clearTimeout(timeout);
    }
  }

  async uploadFromBuffer(
    buffer: Buffer,
    userId: string,
    type: StorageType,
    contentType: string,
    metadata: Record<string, unknown> = {},
  ): Promise<{
    storagePath: string;
    sizeBytes: number;
    contentType: string;
    createdAt: string;
  }> {
    if (!Object.values(STORAGE_TYPES).includes(type)) {
      throw new Error(`Invalid storage type: ${type}`);
    }

    const normalizedContentType = normalizeContentType(contentType);
    if (!isAllowedContentType(type, normalizedContentType)) {
      throw new Error(`Invalid content type: ${normalizedContentType}`);
    }

    const maxSize = STORAGE_CONFIG.maxFileSize[resolveStorageTypeKey(type)];
    if (buffer.length > maxSize) {
      throw new Error(
        `File too large: ${buffer.length} bytes (max: ${maxSize})`,
      );
    }

    const extension = resolveExtension(normalizedContentType);
    const path = generateStoragePath(userId, type, extension);
    const file = this.bucket.file(path);

    const model =
      typeof metadata.model === "string" ? metadata.model : "unknown";
    const promptId =
      typeof metadata.promptId === "string" ? metadata.promptId : "";

    await file.save(buffer, {
      contentType: normalizedContentType,
      resumable: buffer.length > RESUMABLE_THRESHOLD_BYTES,
      metadata: {
        metadata: {
          ...metadata,
          userId,
          type,
          model,
          promptId,
          createdAt: new Date().toISOString(),
        },
      },
      preconditionOpts: PRECONDITION_OPTS,
    });

    return {
      storagePath: path,
      sizeBytes: buffer.length,
      contentType: normalizedContentType,
      createdAt: new Date().toISOString(),
    };
  }

  async confirmUpload(
    path: string,
    userId: string,
  ): Promise<{
    storagePath: string;
    sizeBytes: number;
    contentType: string | undefined;
    createdAt: string;
  }> {
    if (!validatePathOwnership(path, userId)) {
      throw createForbiddenError("Unauthorized - file does not belong to user");
    }

    const file = this.bucket.file(path);
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error("Upload not found - may have failed or expired");
    }

    const [metadata] = await file.getMetadata();

    return {
      storagePath: path,
      sizeBytes: Number.parseInt(String(metadata.size ?? "0"), 10),
      contentType: metadata.contentType,
      createdAt: metadata.timeCreated ?? new Date().toISOString(),
    };
  }
}

export default UploadService;
