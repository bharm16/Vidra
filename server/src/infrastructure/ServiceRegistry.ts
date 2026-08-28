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
import type { UserCreditService } from "@services/credits/UserCreditService";
import type { CreditRefundSweeper } from "@services/credits/CreditRefundSweeper";
import type { CreditReconciliationWorker } from "@services/credits/CreditReconciliationWorker";
import type { PromptOptimizationService } from "@services/prompt-optimization/PromptOptimizationService";
import type { ImageGenerationService } from "@services/image-generation/ImageGenerationService";
import type { VideoGenerationService } from "@services/video-generation/VideoGenerationService";
import type { ContinuitySessionService } from "@services/continuity/ContinuitySessionService";
import type { ModelIntelligenceService } from "@services/model-intelligence/ModelIntelligenceService";
import type { VideoJobWorker } from "@services/video-generation/jobs/VideoJobWorker";
import type { VideoJobSweeper } from "@services/video-generation/jobs/VideoJobSweeper";
import type { DlqReprocessorWorker } from "@services/video-generation/jobs/DlqReprocessorWorker";
import type { VideoJobReconciler } from "@services/video-generation/jobs/VideoJobReconciler";
import type { ProviderCircuitManager } from "@services/video-generation/jobs/ProviderCircuitManager";
import type { VideoWorkerHeartbeatStore } from "@services/video-generation/jobs/VideoWorkerHeartbeatStore";
import type { CapabilitiesProbeService } from "@services/capabilities/CapabilitiesProbeService";
import type { PaymentService } from "@services/payment/PaymentService";
import type { BillingProfileStore } from "@services/payment/BillingProfileStore";
import type { StripeWebhookEventStore } from "@services/payment/StripeWebhookEventStore";
import type { PaymentConsistencyStore } from "@services/payment/PaymentConsistencyStore";
import type { WebhookReconciliationWorker } from "@services/payment/WebhookReconciliationWorker";
import type { BillingProfileRepairWorker } from "@services/payment/BillingProfileRepairWorker";
import type { SessionService } from "@services/sessions/SessionService";
import type { VideoAssetRetentionService } from "@services/video-generation/storage/VideoAssetRetentionService";
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
  continuitySessionService: ContinuitySessionService | null;
  modelIntelligenceService: ModelIntelligenceService | null;
  capabilitiesProbeService: CapabilitiesProbeService | null;

  // Credits / billing
  userCreditService: UserCreditService;
  creditRefundSweeper: CreditRefundSweeper | null;
  creditReconciliationWorker: CreditReconciliationWorker | null;
  paymentService: PaymentService;
  billingProfileStore: BillingProfileStore;
  stripeWebhookEventStore: StripeWebhookEventStore;
  paymentConsistencyStore: PaymentConsistencyStore;

  // Workers (nullable — only started in worker role)
  videoJobWorker: VideoJobWorker | null;
  videoJobSweeper: VideoJobSweeper | null;
  dlqReprocessorWorker: DlqReprocessorWorker | null;
  videoJobReconciler: VideoJobReconciler | null;
  providerCircuitManager: ProviderCircuitManager | null;
  videoWorkerHeartbeatStore: VideoWorkerHeartbeatStore | null;
  videoAssetRetentionService: VideoAssetRetentionService | null;
  webhookReconciliationWorker: WebhookReconciliationWorker | null;
  billingProfileRepairWorker: BillingProfileRepairWorker | null;

  // Session
  sessionService: SessionService;
}
