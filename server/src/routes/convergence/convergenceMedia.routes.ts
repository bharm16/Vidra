/**
 * Convergence Media Proxy Routes
 *
 * Provides a proxy for signed GCS URLs so Three.js textures can load with CORS
 * from the app origin (avoids browser CORS blocks on storage.googleapis.com).
 */

import express, { type Request, type Response, type Router } from "express";
import type { Bucket } from "@google-cloud/storage";
import {
  cleanupUploadFile,
  createDiskUpload,
  readUploadBuffer,
} from "@utils/upload";
import { logger } from "@infrastructure/Logger";
import { apiAuthMiddleware } from "@middleware/apiAuth";
import { asyncHandler } from "@middleware/asyncHandler";
import { createMediaProxyHandler } from "@routes/storage/mediaProxy.routes";
import {
  isOwnedConvergenceObjectPath,
  type GCSStorageService,
} from "@services/convergence/storage/StorageService";
import type { SignedUrlLedger } from "@services/storage/services/SignedUrlLedger";

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

interface AuthenticatedRequest extends Request {
  user?: { uid: string };
}

const sanitizeFilename = (value: string): string =>
  value.replace(/[^a-zA-Z0-9._-]/g, "_");

export function createConvergenceMediaRoutes(
  getStorageService: () => GCSStorageService,
  bucket: Bucket,
  signedUrlLedger: SignedUrlLedger,
): Router {
  const router = express.Router();
  const storageService = getStorageService();

  router.post(
    "/upload-image",
    apiAuthMiddleware,
    upload.single("image"),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const userId = req.user?.uid;
      const file = req.file;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "UNAUTHORIZED",
          message: "Authentication required",
        });
      }

      if (!file) {
        return res.status(400).json({
          success: false,
          error: "INVALID_REQUEST",
          message: "No image provided",
        });
      }

      const safeName = sanitizeFilename(file.originalname || "upload.png");
      const destination = `convergence/${userId}/uploads/${Date.now()}-${safeName}`;
      let url: string;
      try {
        const buffer = await readUploadBuffer(file);
        url = await storageService.uploadBuffer(
          buffer,
          destination,
          file.mimetype || "image/png",
        );
      } finally {
        await cleanupUploadFile(file);
      }

      logger.info("Convergence image uploaded", {
        userId,
        destination,
        sizeBytes: file.size,
        contentType: file.mimetype,
      });

      return res.status(200).json({
        success: true,
        url,
      });
    }),
  );

  router.get(
    "/proxy",
    apiAuthMiddleware,
    createMediaProxyHandler(
      storageService.getBucketName(),
      bucket,
      signedUrlLedger,
      {
        canAccessObject: (req, objectPath) => {
          const userId = (req as AuthenticatedRequest).user?.uid;
          return Boolean(
            userId && isOwnedConvergenceObjectPath(objectPath, userId),
          );
        },
      },
    ),
  );

  return router;
}

export default createConvergenceMediaRoutes;
