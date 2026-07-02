import express, { type Request, type Response, type Router } from "express";
import {
  cleanupUploadFile,
  createDiskUpload,
  readUploadBuffer,
} from "@utils/upload";
import { validateImageBuffer } from "@utils/validateFileType";
import { asyncHandler } from "@middleware/asyncHandler";
import { requireUserId, type RequestWithUser } from "@middleware/requireUserId";
import { requireRouteParam } from "@middleware/requireRouteParam";
import type { AssetType } from "@shared/types/asset";
import type { AssetService } from "@services/asset/AssetService";
import type { ApiResponse } from "@shared/types/api";

const upload = createDiskUpload({
  fileSizeBytes: 5 * 1024 * 1024,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
      return;
    }
    cb(new Error("Only image files allowed"));
  },
});

function normalizeAssetType(raw?: string | null): AssetType | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (["character", "style", "location", "object"].includes(normalized)) {
    return normalized as AssetType;
  }
  return null;
}

export function createAssetRoutes(assetService: AssetService): Router {
  const router = express.Router();

  router.get(
    "/",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;

      const typeParam =
        typeof req.query.type === "string" ? req.query.type : null;
      const type = normalizeAssetType(typeParam);

      if (typeParam && !type) {
        res.status(400).json({
          success: false,
          error: "Invalid asset type filter",
        } satisfies ApiResponse<never>);
        return;
      }

      if (type) {
        const { items, hasMore } = await assetService.listAssetsByType(
          userId,
          type,
        );
        const byType = { character: 0, style: 0, location: 0, object: 0 };
        byType[type] = items.length;
        const data = { assets: items, total: items.length, byType, hasMore };
        res.json({ success: true, data } satisfies ApiResponse<typeof data>);
        return;
      }

      const result = await assetService.listAssets(userId);
      res.json({
        success: true,
        data: result,
      } satisfies ApiResponse<typeof result>);
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;

      const { type, trigger, name, textDefinition, negativePrompt } =
        req.body || {};
      const asset = await assetService.createAsset(userId, {
        type,
        trigger,
        name,
        textDefinition,
        negativePrompt,
      });

      res.status(201).json({
        success: true,
        data: asset,
      } satisfies ApiResponse<typeof asset>);
    }),
  );

  router.get(
    "/suggestions",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;

      const query = typeof req.query.q === "string" ? req.query.q : "";
      if (!query.trim()) {
        res.json({
          success: true,
          data: [],
        } satisfies ApiResponse<never[]>);
        return;
      }

      const suggestions = await assetService.getSuggestions(userId, query);
      res.json({
        success: true,
        data: suggestions,
      } satisfies ApiResponse<typeof suggestions>);
    }),
  );

  router.post(
    "/resolve",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;

      const { prompt } = req.body || {};
      if (!prompt || typeof prompt !== "string") {
        res.status(400).json({
          success: false,
          error: "prompt is required",
        } satisfies ApiResponse<never>);
        return;
      }

      const resolved = await assetService.resolvePrompt(userId, prompt);
      res.json({
        success: true,
        data: resolved,
      } satisfies ApiResponse<typeof resolved>);
    }),
  );

  router.post(
    "/validate",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;

      const { prompt } = req.body || {};
      if (!prompt || typeof prompt !== "string") {
        res.status(400).json({
          success: false,
          error: "prompt is required",
        } satisfies ApiResponse<never>);
        return;
      }

      const validation = await assetService.validateTriggers(userId, prompt);
      res.json({
        success: true,
        data: validation,
      } satisfies ApiResponse<typeof validation>);
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;

      const assetId = requireRouteParam(req, res, "id");
      if (!assetId) return;
      const asset = await assetService.getAsset(userId, assetId);
      res.json({
        success: true,
        data: asset,
      } satisfies ApiResponse<typeof asset>);
    }),
  );

  router.patch(
    "/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;

      const assetId = requireRouteParam(req, res, "id");
      if (!assetId) return;
      const { trigger, name, textDefinition, negativePrompt } = req.body || {};
      const asset = await assetService.updateAsset(userId, assetId, {
        trigger,
        name,
        textDefinition,
        negativePrompt,
      });
      res.json({
        success: true,
        data: asset,
      } satisfies ApiResponse<typeof asset>);
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;

      const assetId = requireRouteParam(req, res, "id");
      if (!assetId) return;
      await assetService.deleteAsset(userId, assetId);
      res.status(204).send();
    }),
  );

  router.post(
    "/:id/images",
    upload.single("image"),
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;

      const assetId = requireRouteParam(req, res, "id");
      if (!assetId) return;
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: "No image file provided",
        } satisfies ApiResponse<never>);
        return;
      }

      const metadata = {
        angle: req.body?.angle,
        expression: req.body?.expression,
        styleType: req.body?.styleType,
        timeOfDay: req.body?.timeOfDay,
        lighting: req.body?.lighting,
      };

      try {
        const buffer = await readUploadBuffer(req.file);
        await validateImageBuffer(buffer, "image");
        const result = await assetService.addReferenceImage(
          userId,
          assetId,
          buffer,
          metadata,
        );

        res.status(201).json({
          success: true,
          data: result,
        } satisfies ApiResponse<typeof result>);
      } finally {
        await cleanupUploadFile(req.file);
      }
    }),
  );

  router.delete(
    "/:id/images/:imageId",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;

      const assetId = requireRouteParam(req, res, "id");
      if (!assetId) return;
      const imageId = requireRouteParam(req, res, "imageId");
      if (!imageId) return;
      await assetService.deleteReferenceImage(userId, assetId, imageId);
      res.status(204).send();
    }),
  );

  router.patch(
    "/:id/images/:imageId/primary",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;

      const assetId = requireRouteParam(req, res, "id");
      if (!assetId) return;
      const imageId = requireRouteParam(req, res, "imageId");
      if (!imageId) return;
      const asset = await assetService.setPrimaryImage(
        userId,
        assetId,
        imageId,
      );
      res.json({
        success: true,
        data: asset,
      } satisfies ApiResponse<typeof asset>);
    }),
  );

  router.get(
    "/:id/for-generation",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;

      const assetId = requireRouteParam(req, res, "id");
      if (!assetId) return;
      const assetData = await assetService.getAssetForGeneration(
        userId,
        assetId,
      );
      res.json({
        success: true,
        data: assetData,
      } satisfies ApiResponse<typeof assetData>);
    }),
  );

  return router;
}

export default createAssetRoutes;
