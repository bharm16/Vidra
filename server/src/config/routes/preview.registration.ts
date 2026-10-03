import {
  createOwnedPictureResolver,
  type ImagePreviewAssetReader,
  type UserScopedMediaReader,
} from "@services/owned-media";
/**
 * Preview Route Registration
 *
 * Registers image and video generation preview routes.
 * Active quick-picture/clip intake is free validation (ADR-0023); auth remains required.
 */

import type { Application } from "express";
import type { DIContainer } from "@infrastructure/DIContainer";
import { apiAuthMiddleware } from "@middleware/apiAuth";
import { createStarterCreditsMiddleware } from "@middleware/starterCredits";
import { createPreviewRoutes } from "@routes/preview.routes";
import type { PreviewRoutesServices } from "@routes/types";
import { resolveOptionalService } from "./resolve-utils.ts";

type LegacyCreditPort = NonNullable<
  PreviewRoutesServices["userCreditService"]
> &
  Parameters<typeof createStarterCreditsMiddleware>[0];

export function registerPreviewRoutes(
  app: Application,
  container: DIContainer,
): void {
  const userCreditService =
    resolveOptionalService<LegacyCreditPort | null>(
      container,
      "userCreditService",
      "legacy-preview",
    ) ?? null;
  const videoGenerationService = resolveOptionalService<
    PreviewRoutesServices["videoGenerationService"]
  >(container, "videoGenerationService", "preview");

  const previewRoutes = createPreviewRoutes({
    imageGenerationService: container.resolve("imageGenerationService"),
    storyboardPreviewService: container.resolve("storyboardPreviewService"),
    videoGenerationService,
    videoJobStore: container.resolve("videoJobStore"),
    videoContentAccessService: container.resolve("videoContentAccessService"),
    userCreditService,
    storageService: container.resolve("storageService"),
    keyframeService: container.resolve("keyframeGenerationService"),
    faceSwapService: container.resolve("faceSwapService"),
    assetService: container.resolve("assetService"),
    requestIdempotencyService: container.resolve("requestIdempotencyService"),
    sessionService: container.resolve("sessionService"),
    imageAssetStore: container.resolve("imageAssetStore"),
    ownedPictureResolver: createOwnedPictureResolver({
      imageAssets:
        container.resolve<ImagePreviewAssetReader>("imageAssetStore"),
      userStorage: container.resolve<UserScopedMediaReader>("storageService"),
    }),
    owedTakeAttachmentStore: container.resolve("owedTakeAttachmentStore"),
  });

  const starterCreditsMiddleware = userCreditService
    ? createStarterCreditsMiddleware(userCreditService)
    : null;
  app.use(
    "/api/preview",
    apiAuthMiddleware,
    (req, res, next) => {
      const routePath = req.path.toLowerCase().replace(/\/+$/, "");
      // Browsing and attachment recovery are read/free paths. Only the
      // explicitly frozen credit-bearing POST surfaces retain legacy grants.
      const legacyCreditPost =
        req.method === "POST" &&
        (routePath === "/generate/storyboard" || routePath === "/face-swap");
      if (!legacyCreditPost) {
        next();
        return;
      }
      if (starterCreditsMiddleware) {
        void starterCreditsMiddleware(req, res, next);
        return;
      }
      next();
    },
    previewRoutes,
  );
}
