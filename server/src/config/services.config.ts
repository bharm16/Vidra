/**
 * Service Configuration and Registration
 *
 * This module orchestrates service registration by domain.
 * Service wiring logic lives in `server/src/config/services/*.services.ts`.
 */

import { createContainer, type DIContainer } from "@infrastructure/DIContainer";
import { registerCoreServices } from "./services/core.services.ts";
import { registerObservabilityServices } from "./services/observability.services.ts";
import { registerCacheServices } from "./services/cache.services.ts";
import { registerStorageServices } from "./services/storage.services.ts";
import { registerCreditServices } from "./services/credit.services.ts";
import { registerVideoJobServices } from "./services/video-jobs.services.ts";
import { registerReplayServices } from "./services/replay.services.ts";
import { registerLLMServices } from "./services/llm.services.ts";
import { registerI2VServices } from "./services/i2v.services.ts";
import { registerSpanLabelingServices } from "./services/span-labeling.services.ts";
import { registerEnhancementServices } from "./services/enhancement.services.ts";
import { registerOptimizationServices } from "./services/optimization.services.ts";
import { registerVideoGenerationServices } from "./services/video-generation.services.ts";
import { registerImageGenerationServices } from "./services/image-generation.services.ts";
import { registerContinuityServices } from "./services/continuity.services.ts";
import { registerPaymentServices } from "./services/payment.services.ts";
import { registerModelIntelligenceServices } from "./services/model-intelligence.services.ts";
import { registerSessionServices } from "./services/session.services.ts";
import { getRuntimeFlags } from "./feature-flags.ts";

export type { ServiceConfig } from "./services/service-config.types.ts";

/**
 * Create and configure the dependency injection container.
 *
 * @returns Configured container
 */
export async function configureServices(): Promise<DIContainer> {
  const container = createContainer();
  const { enableConvergence } = getRuntimeFlags();

  // Foundation: logging, metrics, circuit breaker, config
  registerCoreServices(container);
  registerObservabilityServices(container);
  registerCacheServices(container);
  registerStorageServices(container);

  // Domain infrastructure: credits, video jobs
  registerCreditServices(container);
  registerVideoJobServices(container);

  // Business logic: LLM, enhancement, video generation, image generation
  // (observation services are registered by registerCoreServices)
  // Record/replay cassette store — must precede the seams that consume it
  // (aiService in llm.services, image preview provider in image-generation).
  registerReplayServices(container);
  registerLLMServices(container);
  // I2V motion ideas — depends on aiService + imageObservationService
  registerI2VServices(container);
  registerSpanLabelingServices(container);
  registerEnhancementServices(container);
  registerOptimizationServices(container);
  registerVideoGenerationServices(container);
  // Image-generation: depends on imageAssetStore (storage) and geminiClient/openAIClient (llm),
  // both registered above.
  registerImageGenerationServices(container);

  // Continuity (gated on ENABLE_CONVERGENCE).
  if (enableConvergence) {
    registerContinuityServices(container);
  } else {
    // Keep this token resolvable when convergence is disabled.
    container.registerValue("continuitySessionService", null);
  }

  registerPaymentServices(container);
  // Model-intelligence: depends on billingProfileStore (payment) and
  // videoGenerationService (generation) — must follow both.
  registerModelIntelligenceServices(container);
  registerSessionServices(container);

  return container;
}

export { initializeServices } from "./services.initialize";
