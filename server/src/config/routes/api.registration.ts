/**
 * Core API Route Registration
 *
 * Registers the main /api routes, LLM endpoints, role classification,
 * and suggestions evaluation. All routes require auth.
 */

import type { Application } from "express";
import type { Bucket } from "@google-cloud/storage";
import type { DIContainer } from "@infrastructure/DIContainer";
import { apiAuthMiddleware } from "@middleware/apiAuth";
import { createBatchMiddleware } from "@middleware/requestBatching";
import { createRouteTimeout } from "@middleware/routeTimeout";
import { createAPIRoutes } from "@routes/api.routes";
import { createRoleClassifyRoute } from "@routes/roleClassifyRoute";
import { createLabelSpansRoute } from "@routes/labelSpansRoute";
import { createSuggestionsRoute } from "@routes/suggestions";
import { createMediaProxyRoutes } from "@routes/storage/mediaProxy.routes";
import {
  createShareRouter,
  createPublicClipRouter,
} from "@routes/share.routes";
import type { ShareService } from "@services/share/ShareService";
import type { StorageRoutesService } from "@routes/storage.routes";
import type { LLMJudgeService } from "@services/quality-feedback/services/LLMJudgeService";
import type { ContinuitySessionService } from "@services/continuity/ContinuitySessionService";
import type { ModelIntelligenceService } from "@services/model-intelligence/ModelIntelligenceService";
import type { ConsistentVideoService } from "@services/video-generation/ConsistentVideoService";
import type { UserCreditService } from "@services/credits/UserCreditService";
import type { OptimizeTelemetryService } from "@services/observability/OptimizeTelemetryService";
import type { SuggestionsTelemetryService } from "@services/observability/SuggestionsTelemetryService";
import type { SpanLabelingTelemetryService } from "@services/observability/SpanLabelingTelemetryService";
import { STORAGE_CONFIG } from "@services/storage/config/storageConfig";
import { resolveOptionalService } from "./resolve-utils.ts";

export function registerApiRoutes(
  app: Application,
  container: DIContainer,
): void {
  const userCreditService = container.resolve("userCreditService");

  const videoGenerationService = resolveOptionalService<unknown>(
    container,
    "videoGenerationService",
    "preview",
  );

  const continuitySessionService =
    resolveOptionalService<ContinuitySessionService | null>(
      container,
      "continuitySessionService",
      "continuity",
    );
  const modelIntelligenceService =
    resolveOptionalService<ModelIntelligenceService | null>(
      container,
      "modelIntelligenceService",
      "model-intelligence",
    );
  const consistentVideoService: ConsistentVideoService | null =
    !videoGenerationService
      ? null
      : resolveOptionalService<ConsistentVideoService | null>(
          container,
          "consistentVideoService",
          "consistent-generation",
        );

  // Media proxy — no auth required (signed URL is the authorization).
  // Must be registered before the auth middleware on /api.
  // C3 fix: pass the bucket so the proxy can fall back to streaming
  // directly from GCS when a client-side signed URL has expired. The
  // bucket is unconditionally registered in storage.services.ts and
  // listed in REQUIRED_TOKENS — a missing registration must fail boot
  // (loud) rather than silently lose the expired-URL recovery path.
  const gcsBucket = container.resolve<Bucket>("gcsBucket");
  const mediaProxyRoutes = createMediaProxyRoutes(
    STORAGE_CONFIG.bucketName,
    gcsBucket,
  );
  app.use("/api/storage", mediaProxyRoutes);

  // Public clip share (ADR-0010 site-scope D8) — no auth. Returns only a
  // denormalized clip snapshot (fresh view URL + description) for an
  // explicitly-minted share id, so nothing is exposed without a prior Share.
  // Registered before the /api auth middleware, like the media proxy above.
  const shareService = container.resolve<ShareService>("shareService");
  app.use("/api/public/share", createPublicClipRouter(shareService));

  // Main API routes
  const apiRoutes = createAPIRoutes({
    promptOptimizationService: container.resolve("promptOptimizationService"),
    optimizeTelemetryService: container.resolve<OptimizeTelemetryService>(
      "optimizeTelemetryService",
    ),
    enhancementService: container.resolve("enhancementService"),
    sceneDetectionService: container.resolve("sceneDetectionService"),
    promptCoherenceService: container.resolve("promptCoherenceService"),
    suggestionsTelemetryService: container.resolve<SuggestionsTelemetryService>(
      "suggestionsTelemetryService",
    ),
    storageService: container.resolve<StorageRoutesService>("storageService"),
    assetService: container.resolve("assetService"),
    ...(consistentVideoService ? { consistentVideoService } : {}),
    userCreditService:
      container.resolve<UserCreditService>("userCreditService"),
    referenceImageRepository: container.resolve("referenceImageRepository"),
    imageObservationService: container.resolve("imageObservationService"),
    continuitySessionService,
    sessionService: container.resolve("sessionService"),
    modelIntelligenceService,
  });

  app.use(
    "/api",
    apiAuthMiddleware,
    createRouteTimeout(30_000, {
      shouldApply: (req) => {
        const path = req.path;
        const isPreviewRoute =
          path === "/preview" || path.startsWith("/preview/");
        const isOptimizeRoute = path.startsWith("/optimize");
        return !(isPreviewRoute || isOptimizeRoute);
      },
    }),
    apiRoutes,
  );

  // LLM endpoints
  const labelSpansRoute = createLabelSpansRoute(
    container.resolve("aiService"),
    container.resolve("spanLabelingCacheService"),
    container.resolve<SpanLabelingTelemetryService>(
      "spanLabelingTelemetryService",
    ),
  );
  app.use("/api/llm/label-spans", apiAuthMiddleware, labelSpansRoute);

  app.post(
    "/api/llm/label-spans-batch",
    apiAuthMiddleware,
    createBatchMiddleware(container.resolve("spanLabelingProvider")),
  );

  // Role classification
  const roleClassifyRoute = createRoleClassifyRoute(
    container.resolve("aiService"),
  );
  app.use("/api/role-classify", apiAuthMiddleware, roleClassifyRoute);

  // Suggestions evaluation (LLM-as-a-Judge)
  const suggestionsRoute = createSuggestionsRoute({
    llmJudgeService: container.resolve<LLMJudgeService>("llmJudgeService"),
  });
  app.use("/api/suggestions", apiAuthMiddleware, suggestionsRoute);

  // Authed mint of a public share for one owned clip (ADR-0010 site-scope D8).
  app.use("/api/share", apiAuthMiddleware, createShareRouter(shareService));
}
