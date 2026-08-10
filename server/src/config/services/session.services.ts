import type { DIContainer } from "@infrastructure/DIContainer";
import { logger } from "@infrastructure/Logger";
import type { Bucket } from "@google-cloud/storage";
import AssetService from "@services/asset/AssetService";
import { FirestoreAssetStore } from "@services/asset/storage/FirestoreAssetStore";
import AssetResolverService from "@services/asset/AssetResolverService";
import { ReferenceImageProcessingService } from "@services/asset/ReferenceImageProcessingService";
import type { FaceEmbeddingService } from "@services/asset/FaceEmbeddingService";
import { FirestoreReferenceImageStore } from "@services/asset/reference-images/storage/FirestoreReferenceImageStore";
import { SessionService } from "@services/sessions/SessionService";
import { SessionStore } from "@services/sessions/SessionStore";
import type { VideoJobStore } from "@services/video-generation/jobs/VideoJobStore";
import type { SignedUrlLedger } from "@services/storage/services/SignedUrlLedger";
import type { ServiceConfig } from "./service-config.types.ts";

/**
 * Registers session, asset, and reference-image repositories.
 *
 * Stripe / billing registrations were split into `payment.services.ts` so
 * the file name reflects what's inside.
 */
export function registerSessionServices(container: DIContainer): void {
  container.register("sessionStore", () => new SessionStore(), []);

  container.register(
    "sessionService",
    (sessionStore: SessionStore, videoJobStore: VideoJobStore) =>
      new SessionService(sessionStore, {
        cancelJobsForSession: (sessionId) =>
          videoJobStore.cancelJobsForSession(sessionId),
      }),
    ["sessionStore", "videoJobStore"],
  );

  container.register(
    "assetService",
    (
      gcsBucket: Bucket,
      gcsBucketName: string,
      faceEmbeddingService: FaceEmbeddingService | null,
      config: ServiceConfig,
    ) => {
      try {
        const repository = new FirestoreAssetStore({
          bucket: gcsBucket,
          bucketName: gcsBucketName,
        });
        const resolver = new AssetResolverService(repository);
        const referenceImages = new ReferenceImageProcessingService();
        const embeddingService = config.features.faceEmbedding
          ? faceEmbeddingService
          : null;
        return new AssetService(
          repository,
          referenceImages,
          resolver,
          undefined,
          embeddingService,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.warn("Asset service disabled", { error: errorMessage });
        return null;
      }
    },
    ["gcsBucket", "gcsBucketName", "faceEmbeddingService", "config"],
  );

  container.register(
    "referenceImageRepository",
    (
      gcsBucket: Bucket,
      gcsBucketName: string,
      signedUrlLedger: SignedUrlLedger | null,
    ) => {
      try {
        return new FirestoreReferenceImageStore({
          bucket: gcsBucket,
          bucketName: gcsBucketName,
          signedUrlLedger,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.warn("Reference image service disabled", {
          error: errorMessage,
        });
        return null;
      }
    },
    ["gcsBucket", "gcsBucketName", "signedUrlLedger"],
  );
}
