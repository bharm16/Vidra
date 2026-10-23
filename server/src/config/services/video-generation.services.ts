import type { DIContainer } from "@infrastructure/DIContainer";
import { logger } from "@infrastructure/Logger";
import type { LegacyCreditRefundService } from "@services/video-generation/refunds/LegacyCreditRefundService";
import { ReplicateVideoProvider } from "@services/video-generation/providers/ReplicateVideoProvider";
import { VeoVideoProvider } from "@services/video-generation/providers/VeoVideoProvider";
import type {
  VideoProvider,
  VideoProviderMap,
} from "@services/video-generation/providers/types";
import {
  createReplicateVideoClient,
  resolveVeoCredential,
} from "@clients/videoProviderClients";
import { VideoGenerationService } from "@services/video-generation/VideoGenerationService";
import { VideoJobStore } from "@services/video-generation/runtime/VideoJobStore";
import { VideoWorkerHeartbeatStore } from "@services/video-generation/runtime/VideoWorkerHeartbeatStore";
import { VideoJobHandler } from "@services/video-generation/runtime/VideoJobHandler";
import type { SessionService } from "@services/sessions/SessionService";
import { VideoJobWorker } from "@services/video-generation/runtime/VideoJobWorker";
import { resumePendingAttachments } from "@services/video-generation/runtime/resumePendingAttachments";
import type { VideoAssetStore } from "@services/video-generation/storage";
import type { StorageService } from "@services/storage/StorageService";
import { setTimeoutPolicyConfig } from "@services/video-generation/providers/timeoutPolicy";
import type { FirestoreCircuitExecutor } from "@services/firestore/FirestoreCircuitExecutor";
import type { ServiceConfig } from "./service-config.types.ts";
import { getFirestore } from "@infrastructure/firebaseAdmin";
import { LegacyVideoSpendGuard, LegacyVideoSpendRefusedError } from "@services/video-generation/runtime/LegacyVideoSpendGuard";
import type { StudioWorkflowSpendGuard } from "@services/creation-requests/execution/StudioWorkflowSpendGuard";
import { WorkflowPreflightError } from "@services/creation-requests/execution/types";
import { workflowRuntimeProfiles } from "@services/creation-requests/preparation/WorkflowCapabilityCatalog";

/**
 * Every video provider registration that feeds VideoGenerationService.
 *
 * Mirrors IMAGE_PREVIEW_PROVIDER_TOKENS: a provider missing from this list
 * never reaches the service, and the map assembled below is keyed by
 * VideoProviderId so the compiler requires one entry per provider.
 */
export const VIDEO_PROVIDER_TOKENS = [
  "replicateVideoProvider",
  "veoVideoProvider",
] as const;

export function registerVideoGenerationServices(container: DIContainer): void {
  container.register("legacyVideoSpendGuard", (authority: StudioWorkflowSpendGuard) => new LegacyVideoSpendGuard(getFirestore(), {
    reserve: async (transaction, input) => {
      try { return await authority.reserveProviderSpendInTransaction(transaction, input); }
      catch (error) { if (error instanceof WorkflowPreflightError) throw new LegacyVideoSpendRefusedError(error.message); throw error; }
    },
  }, workflowRuntimeProfiles()), ["workflowSpendGuard"]);
  container.register(
    "replicateVideoProvider",
    (config: ServiceConfig) =>
      new ReplicateVideoProvider({
        replicate: createReplicateVideoClient(
          config.videoProviders.credentials.replicateApiToken,
          logger,
        ),
      }),
    ["config"],
  );

  container.register(
    "veoVideoProvider",
    (config: ServiceConfig) =>
      new VeoVideoProvider({
        apiKey: resolveVeoCredential(
          config.videoProviders.credentials.geminiApiKey,
          logger,
        ),
        ...(config.videoProviders.credentials.geminiBaseUrl
          ? { baseUrl: config.videoProviders.credentials.geminiBaseUrl }
          : {}),
      }),
    ["config"],
  );

  container.register(
    "videoGenerationService",
    (
      replicate: VideoProvider,
      veo: VideoProvider,
      videoAssetStore: VideoAssetStore,
      config: ServiceConfig,
    ) => {
      setTimeoutPolicyConfig({
        pollTimeoutMs: config.videoProviders.pollTimeoutMs,
        workflowTimeoutMs: config.videoProviders.workflowTimeoutMs,
      });

      const providers: VideoProviderMap = {
        replicate,
        gemini: veo,
      };

      // Asked of the providers rather than re-reading the five credential
      // fields, which used to be a fourth restatement of the same fact.
      if (
        !Object.values(providers).some((provider) => provider.isAvailable())
      ) {
        logger.warn(
          "No supported video generation credentials provided (REPLICATE_API_TOKEN or GEMINI_API_KEY)",
        );
        return null;
      }

      return new VideoGenerationService({
        providers,
        assetStore: videoAssetStore,
      });
    },
    [...VIDEO_PROVIDER_TOKENS, "videoAssetStore", "config"],
  );

  container.register(
    "videoWorkerHeartbeatStore",
    (firestoreCircuitExecutor: FirestoreCircuitExecutor) =>
      new VideoWorkerHeartbeatStore(firestoreCircuitExecutor),
    ["firestoreCircuitExecutor"],
  );

  container.register(
    "videoJobHandler",
    (
      videoJobStore: VideoJobStore,
      videoGenerationService: VideoGenerationService | null,
      creditService: LegacyCreditRefundService,
      storageService: StorageService,
      sessionService: SessionService,
      providerSpendGuard: LegacyVideoSpendGuard,
    ) => {
      if (!videoGenerationService) {
        return null;
      }
      return new VideoJobHandler(
        videoJobStore,
        videoGenerationService,
        creditService,
        storageService,
        {
          providerSpendGuard,
          // SessionService structurally satisfies JobSessionAppendPort; the
          // worker pipeline calls appendGenerationToVersion on successful
          // job completion so video generations are durable server-side.
          sessionService,
        },
      );
    },
    [
      "videoJobStore",
      "videoGenerationService",
      "legacyCreditRefunder",
      "storageService",
      "sessionService",
      "legacyVideoSpendGuard",
    ],
  );

  // Completed media can owe an attachment even when no generation provider is configured.
  container.register(
    "resumePendingVideoAttachments",
    (jobStore: VideoJobStore, sessionService: SessionService) =>
      async (): Promise<void> => {
        await resumePendingAttachments({ jobStore, sessionService });
      },
    ["videoJobStore", "sessionService"],
  );

  container.register(
    "videoJobWorker",
    (
      videoJobStore: VideoJobStore,
      videoJobHandler: VideoJobHandler | null,
      videoWorkerHeartbeatStore: VideoWorkerHeartbeatStore,
      config: ServiceConfig,
    ) => {
      if (!videoJobHandler) {
        return null;
      }

      const wc = config.videoJobs.worker;
      return new VideoJobWorker(videoJobStore, videoJobHandler, {
        pollIntervalMs: wc.pollIntervalMs,
        leaseMs: wc.leaseSeconds * 1000,
        maxConcurrent: wc.maxConcurrent,
        heartbeatIntervalMs: wc.heartbeatIntervalMs,
        processRole: "worker",
        ...(config.videoJobs.hostname
          ? { hostname: config.videoJobs.hostname }
          : {}),
        workerHeartbeatStore: videoWorkerHeartbeatStore,
      });
    },
    [
      "videoJobStore",
      "videoJobHandler",
      "videoWorkerHeartbeatStore",
      "config",
    ],
  );
}
