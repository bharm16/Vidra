/**
 * Image Asset Storage
 */

import type { Bucket } from "@google-cloud/storage";
import { SIGNED_URL_TTL_MS } from "@config/signedUrlPolicy";
import type { SignedUrlMinter } from "@infrastructure/signedUrl/SignedUrlMinter";
import { GcsImageAssetStore } from "./GcsImageAssetStore";
import type { ImageAssetStore } from "./types";

const DEFAULT_BASE_PATH = "image-previews";
const DEFAULT_CACHE_CONTROL = "public, max-age=86400";

interface CreateImageAssetStoreOptions {
  bucket: Bucket;
  minter: SignedUrlMinter;
  basePath?: string;
  signedUrlTtlMs?: number;
  cacheControl?: string;
}

/**
 * Create an image asset store using the injected bucket.
 */
export function createImageAssetStore(
  options: CreateImageAssetStoreOptions,
): ImageAssetStore {
  return new GcsImageAssetStore({
    bucket: options.bucket,
    minter: options.minter,
    basePath: options.basePath || DEFAULT_BASE_PATH,
    signedUrlTtlMs: options.signedUrlTtlMs ?? SIGNED_URL_TTL_MS.view,
    cacheControl: options.cacheControl || DEFAULT_CACHE_CONTROL,
  });
}

export type { ImageAssetStore, StoredImageAsset } from "./types";
