import type { Bucket } from "@google-cloud/storage";
import { SIGNED_URL_TTL_MS } from "@config/signedUrlPolicy";
import { GcsVideoAssetStore } from "./GcsVideoAssetStore";
import type { VideoAssetStore } from "./types";

const DEFAULT_BASE_PATH = "video-previews";
const DEFAULT_CACHE_CONTROL = "public, max-age=86400";

interface CreateVideoAssetStoreOptions {
  bucket: Bucket;
  basePath?: string;
  signedUrlTtlMs?: number;
  cacheControl?: string;
  ledger?: { record(objectPath: string, signedUrl: string): void } | null;
}

export function createVideoAssetStore(
  options: CreateVideoAssetStoreOptions,
): VideoAssetStore {
  return new GcsVideoAssetStore({
    bucket: options.bucket,
    basePath: options.basePath || DEFAULT_BASE_PATH,
    signedUrlTtlMs: options.signedUrlTtlMs ?? SIGNED_URL_TTL_MS.view,
    cacheControl: options.cacheControl || DEFAULT_CACHE_CONTROL,
    ledger: options.ledger ?? null,
  });
}

export type {
  VideoAssetStore,
  StoredVideoAsset,
  VideoAssetStream,
} from "./types";
