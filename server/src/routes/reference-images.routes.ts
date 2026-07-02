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
import type { ReferenceImageStorePort } from "@services/asset/reference-images/ports/ReferenceImageStorePort";
import type { ApiResponse } from "@shared/types/api";

const upload = createDiskUpload({
  fileSizeBytes: 10 * 1024 * 1024,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
      return;
    }
    cb(new Error("Only image files allowed"));
  },
});

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function createReferenceImagesRoutes(
  referenceImageRepository: ReferenceImageStorePort,
): Router {
  const router = express.Router();

  router.get(
    "/",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;

      const limitValue =
        typeof req.query.limit === "string"
          ? Number.parseInt(req.query.limit, 10)
          : NaN;
      const limit = Number.isFinite(limitValue) ? limitValue : undefined;
      const listOptions = limit !== undefined ? { limit } : {};

      const images = await referenceImageRepository.listImages(
        userId,
        listOptions,
      );
      const data = { images };
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    }),
  );

  router.post(
    "/",
    upload.single("file"),
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;

      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file) {
        res.status(400).json({
          success: false,
          error: "No file provided",
        } satisfies ApiResponse<never>);
        return;
      }

      const label = normalizeOptionalString(
        (req as Request & { body?: { label?: unknown } }).body?.label,
      );
      const source = normalizeOptionalString(
        (req as Request & { body?: { source?: unknown } }).body?.source,
      );
      const createInput = {
        ...(label !== undefined ? { label } : {}),
        ...(source !== undefined ? { source } : {}),
        originalName: file.originalname,
      };

      try {
        const buffer = await readUploadBuffer(file);
        await validateImageBuffer(buffer, "file");
        const image = await referenceImageRepository.createFromBuffer(
          userId,
          buffer,
          createInput,
        );

        res.status(201).json({
          success: true,
          data: image,
        } satisfies ApiResponse<typeof image>);
      } finally {
        await cleanupUploadFile(file);
      }
    }),
  );

  router.post(
    "/from-url",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;

      const { sourceUrl, label, source } = (req.body || {}) as {
        sourceUrl?: unknown;
        label?: unknown;
        source?: unknown;
      };

      if (!sourceUrl || typeof sourceUrl !== "string") {
        res.status(400).json({
          success: false,
          error: "sourceUrl is required",
        } satisfies ApiResponse<never>);
        return;
      }

      const normalizedLabel = normalizeOptionalString(label);
      const normalizedSource = normalizeOptionalString(source);
      const createInput = {
        ...(normalizedLabel !== undefined ? { label: normalizedLabel } : {}),
        ...(normalizedSource !== undefined ? { source: normalizedSource } : {}),
      };
      const image = await referenceImageRepository.createFromUrl(
        userId,
        sourceUrl.trim(),
        createInput,
      );

      res.status(201).json({
        success: true,
        data: image,
      } satisfies ApiResponse<typeof image>);
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req as RequestWithUser, res);
      if (!userId) return;

      const imageId = requireRouteParam(req, res, "id");
      if (!imageId) return;
      const deleted = await referenceImageRepository.deleteImage(
        userId,
        imageId,
      );
      if (!deleted) {
        res.status(404).json({
          success: false,
          error: "Reference image not found",
        } satisfies ApiResponse<never>);
        return;
      }

      res.status(204).send();
    }),
  );

  return router;
}

export default createReferenceImagesRoutes;
