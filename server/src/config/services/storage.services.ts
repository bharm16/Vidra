import type { DIContainer } from "@infrastructure/DIContainer";
import { Storage, type Bucket } from "@google-cloud/storage";
import { resolveBucketName } from "@config/storageBucket";
import { StorageService } from "@services/storage/StorageService";
import {
  SignedUrlLedger,
  type SignedUrlLedgerCache,
} from "@services/storage/services/SignedUrlLedger";
import { createImageAssetStore } from "@services/image-generation/storage";
import { createVideoContentAccessService } from "@services/video-generation/access/VideoContentAccessService";
import {
  createVideoAssetStore,
  type VideoAssetStore,
} from "@services/video-generation/storage";
import { createVideoAssetRetentionService } from "@services/video-generation/storage/VideoAssetRetentionService";
import {
  createGCSStorageService,
  setConvergenceStorageSignedUrlTtl,
} from "@services/convergence/storage";
import type { ServiceConfig } from "./service-config.types.ts";

export function registerStorageServices(container: DIContainer): void {
  container.register("gcsStorage", () => new Storage(), []);
  container.registerValue("gcsBucketName", resolveBucketName());
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
      signedUrlLedger: SignedUrlLedger,
    ) =>
      createVideoAssetStore({
        bucket: gcsBucket,
        basePath: config.videoAssets.storage.basePath,
        signedUrlTtlMs: config.videoAssets.storage.signedUrlTtlMs,
        cacheControl: config.videoAssets.storage.cacheControl,
        ledger: signedUrlLedger,
      }),
    ["gcsBucket", "config", "signedUrlLedger"],
  );
  container.register(
    "imageAssetStore",
    (
      gcsBucket: Bucket,
      config: ServiceConfig,
      signedUrlLedger: SignedUrlLedger,
    ) =>
      createImageAssetStore({
        bucket: gcsBucket,
        basePath: config.imageAssets.storage.basePath,
        signedUrlTtlMs: config.imageAssets.storage.signedUrlTtlMs,
        cacheControl: config.imageAssets.storage.cacheControl,
        ledger: signedUrlLedger,
      }),
    ["gcsBucket", "config", "signedUrlLedger"],
  );
  container.register(
    "convergenceStorageService",
    (
      gcsBucket: Bucket,
      config: ServiceConfig,
      signedUrlLedger: SignedUrlLedger,
    ) => {
      setConvergenceStorageSignedUrlTtl(
        config.convergence.storage.signedUrlTtlSeconds,
      );
      return createGCSStorageService(gcsBucket, signedUrlLedger);
    },
    ["gcsBucket", "config", "signedUrlLedger"],
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
