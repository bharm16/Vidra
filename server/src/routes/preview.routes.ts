/**
 * Preview Routes
 *
 * Handles image preview generation endpoints
 */

import type { Router } from "express";
import express from "express";
import { createDiskUpload } from "@utils/upload";
import { asyncHandler } from "@middleware/asyncHandler";
import type { PreviewRoutesServices } from "./types";
import { createImageGenerateHandler } from "./preview/handlers/imageGenerate";
import { createImageStoryboardGenerateHandler } from "./preview/handlers/imageStoryboardGenerate";
import { createVideoAvailabilityHandler } from "./preview/handlers/videoAvailability";
import { createVideoGenerateHandler } from "./preview/handlers/videoGenerate";
import { createVideoJobsHandler } from "./preview/handlers/videoJobs";
import { createVideoContentHandler } from "./preview/handlers/videoContent";
import { createImageContentHandler } from "./preview/handlers/imageContent";
import { createImageUploadHandler } from "./preview/handlers/imageUpload";
import { createImageAssetViewHandler } from "./preview/handlers/imageAssetView";
import { createImageAssetViewBatchHandler } from "./preview/handlers/imageAssetViewBatch";
import { createVideoAssetViewHandler } from "./preview/handlers/videoAssetView";
import { createMediaReferenceViewHandler } from "./preview/handlers/mediaReferenceView";
import { createFaceSwapPreviewHandler } from "./preview/handlers/faceSwap";

const upload = createDiskUpload({
  fileSizeBytes: 10 * 1024 * 1024,
});

/**
 * Create preview routes
 */
export function createPreviewRoutes(services: PreviewRoutesServices): Router {
  const router = express.Router();

  const resolvedServices: PreviewRoutesServices = {
    ...services,
    ...(services.keyframeService !== undefined
      ? { keyframeService: services.keyframeService }
      : {}),
    ...(services.faceSwapService !== undefined
      ? { faceSwapService: services.faceSwapService }
      : {}),
    ...(services.assetService !== undefined
      ? { assetService: services.assetService }
      : {}),
    ...(services.storageService !== undefined
      ? { storageService: services.storageService }
      : {}),
  };

  const imageGenerateHandler = createImageGenerateHandler(resolvedServices);
  const imageStoryboardGenerateHandler =
    createImageStoryboardGenerateHandler(resolvedServices);
  const videoAvailabilityHandler =
    createVideoAvailabilityHandler(resolvedServices);
  const videoGenerateHandler = createVideoGenerateHandler(resolvedServices);
  const videoJobsHandler = createVideoJobsHandler(resolvedServices);
  const videoContentHandler = createVideoContentHandler(resolvedServices);
  const imageContentHandler = createImageContentHandler();
  const imageUploadHandler = createImageUploadHandler(resolvedServices);
  const imageAssetViewHandler = createImageAssetViewHandler(resolvedServices);
  const imageAssetViewBatchHandler =
    createImageAssetViewBatchHandler(resolvedServices);
  const videoAssetViewHandler = createVideoAssetViewHandler(resolvedServices);
  const mediaReferenceViewHandler =
    createMediaReferenceViewHandler(resolvedServices);
  const faceSwapPreviewHandler = createFaceSwapPreviewHandler(resolvedServices);

  router.post("/generate", asyncHandler(imageGenerateHandler));
  router.post(
    "/generate/storyboard",
    asyncHandler(imageStoryboardGenerateHandler),
  );
  router.post(
    "/upload",
    upload.single("file"),
    asyncHandler(imageUploadHandler),
  );
  router.get("/image/view", asyncHandler(imageAssetViewHandler));
  router.post("/image/view-batch", asyncHandler(imageAssetViewBatchHandler));
  router.get("/video/view", asyncHandler(videoAssetViewHandler));
  router.get("/media/view", asyncHandler(mediaReferenceViewHandler));
  router.get("/video/availability", asyncHandler(videoAvailabilityHandler));
  router.post("/face-swap", asyncHandler(faceSwapPreviewHandler));
  router.post("/video/generate", asyncHandler(videoGenerateHandler));
  router.get("/video/jobs/:jobId", asyncHandler(videoJobsHandler));
  router.get("/video/content/:contentId", asyncHandler(videoContentHandler));
  router.get("/image/content/:contentId", asyncHandler(imageContentHandler));

  return router;
}
