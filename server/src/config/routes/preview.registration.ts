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
import { createPreviewRoutes } from "@routes/preview.routes";
import type { PreviewRoutesServices } from "@routes/types";
import { resolveOptionalService } from "./resolve-utils.ts";

export function registerPreviewRoutes(
  app: Application,
  container: DIContainer,
): void {
  const videoGenerationService = resolveOptionalService<
    PreviewRoutesServices["videoGenerationService"]
  >(container, "videoGenerationService", "preview");

  const previewRoutes = createPreviewRoutes({
    imageGenerationService: container.resolve("imageGenerationService"),
    videoGenerationService,
    videoJobStore: container.resolve("videoJobStore"),
    videoContentAccessService: container.resolve("videoContentAccessService"),
    storageService: container.resolve("storageService"),
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

  app.use("/api/preview", apiAuthMiddleware, previewRoutes);
}
