/**
 * Local Image Asset Store
 *
 * Stores images to local filesystem (development fallback).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { logger } from "@infrastructure/Logger";
import { fetchRemoteMedia } from "@services/owned-media";
import type { ImageAssetStore, StoredImageAsset } from "./types";

const IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

interface LocalImageAssetStoreOptions {
  directory: string;
  publicPath: string;
}

export class LocalImageAssetStore implements ImageAssetStore {
  private readonly directory: string;
  private readonly publicPath: string;
  private readonly log = logger.child({ service: "LocalImageAssetStore" });
  private initialized = false;

  constructor(options: LocalImageAssetStoreOptions) {
    this.directory = path.resolve(options.directory);
    this.publicPath = options.publicPath.replace(/\/+$/, "");
  }

  private async ensureDirectory(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(this.directory, { recursive: true });
    this.initialized = true;
  }

  async storeFromUrl(
    sourceUrl: string,
    userId: string,
    contentType?: string,
  ): Promise<StoredImageAsset> {
    await this.ensureUserDirectory(userId);

    const id = uuidv4();
    const remoteMedia = await fetchRemoteMedia({
      sourceUrl,
      fieldName: "sourceUrl",
      allowedContentTypes: IMAGE_CONTENT_TYPES,
      maxBytes: MAX_IMAGE_BYTES,
    });
    const buffer = remoteMedia.buffer;
    const resolvedContentType = contentType || remoteMedia.contentType;

    const extension = this.getExtension(resolvedContentType);
    const filename = `${id}${extension}`;
    const userDirectory = this.resolveUserDirectory(userId);
    const filePath = path.join(userDirectory, filename);

    await fs.writeFile(filePath, buffer);

    const stats = await fs.stat(filePath);
    const url = this.buildPublicUrl(userId, id);

    this.log.info("Stored image locally", { id, sizeBytes: stats.size });

    return {
      id,
      storagePath: `${this.sanitizeUserId(userId)}/${filename}`,
      url,
      contentType: resolvedContentType,
      createdAt: Date.now(),
      sizeBytes: stats.size,
    };
  }

  async storeFromBuffer(
    buffer: Buffer,
    contentType: string,
    userId: string,
  ): Promise<StoredImageAsset> {
    await this.ensureUserDirectory(userId);

    const id = uuidv4();
    const extension = this.getExtension(contentType);
    const filename = `${id}${extension}`;
    const userDirectory = this.resolveUserDirectory(userId);
    const filePath = path.join(userDirectory, filename);

    await fs.writeFile(filePath, buffer);

    const stats = await fs.stat(filePath);
    const url = this.buildPublicUrl(userId, id);

    return {
      id,
      storagePath: `${this.sanitizeUserId(userId)}/${filename}`,
      url,
      contentType,
      createdAt: Date.now(),
      sizeBytes: stats.size,
    };
  }

  async getPublicUrl(assetId: string, userId: string): Promise<string | null> {
    const exists = await this.exists(assetId, userId);
    if (!exists) {
      return null;
    }
    return this.buildPublicUrl(userId, assetId);
  }

  async exists(assetId: string, userId: string): Promise<boolean> {
    const files = await this.findAssetFiles(assetId, userId);
    return files.length > 0;
  }

  async cleanupExpired(
    olderThanMs: number,
    maxItems?: number,
  ): Promise<number> {
    if (!Number.isFinite(olderThanMs) || olderThanMs <= 0) {
      return 0;
    }

    try {
      await this.ensureDirectory();
      const entries = await fs.readdir(this.directory, { withFileTypes: true });
      const files: string[] = [];

      for (const entry of entries) {
        const entryPath = path.join(this.directory, entry.name);
        if (entry.isFile()) {
          files.push(entryPath);
          continue;
        }
        if (!entry.isDirectory()) {
          continue;
        }
        const userFiles = await fs.readdir(entryPath);
        for (const userFile of userFiles) {
          files.push(path.join(entryPath, userFile));
        }
      }

      let deleted = 0;

      for (const file of files) {
        if (maxItems && deleted >= maxItems) {
          break;
        }

        try {
          const stats = await fs.stat(file);
          if (stats.mtimeMs < olderThanMs) {
            await fs.unlink(file);
            deleted += 1;
          }
        } catch {
          // Ignore individual file errors
        }
      }

      return deleted;
    } catch {
      return 0;
    }
  }

  private async findAssetFiles(
    assetId: string,
    userId: string,
  ): Promise<string[]> {
    try {
      const userDirectory = this.resolveUserDirectory(userId);
      const files = await fs.readdir(userDirectory);
      return files.filter((fileName) => {
        if (fileName === assetId) {
          return true;
        }
        return fileName.startsWith(`${assetId}.`);
      });
    } catch {
      return [];
    }
  }

  private async ensureUserDirectory(userId: string): Promise<void> {
    await this.ensureDirectory();
    await fs.mkdir(this.resolveUserDirectory(userId), { recursive: true });
  }

  private resolveUserDirectory(userId: string): string {
    return path.join(this.directory, this.sanitizeUserId(userId));
  }

  private buildPublicUrl(userId: string, assetId: string): string {
    return `${this.publicPath}/${this.sanitizeUserId(userId)}/${assetId}`;
  }

  private sanitizeUserId(userId: string): string {
    const trimmed = userId.trim();
    if (trimmed.length === 0) {
      return "anonymous";
    }
    return trimmed.replace(/[^a-zA-Z0-9._:@-]/g, "_");
  }

  private getExtension(contentType: string): string {
    const map: Record<string, string> = {
      "image/webp": ".webp",
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/gif": ".gif",
    };
    return map[contentType] || ".webp";
  }
}
