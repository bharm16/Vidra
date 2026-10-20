import express from "express";
/**
 * Core API Route Registration
 *
 * Registers the main /api routes, LLM endpoints, role classification,
 * and suggestions evaluation. All routes require auth.
 */

import type { Application } from "express";
import type { Bucket } from "@google-cloud/storage";
import type { SignedUrlLedger } from "@infrastructure/signedUrl/SignedUrlLedger";
import type { DIContainer } from "@infrastructure/DIContainer";
import { apiAuthMiddleware } from "@middleware/apiAuth";
import { createRouteTimeout } from "@middleware/routeTimeout";
import { createAPIRoutes } from "@routes/api.routes";
import { createFolderRoutes } from "@routes/folders.routes";
import type { FolderStore } from "@services/projects/FolderStore";
import {
  createCreationRequestRoutes,
  createPublicWorkflowCatalogRoutes,
  createWorkflowCatalogRoutes,
} from "@routes/creation-requests.routes";
import type { RequestHistoryStore } from "@services/media-history/RequestHistoryStore";
import type { MediaVersionIndex } from "@services/media-history/MediaVersionIndex";
import type { WorkflowCapabilityCatalog } from "@services/creation-requests/preparation/WorkflowCapabilityCatalog";
import type { ActionPreparationService } from "@services/creation-requests/preparation/ActionPreparationService";
import type { RequestIdempotencyService } from "@services/admission/idempotency/RequestIdempotencyService";
import type { StorageService } from "@services/storage/StorageService";
import { createLabelSpansRoute } from "@routes/labelSpansRoute";
import { createMediaProxyRoutes } from "@routes/storage/mediaProxy.routes";
import {
  createFalI2iRouter,
  type SketchRelayFetch,
} from "@routes/fal-i2i.routes";
import { createStudioRouter } from "@routes/studio.routes";
import type { StudioService } from "@services/studio/StudioService";
import { remintSessionPictureUrls } from "@services/sessions/remintSessionPictureUrls";
import type { SessionDto } from "@shared/types/session";
import {
  createOwnedPictureResolver,
  type ImagePreviewAssetReader,
  type OwnedPictureResolver,
  type UserScopedMediaReader,
} from "@services/owned-media";
import {
  createShareRouter,
  createPublicClipRouter,
} from "@routes/share.routes";
import { resolveFalApiKey } from "@utils/falApiKey";
import type { ShareService } from "@services/share/ShareService";
import type { StorageRoutesService } from "@routes/storage.routes";
import { STORAGE_CONFIG } from "@services/storage/config/storageConfig";
import { resolveOptionalService } from "./resolve-utils.ts";

export function registerApiRoutes(
  app: Application,
  container: DIContainer,
): void {
  const videoGenerationService = resolveOptionalService<unknown>(
    container,
    "videoGenerationService",
    "preview",
  );

  // Media proxy — mounted before the auth middleware on /api; the access
  // posture and the rescue's requirements are carried by MediaProxyOptions.
  // The bucket is unconditionally registered in storage.services.ts and
  // listed in REQUIRED_TOKENS, so a missing registration fails boot (loud)
  // rather than silently losing the expired-URL recovery path.
  const gcsBucket = container.resolve<Bucket>("gcsBucket");
  const signedUrlLedger = container.resolve<SignedUrlLedger>("signedUrlLedger");
  const mediaProxyRoutes = createMediaProxyRoutes({
    bucketName: STORAGE_CONFIG.bucketName,
    access: { kind: "signed-url-is-authorization" },
    rescue: { bucket: gcsBucket, signedUrlLedger },
  });
  app.use("/api/storage", mediaProxyRoutes);

  // Public clip share (ADR-0010 site-scope D8) — no auth. Returns only a
  // denormalized clip snapshot (fresh view URL + description) for an
  // explicitly-minted share id, so nothing is exposed without a prior Share.
  // Registered before the /api auth middleware, like the media proxy above.
  const shareService = container.resolve<ShareService>("shareService");
  app.use("/api/public/share", createPublicClipRouter(shareService));

  const workflowManagement = container.resolve<WorkflowManagementService>(
    "workflowManagementService",
  );
  app.use(
    "/api/public/workflow",
    createPublicWorkflowCatalogRoutes(
      container.resolve<WorkflowCapabilityCatalog>("workflowCapabilityCatalog"),
    ),
  );
  app.use(
    "/api/public/workflow-shares",
    createPublicWorkflowSharingRoutes(workflowManagement, {
      publicBaseUrl: process.env.FRONTEND_URL ?? "http://localhost:5173",
    }),
  );

  // Issue #109 / #125: the ONE owner-checked resolver that understands both
  // the image-asset store and the user-scoped store, used by the session read
  // to re-mint a picture from its durable handle (#125). Null when either
  // store is absent; the read then degrades to the stored URL, which the
  // client can still recover from its durable handle.
  const ownedPictureResolverImageAssets =
    resolveOptionalService<ImagePreviewAssetReader | null>(
      container,
      "imageAssetStore",
      "owned-picture-resolver",
    );
  const ownedPictureResolverUserStorage =
    resolveOptionalService<UserScopedMediaReader | null>(
      container,
      "storageService",
      "owned-picture-resolver",
    );
  const ownedPictureResolver: OwnedPictureResolver | null =
    ownedPictureResolverImageAssets && ownedPictureResolverUserStorage
      ? createOwnedPictureResolver({
          imageAssets: ownedPictureResolverImageAssets,
          userStorage: ownedPictureResolverUserStorage,
        })
      : null;
  const remintSessionPictures = ownedPictureResolver
    ? (dto: SessionDto): Promise<SessionDto> =>
        remintSessionPictureUrls(dto, { resolver: ownedPictureResolver })
    : null;

  // Main API routes
  const apiRoutes = createAPIRoutes({
    promptOptimizationService: container.resolve("promptOptimizationService"),
    enhancementService: container.resolve("enhancementService"),
    sceneDetectionService: container.resolve("sceneDetectionService"),
    storageService: container.resolve<StorageRoutesService>("storageService"),
    sessionService: container.resolve("sessionService"),
    remintSessionPictures,
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

  // New project authoring and immutable request recovery.
  const workflowStorage = container.resolve<StorageService>("storageService");
  app.use(
    "/api/projects",
    apiAuthMiddleware,
    createWorkflowManagementRoutes(workflowManagement),
  );
  app.use(
    "/api/projects",
    apiAuthMiddleware,
    createProjectRoutes({
      projects: container.resolve<ProjectStore>("workflowProjectStore"),
      conversations: container.resolve<ConversationStore>(
        "workflowConversationStore",
      ),
      drafts: container.resolve<CreationDraftStore>("workflowDraftStore"),
      history: container.resolve<RequestHistoryStore>("workflowHistoryStore"),
      media: container.resolve<MediaVersionIndex>("workflowMediaIndex"),
      library: container.resolve<ProjectMediaService>("workflowMediaLibrary"),
      mediaActions: workflowManagement,
      mediaAccess: (ownerId, storagePath) =>
        workflowStorage.getViewUrl(ownerId, storagePath),
    }),
  );
  app.use(
    "/api/folders",
    apiAuthMiddleware,
    createFolderRoutes(container.resolve<FolderStore>("workflowFolderStore")),
  );
  app.use(
    "/api/workflow",
    apiAuthMiddleware,
    createWorkflowCatalogRoutes(
      container.resolve<WorkflowCapabilityCatalog>("workflowCapabilityCatalog"),
    ),
  );
  app.use(
    "/api/creation-requests",
    apiAuthMiddleware,
    createCreationRequestRoutes({
      preparation: container.resolve<ActionPreparationService>(
        "workflowPreparationService",
      ),
      receipts: container.resolve<RequestIdempotencyService>(
        "requestIdempotencyService",
      ),
      execution: container.resolve<WorkflowExecutionService>(
        "workflowExecutionService",
      ),
    }),
  );

  app.use(
    "/api/projects",
    apiAuthMiddleware,
    createVideoEditRoutes({
      projects: container.resolve<ProjectStore>("workflowProjectStore"),
      edits: container.resolve<VideoEditStore>("workflowVideoEditStore"),
      exports: container.resolve<VideoExportService>(
        "workflowVideoExportService",
      ),
      previews: container.resolve<VideoPreviewService>(
        "workflowVideoPreviewService",
      ),
    }),
  );
  app.use(
    "/api/projects",
    apiAuthMiddleware,
    express.json({ limit: "24mb" }),
    createProjectSketchRoutes(
      container.resolve<ProjectSketchService>("workflowSketchService"),
    ),
  );
  app.use(
    "/api/account",
    apiAuthMiddleware,
    createAccountRoutes(
      container.resolve<AccountUsageService>("workflowAccountUsage"),
    ),
  );

  // LLM endpoints
  const labelSpansRoute = createLabelSpansRoute(
    container.resolve("aiService"),
    container.resolve("spanLabelingCacheService"),
  );
  app.use("/api/llm/label-spans", apiAuthMiddleware, labelSpansRoute);

  // Authed mint of a public share for one owned clip (ADR-0010 site-scope D8).
  app.use("/api/share", apiAuthMiddleware, createShareRouter(shareService));

  // Realtime-sketch spike (ADR-0016 as amended): relays sketch frames to the
  // one approved fal i2i model over HTTP sync — fal retired realtime-WS i2i,
  // so all frame traffic flows through the server again.
  // Frames are admitted against the creator's shared daily budget before
  // dispatch (issue #84) — the relay is fail-closed without it.
  // Tests substitute the relay's upstream fetch; null keeps global fetch.
  const sketchRelayFetch = resolveOptionalService<SketchRelayFetch | null>(
    container,
    "sketchRelayFetch",
    "fal-i2i",
  );
  app.use(
    "/api/fal",
    apiAuthMiddleware,
    createFalI2iRouter({
      falKey: resolveFalApiKey() ?? undefined,
      budget: container.resolve("sketchBudgetService"),
      ...(sketchRelayFetch ? { fetchFn: sketchRelayFetch } : {}),
    }),
  );

  // Studio conversational image workspace (ADR-0019). Null when the
  // ENABLE_STUDIO flag is off or REPLICATE_API_TOKEN is missing — the
  // surface simply isn't mounted then.
  const studioService = resolveOptionalService<StudioService | null>(
    container,
    "studioService",
    "studio",
  );
  if (studioService) {
    app.use(
      "/api/studio",
      apiAuthMiddleware,
      createStudioRouter(studioService),
    );
  }
}
import { createProjectRoutes } from "@routes/projects.routes";
import type { ProjectMediaService } from "@services/project-media/ProjectMediaService";
import type { ProjectStore } from "@services/projects/ProjectStore";
import type { ConversationStore } from "@services/projects/ConversationStore";
import type { CreationDraftStore } from "@services/creation-drafts/CreationDraftStore";

import type { WorkflowExecutionService } from "@services/creation-requests/execution/WorkflowExecutionService";
import type { VideoEditStore } from "@services/video-editing/VideoEditStore";
import type { VideoPreviewService } from "@services/video-editing/VideoPreviewService";
import type { VideoExportService } from "@services/video-export/VideoExportService";
import type { AccountUsageService } from "@services/account/AccountUsageService";
import type { ProjectSketchService } from "@services/project-sketch/ProjectSketchService";
import { createVideoEditRoutes } from "@routes/video-edits.routes";
import { createAccountRoutes } from "@routes/account.routes";
import { createProjectSketchRoutes } from "@routes/project-sketch.routes";

import { createWorkflowManagementRoutes } from "@routes/workflow-management.routes";
import { createPublicWorkflowSharingRoutes } from "@routes/public-workflow-sharing.routes";
import type { WorkflowManagementService } from "@services/workflow-sharing/WorkflowManagementService";
