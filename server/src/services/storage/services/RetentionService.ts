import { Storage } from "@google-cloud/storage";
import { STORAGE_CONFIG } from "../config/storageConfig";
import { validatePathOwnership, getTypeFromPath } from "../utils/pathUtils";
import { createForbiddenError } from "../utils/httpError";

export class RetentionService {
  private readonly storage: Storage;
  private readonly bucket;

  constructor(
    storage: Storage,
    bucketName: string = STORAGE_CONFIG.bucketName,
  ) {
    this.storage = storage;
    this.bucket = this.storage.bucket(bucketName);
  }

  async deleteFile(
    path: string,
    userId: string,
  ): Promise<{ deleted: boolean; path: string }> {
    if (!validatePathOwnership(path, userId)) {
      throw createForbiddenError(
        "Unauthorized - cannot delete files belonging to other users",
      );
    }

    const file = this.bucket.file(path);
    const [exists] = await file.exists();
    if (!exists) {
      return { deleted: true, path };
    }

    await file.delete();
    return { deleted: true, path };
  }

  async deleteFiles(
    paths: string[],
    userId: string,
  ): Promise<{
    deleted: number;
    failed: number;
    details: { path: string; success: boolean; error: string | null }[];
  }> {
    const results = await Promise.allSettled(
      paths.map((path) => this.deleteFile(path, userId)),
    );

    return {
      deleted: results.filter((result) => result.status === "fulfilled").length,
      failed: results.filter((result) => result.status === "rejected").length,
      details: results.map((result, index) => ({
        path: paths[index] ?? "",
        success: result.status === "fulfilled",
        error:
          result.status === "rejected"
            ? result.reason?.message || String(result.reason)
            : null,
      })),
    };
  }

  async listUserFiles(
    userId: string,
    options: {
      type?: string | null;
      limit?: number;
      pageToken?: string | null;
    } = {},
  ): Promise<{ items: unknown[]; nextCursor: string | null }> {
    const { type, limit = 50, pageToken } = options;

    let prefix = `users/${userId}/`;
    if (type === "preview-image") prefix += "previews/images/";
    else if (type === "preview-vector") prefix += "previews/vectors/";
    else if (type === "preview-video") prefix += "previews/videos/";
    else if (type === "generation") prefix += "generations/";

    const query = pageToken
      ? { prefix, maxResults: limit, pageToken }
      : { prefix, maxResults: limit };
    const [files, , nextQuery] = await this.bucket.getFiles(query);

    const items = await Promise.all(
      files.map(async (file) => {
        const [metadata] = await file.getMetadata();
        return {
          storagePath: file.name,
          type: getTypeFromPath(file.name),
          sizeBytes: Number.parseInt(String(metadata.size ?? "0"), 10),
          contentType: metadata.contentType,
          createdAt: metadata.timeCreated ?? new Date().toISOString(),
          metadata: metadata.metadata || {},
        };
      }),
    );

    const nextCursor =
      typeof nextQuery === "object" &&
      nextQuery !== null &&
      "pageToken" in nextQuery &&
      typeof (nextQuery as { pageToken?: unknown }).pageToken === "string"
        ? (nextQuery as { pageToken: string }).pageToken
        : null;

    return {
      items,
      nextCursor,
    };
  }

  async getUserStorageUsage(userId: string): Promise<{
    totalBytes: number;
    totalMB: number;
    byType: Record<string, number>;
    fileCount: number;
  }> {
    const [files] = await this.bucket.getFiles({
      prefix: `users/${userId}/`,
    });

    const byType: Record<string, number> = {
      "preview-image": 0,
      "preview-vector": 0,
      "preview-video": 0,
      generation: 0,
    };

    let totalBytes = 0;

    for (const file of files) {
      const [metadata] = await file.getMetadata();
      const size = Number.parseInt(String(metadata.size ?? "0"), 10);
      const type = getTypeFromPath(file.name);

      totalBytes += size;
      if (type && byType[type] !== undefined) {
        byType[type] += size;
      }
    }

    return {
      totalBytes,
      totalMB: Math.round((totalBytes / 1024 / 1024) * 100) / 100,
      byType,
      fileCount: files.length,
    };
  }
}

export default RetentionService;
