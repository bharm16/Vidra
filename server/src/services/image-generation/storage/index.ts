/**
 * Image Asset Storage
 */

import type { Bucket } from "@google-cloud/storage";
import { SIGNED_URL_TTL_MS } from "@config/signedUrlPolicy";
import { GcsImageAssetStore } from "./GcsImageAssetStore";
import type { ImageAssetStore } from "./types";

const DEFAULT_BASE_PATH = "image-previews";
const DEFAULT_CACHE_CONTROL = "public, max-age=86400";

interface CreateImageAssetStoreOptions {
  bucket: Bucket;
  basePath?: string;
  signedUrlTtlMs?: number;
  cacheControl?: string;
  ledger?: { record(objectPath: string, signedUrl: string): void } | null;
}

/**
 * Create an image asset store using the injected bucket.
 */
export function createImageAssetStore(
  options: CreateImageAssetStoreOptions,
): ImageAssetStore {
  return new GcsImageAssetStore({
    bucket: options.bucket,
    basePath: options.basePath || DEFAULT_BASE_PATH,
    signedUrlTtlMs: options.signedUrlTtlMs ?? SIGNED_URL_TTL_MS.view,
    cacheControl: options.cacheControl || DEFAULT_CACHE_CONTROL,
    ledger: options.ledger ?? null,
  });
}

export type { ImageAssetStore, StoredImageAsset } from "./types";
