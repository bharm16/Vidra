import type { Bucket } from "@google-cloud/storage";
import type { DIContainer } from "@infrastructure/DIContainer";
import { logger } from "@infrastructure/Logger";
import AssetService from "@services/asset/AssetService";
import { CapabilitiesProbeService } from "@services/capabilities/CapabilitiesProbeService";
import type { UserCreditService } from "@services/credits/UserCreditService";
import ConsistentVideoService from "@services/video-generation/ConsistentVideoService";
import FaceSwapService from "@services/video-generation/FaceSwapService";
import KeyframeGenerationService from "@services/video-generation/KeyframeGenerationService";
import { FalFaceSwapProvider } from "@services/video-generation/providers/FalFaceSwapProvider";
import { ReplicateVideoProvider } from "@services/video-generation/providers/ReplicateVideoProvider";
import { SoraVideoProvider } from "@services/video-generation/providers/SoraVideoProvider";
import { LumaVideoProvider } from "@services/video-generation/providers/LumaVideoProvider";
import { KlingVideoProvider } from "@services/video-generation/providers/KlingVideoProvider";
import { VeoVideoProvider } from "@services/video-generation/providers/VeoVideoProvider";
import {
  VIDEO_PROVIDER_IDS,
  type VideoProvider,
  type VideoProviderMap,
} from "@services/video-generation/providers/types";
import {
  createLumaVideoClient,
  createReplicateVideoClient,
  createSoraVideoClient,
  resolveKlingCredential,
  resolveVeoCredential,
} from "@clients/videoProviderClients";
import { VideoGenerationService } from "@services/video-generation/VideoGenerationService";
import { VideoJobStore } from "@services/video-generation/jobs/VideoJobStore";
import { VideoWorkerHeartbeatStore } from "@services/video-generation/jobs/VideoWorkerHeartbeatStore";
import { VideoJobHandler } from "@services/video-generation/jobs/VideoJobHandler";
import type { SessionService } from "@services/sessions/SessionService";
import { VideoJobWorker } from "@services/video-generation/jobs/VideoJobWorker";
import { createVideoJobSweeper } from "@services/video-generation/jobs/VideoJobSweeper";
import { createVideoJobReconciler } from "@services/video-generation/jobs/VideoJobReconciler";
import { ProviderCircuitManager } from "@services/video-generation/jobs/ProviderCircuitManager";
import { DlqReprocessorWorker } from "@services/video-generation/jobs/DlqReprocessorWorker";
import type { VideoAssetStore } from "@services/video-generation/storage";
import type { StorageService } from "@services/storage/StorageService";
import { setTimeoutPolicyConfig } from "@services/video-generation/providers/timeoutPolicy";
import type { FirestoreCircuitExecutor } from "@services/firestore/FirestoreCircuitExecutor";
import type { ServiceConfig } from "./service-config.types.ts";

/**
 * Every video provider registration that feeds VideoGenerationService.
 *
 * Mirrors IMAGE_PREVIEW_PROVIDER_TOKENS: a provider missing from this list
 * never reaches the service, and the map assembled below is keyed by
 * VideoProviderId so the compiler requires one entry per provider.
 */
export const VIDEO_PROVIDER_TOKENS = [
  "replicateVideoProvider",
  "soraVideoProvider",
  "lumaVideoProvider",
  "klingVideoProvider",
  "veoVideoProvider",
] as const;

export function registerVideoGenerationServices(container: DIContainer): void {
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
    "soraVideoProvider",
    (config: ServiceConfig) =>
      new SoraVideoProvider({
        openai: createSoraVideoClient(
          config.videoProviders.credentials.openAIKey,
          logger,
        ),
      }),
    ["config"],
  );

  container.register(
    "lumaVideoProvider",
    (config: ServiceConfig) =>
      new LumaVideoProvider({
        luma: createLumaVideoClient(
          config.videoProviders.credentials.lumaApiKey,
          logger,
        ),
      }),
    ["config"],
  );

  container.register(
    "klingVideoProvider",
    (config: ServiceConfig) =>
      new KlingVideoProvider({
        apiKey: resolveKlingCredential(
          config.videoProviders.credentials.klingApiKey,
          logger,
        ),
        ...(config.videoProviders.credentials.klingBaseUrl
          ? { baseUrl: config.videoProviders.credentials.klingBaseUrl }
          : {}),
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
      sora: VideoProvider,
      luma: VideoProvider,
      kling: VideoProvider,
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
        openai: sora,
        luma,
        kling,
        gemini: veo,
      };

      // Asked of the providers rather than re-reading the five credential
      // fields, which used to be a fourth restatement of the same fact.
      if (
        !Object.values(providers).some((provider) => provider.isAvailable())
      ) {
        logger.warn(
          "No video generation credentials provided (REPLICATE_API_TOKEN, OPENAI_API_KEY, LUMA_API_KEY or LUMAAI_API_KEY, KLING_API_KEY, or GEMINI_API_KEY)",
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
    "keyframeGenerationService",
    (config: ServiceConfig) => {
      const falKey = config.fal.apiKey;
      if (!falKey) {
        logger.warn(
          "KeyframeGenerationService: FAL_KEY/FAL_API_KEY not set, service will be unavailable",
        );
        return null;
      }
      const replicateToken = config.replicate.apiToken;
      return new KeyframeGenerationService({
        falApiKey: falKey,
        ...(replicateToken ? { apiToken: replicateToken } : {}),
        enableFaceEmbedding: config.features.faceEmbedding,
      });
    },
    ["config"],
  );

  container.register(
    "faceSwapService",
    (config: ServiceConfig) => {
      const falKey = config.fal.apiKey;
      if (!falKey) {
        logger.warn(
          "FaceSwapService: FAL_KEY/FAL_API_KEY not set, service will be unavailable",
        );
        return null;
      }
      const faceSwapProvider = new FalFaceSwapProvider({ apiKey: falKey });
      if (!faceSwapProvider.isAvailable()) {
        logger.warn("FaceSwapService: Fal face swap provider unavailable");
        return null;
      }
      return new FaceSwapService({ faceSwapProvider });
    },
    ["config"],
  );

  container.register(
    "consistentVideoService",
    (
      videoGenerationService: VideoGenerationService | null,
      assetService: AssetService | null,
      keyframeGenerationService: KeyframeGenerationService | null,
    ) => {
      if (
        !videoGenerationService ||
        !assetService ||
        !keyframeGenerationService
      ) {
        logger.warn("Consistent video service disabled", {
          videoGenerationServiceAvailable: Boolean(videoGenerationService),
          assetServiceAvailable: Boolean(assetService),
          keyframeGenerationServiceAvailable: Boolean(
            keyframeGenerationService,
          ),
        });
        return null;
      }

      return new ConsistentVideoService({
        videoGenerationService,
        assetService,
        keyframeService: keyframeGenerationService,
      });
    },
    ["videoGenerationService", "assetService", "keyframeGenerationService"],
  );

  container.register(
    "capabilitiesProbeService",
    (config: ServiceConfig) =>
      new CapabilitiesProbeService(config.capabilities),
    ["config"],
  );

  container.register(
    "providerCircuitManager",
    (config: ServiceConfig) => {
      const pc = config.videoJobs.providerCircuit;
      return new ProviderCircuitManager({
        failureRateThreshold: pc.failureRateThreshold,
        minVolume: pc.minVolume,
        cooldownMs: pc.cooldownMs,
        maxSamples: pc.maxSamples,
      });
    },
    ["config"],
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
      creditService: UserCreditService,
      storageService: StorageService,
      providerCircuitManager: ProviderCircuitManager,
      sessionService: SessionService,
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
          providerCircuitManager,
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
      "userCreditService",
      "storageService",
      "providerCircuitManager",
      "sessionService",
    ],
  );

  container.register(
    "videoJobWorker",
    (
      videoJobStore: VideoJobStore,
      videoJobHandler: VideoJobHandler | null,
      providerCircuitManager: ProviderCircuitManager,
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
        providerCircuitManager,
        workerHeartbeatStore: videoWorkerHeartbeatStore,
        ...(wc.perProviderMaxConcurrent !== undefined
          ? { perProviderMaxConcurrent: wc.perProviderMaxConcurrent }
          : {}),
        providerIds: [...VIDEO_PROVIDER_IDS],
      });
    },
    [
      "videoJobStore",
      "videoJobHandler",
      "providerCircuitManager",
      "videoWorkerHeartbeatStore",
      "config",
    ],
  );

  container.register(
    "videoJobSweeper",
    (
      videoJobStore: VideoJobStore,
      creditService: UserCreditService,
      config: ServiceConfig,
    ) =>
      createVideoJobSweeper(
        videoJobStore,
        creditService,
        undefined,
        config.videoJobs.sweeper,
      ),
    ["videoJobStore", "userCreditService", "config"],
  );

  container.register(
    "dlqReprocessorWorker",
    (
      videoJobStore: VideoJobStore,
      providerCircuitManager: ProviderCircuitManager,
      config: ServiceConfig,
    ) => {
      const dlq = config.videoJobs.dlqReprocessor;
      if (dlq.disabled) {
        return null;
      }

      return new DlqReprocessorWorker(videoJobStore, {
        pollIntervalMs: dlq.pollIntervalMs,
        maxEntriesPerRun: dlq.maxEntriesPerRun,
        providerCircuitManager,
      });
    },
    ["videoJobStore", "providerCircuitManager", "config"],
  );

  container.register(
    "videoJobReconciler",
    (gcsBucket: Bucket, videoJobStore: VideoJobStore, config: ServiceConfig) =>
      createVideoJobReconciler(
        gcsBucket,
        config.videoAssets.storage.basePath,
        videoJobStore,
        undefined,
        config.videoAssets.reconciler,
      ),
    ["gcsBucket", "videoJobStore", "config"],
  );
}
