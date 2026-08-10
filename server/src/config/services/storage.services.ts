import type { DIContainer } from "@infrastructure/DIContainer";
import { Storage, type Bucket } from "@google-cloud/storage";
import { STORAGE_CONFIG } from "@services/storage/config/storageConfig";
import { StorageService } from "@services/storage/StorageService";
import {
  SignedUrlLedger,
  type SignedUrlLedgerCache,
} from "@infrastructure/signedUrl/SignedUrlLedger";
import { SignedUrlMinter } from "@infrastructure/signedUrl/SignedUrlMinter";
import { createImageAssetStore } from "@services/image-generation/storage";
import { createVideoContentAccessService } from "@services/video-generation/access/VideoContentAccessService";
import {
  createVideoAssetStore,
  type VideoAssetStore,
} from "@services/video-generation/storage";
import { createVideoAssetRetentionService } from "@services/video-generation/storage/VideoAssetRetentionService";
import { createGCSStorageService } from "@services/convergence/storage";
import type { ServiceConfig } from "./service-config.types.ts";

export function registerStorageServices(container: DIContainer): void {
  container.register("gcsStorage", () => new Storage(), []);
  container.registerValue("gcsBucketName", STORAGE_CONFIG.bucketName);
  container.register(
    "gcsBucket",
    (gcsStorage: Storage, gcsBucketName: string) =>
      gcsStorage.bucket(gcsBucketName),
    ["gcsStorage", "gcsBucketName"],
  );

  // Ledger of every signed URL we mint — the media proxy's bucket rescue
  // honors only grants recorded here (see mediaProxy.routes.ts).
  container.register(
    "signedUrlLedger",
    (cacheService: SignedUrlLedgerCache) => new SignedUrlLedger(cacheService),
    ["cacheService"],
  );

  // The one signer in the process. Every store takes this rather than the
  // ledger, so recording a grant is not something a mint site can forget.
  container.register(
    "signedUrlMinter",
    (gcsBucket: Bucket, signedUrlLedger: SignedUrlLedger) =>
      new SignedUrlMinter(gcsBucket, signedUrlLedger),
    ["gcsBucket", "signedUrlLedger"],
  );

  container.register(
    "storageService",
    (
      gcsStorage: Storage,
      gcsBucketName: string,
      signedUrlLedger: SignedUrlLedger,
    ) =>
      new StorageService({
        storage: gcsStorage,
        bucketName: gcsBucketName,
        signedUrlLedger,
      }),
    ["gcsStorage", "gcsBucketName", "signedUrlLedger"],
  );

  container.register(
    "videoAssetStore",
    (
      gcsBucket: Bucket,
      config: ServiceConfig,
      signedUrlMinter: SignedUrlMinter,
    ) =>
      createVideoAssetStore({
        bucket: gcsBucket,
        minter: signedUrlMinter,
        basePath: config.videoAssets.storage.basePath,
        signedUrlTtlMs: config.videoAssets.storage.signedUrlTtlMs,
        cacheControl: config.videoAssets.storage.cacheControl,
      }),
    ["gcsBucket", "config", "signedUrlMinter"],
  );
  container.register(
    "imageAssetStore",
    (
      gcsBucket: Bucket,
      config: ServiceConfig,
      signedUrlMinter: SignedUrlMinter,
    ) =>
      createImageAssetStore({
        bucket: gcsBucket,
        minter: signedUrlMinter,
        basePath: config.imageAssets.storage.basePath,
        signedUrlTtlMs: config.imageAssets.storage.signedUrlTtlMs,
        cacheControl: config.imageAssets.storage.cacheControl,
      }),
    ["gcsBucket", "config", "signedUrlMinter"],
  );
  container.register(
    "convergenceStorageService",
    (
      gcsBucket: Bucket,
      config: ServiceConfig,
      signedUrlMinter: SignedUrlMinter,
    ) =>
      createGCSStorageService(
        gcsBucket,
        signedUrlMinter,
        config.convergence.storage.signedUrlTtlSeconds * 1000,
      ),
    ["gcsBucket", "config", "signedUrlMinter"],
  );

  container.register(
    "videoAssetRetentionService",
    (videoAssetStore: VideoAssetStore, config: ServiceConfig) =>
      createVideoAssetRetentionService(
        videoAssetStore,
        config.videoAssets.retention,
      ),
    ["videoAssetStore", "config"],
  );

  container.register(
    "videoContentAccessService",
    (config: ServiceConfig) =>
      createVideoContentAccessService(config.videoAssets.access),
    ["config"],
  );
}
