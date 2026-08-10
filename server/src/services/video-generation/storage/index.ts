import type { Bucket } from "@google-cloud/storage";
import { SIGNED_URL_TTL_MS } from "@config/signedUrlPolicy";
import type { SignedUrlMinter } from "@infrastructure/signedUrl/SignedUrlMinter";
import { GcsVideoAssetStore } from "./GcsVideoAssetStore";
import type { VideoAssetStore } from "./types";

const DEFAULT_BASE_PATH = "video-previews";
const DEFAULT_CACHE_CONTROL = "public, max-age=86400";

interface CreateVideoAssetStoreOptions {
  bucket: Bucket;
  minter: SignedUrlMinter;
  basePath?: string;
  signedUrlTtlMs?: number;
  cacheControl?: string;
}

export function createVideoAssetStore(
  options: CreateVideoAssetStoreOptions,
): VideoAssetStore {
  return new GcsVideoAssetStore({
    bucket: options.bucket,
    minter: options.minter,
    basePath: options.basePath || DEFAULT_BASE_PATH,
    signedUrlTtlMs: options.signedUrlTtlMs ?? SIGNED_URL_TTL_MS.view,
    cacheControl: options.cacheControl || DEFAULT_CACHE_CONTROL,
  });
}

export type {
  VideoAssetStore,
  StoredVideoAsset,
  VideoAssetStream,
} from "./types";
