/**
 * Typed Service Registry
 *
 * Maps service names to their resolved types. Adding an entry here
 * gives compile-time safety when calling `container.resolve('name')`.
 *
 * Migration strategy: services are added incrementally. Untyped
 * `container.resolve<T>(name)` still works for names not in this map.
 *
 * When adding a new service:
 * 1. Add the entry below.
 * 2. Run `tsc --noEmit` — if any call site breaks, the service type
 *    doesn't match what a consumer expects. Fix the consumer type or
 *    leave the service out of the registry until the mismatch is resolved.
 */

import type { LLMClient } from "@clients/LLMClient";
import type { AIModelService } from "@services/ai-model/AIModelService";
import type { SpanLabelingCacheService } from "@services/cache/SpanLabelingCacheService";
import type { FirestoreCircuitExecutor } from "@services/firestore/FirestoreCircuitExecutor";
import type { LegacyCreditRefundService } from "@services/video-generation/refunds/LegacyCreditRefundService";
import type { CreditRefundSweeper } from "@services/video-generation/refunds/CreditRefundSweeper";
import type { PromptOptimizationService } from "@services/prompt-optimization/PromptOptimizationService";
import type { ImageGenerationService } from "@services/image-generation/ImageGenerationService";
import type { VideoGenerationService } from "@services/video-generation/VideoGenerationService";
import type { VideoJobWorker } from "@services/video-generation/runtime/VideoJobWorker";
import type { ProviderCircuitManager } from "@services/video-generation/runtime/ProviderCircuitManager";
import type { VideoWorkerHeartbeatStore } from "@services/video-generation/runtime/VideoWorkerHeartbeatStore";
import type { CapabilitiesProbeService } from "@services/capabilities/CapabilitiesProbeService";
import type { SessionService } from "@services/sessions/SessionService";
import type { VideoAssetRetentionService } from "@services/video-generation/storage/VideoAssetRetentionService";
import type { ImageAssetStore } from "@services/image-generation/storage";
import type { SketchBudgetService } from "@services/sketch-budget/SketchBudgetService";
import type { ServiceConfig } from "@config/services/service-config.types";
import type { Bucket } from "@google-cloud/storage";

/**
 * Core service registry mapping names to resolved types.
 *
 * Services omitted from this map (e.g. metricsService, cacheService,
 * enhancementService, sceneDetectionService, promptCoherenceService,
 * storageService) have structural type mismatches at existing call
 * sites and should be added once those route factory types are aligned.
 */
export interface ServiceRegistry {
  // Infrastructure
  config: ServiceConfig;
  firestoreCircuitExecutor: FirestoreCircuitExecutor;
  gcsBucket: Bucket;

  // LLM clients (nullable — credentials may be absent)
  openAIClient: LLMClient | null;
  groqClient: LLMClient | null;
  qwenClient: LLMClient | null;
  geminiClient: LLMClient | null;
  aiService: AIModelService;
  spanLabelingCacheService: SpanLabelingCacheService;

  // Prompt
  promptOptimizationService: PromptOptimizationService;

  // Generation (nullable — resolves to null when provider creds are absent)
  imageGenerationService: ImageGenerationService | null;
  videoGenerationService: VideoGenerationService | null;
  capabilitiesProbeService: CapabilitiesProbeService | null;

  // Credits / billing
  legacyCreditRefunder: LegacyCreditRefundService;
  creditRefundSweeper: CreditRefundSweeper | null;

  // Workers (nullable — only started in worker role)
  videoJobWorker: VideoJobWorker | null;
  providerCircuitManager: ProviderCircuitManager | null;
  videoWorkerHeartbeatStore: VideoWorkerHeartbeatStore | null;
  videoAssetRetentionService: VideoAssetRetentionService | null;

  // Storage
  //
  // The creator-owned image asset store. Typed here because the preview routes
  // became its first consumer outside the image-generation domain (ADR-0022:
  // it is where an admitted picture's bytes become durable), and an untyped
  // resolve would infer whatever the call site asked for.
  imageAssetStore: ImageAssetStore;

  // Session
  sessionService: SessionService;

  // Sketch relay admission budget (issue #84)
  sketchBudgetService: SketchBudgetService;
}
