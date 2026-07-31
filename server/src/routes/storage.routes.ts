import express, { type Request, type Router } from "express";
import { isIP } from "node:net";
import { asyncHandler } from "@middleware/asyncHandler";
import { respond } from "@middleware/respond";
import {
  STORAGE_TYPES,
  type StorageType,
} from "@services/storage/config/storageConfig";

type RequestWithUser = Request & { user?: { uid?: string } };

const STORAGE_TYPE_SET = new Set<StorageType>(Object.values(STORAGE_TYPES));

export interface StorageRoutesService {
  getUploadUrl: (
    userId: string,
    type: StorageType,
    contentType: string,
    metadata?: Record<string, unknown>,
  ) => Promise<unknown>;
  saveFromUrl: (
    userId: string,
    sourceUrl: string,
    type: StorageType,
    metadata?: Record<string, unknown>,
  ) => Promise<unknown>;
  confirmUpload: (userId: string, storagePath: string) => Promise<unknown>;
  getViewUrl: (userId: string, path: string) => Promise<unknown>;
  getDownloadUrl: (
    userId: string,
    path: string,
    filename?: string,
  ) => Promise<unknown>;
  listFiles: (
    userId: string,
    options: { limit: number; type?: StorageType; pageToken?: string },
  ) => Promise<unknown>;
  getStorageUsage: (userId: string) => Promise<unknown>;
  deleteFile: (userId: string, path: string) => Promise<unknown>;
  deleteFiles: (userId: string, paths: unknown[]) => Promise<unknown>;
}

function resolveUserId(req: RequestWithUser): string | null {
  return req.user?.uid ?? null;
}

function rejectAnonymous(userId: string | null): string | null {
  if (!userId || userId === "anonymous" || isIP(userId) !== 0) {
    return null;
  }
  return userId;
}

function normalizeStorageType(value: unknown): StorageType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (!STORAGE_TYPE_SET.has(normalized as StorageType)) return null;
  return normalized as StorageType;
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function createStorageRoutes(
  storageService: StorageRoutesService,
): Router {
  const router = express.Router();

  router.post(
    "/upload-url",
    asyncHandler(async (req, res) => {
      const { type, contentType, metadata } = req.body || {};
      const userId = rejectAnonymous(resolveUserId(req as RequestWithUser));
      const normalizedType = normalizeStorageType(type);

      if (!userId) {
        return respond.fail(res, req, 401, {
          error: "Authentication required",
          code: "AUTH_REQUIRED",
        });
      }

      if (
        !normalizedType ||
        typeof contentType !== "string" ||
        contentType.trim().length === 0
      ) {
        return respond.fail(res, req, 400, {
          error: "Missing required fields: type, contentType",
          code: "INVALID_REQUEST",
        });
      }
      const normalizedContentType = contentType.trim();
      const result = await storageService.getUploadUrl(
        userId,
        normalizedType,
        normalizedContentType,
        normalizeMetadata(metadata),
      );

      return respond.ok(res, req, result);
    }),
  );

  router.post(
    "/save-from-url",
    asyncHandler(async (req, res) => {
      const { sourceUrl, type, metadata } = req.body || {};
      const userId = rejectAnonymous(resolveUserId(req as RequestWithUser));
      const normalizedType = normalizeStorageType(type);

      if (!userId) {
        return respond.fail(res, req, 401, {
          error: "Authentication required",
          code: "AUTH_REQUIRED",
        });
      }

      if (
        typeof sourceUrl !== "string" ||
        sourceUrl.trim().length === 0 ||
        !normalizedType
      ) {
        return respond.fail(res, req, 400, {
          error: "Missing required fields: sourceUrl, type",
          code: "INVALID_REQUEST",
        });
      }
      const normalizedSourceUrl = sourceUrl.trim();
      const result = await storageService.saveFromUrl(
        userId,
        normalizedSourceUrl,
        normalizedType,
        normalizeMetadata(metadata),
      );

      return respond.ok(res, req, result);
    }),
  );

  router.post(
    "/confirm-upload",
    asyncHandler(async (req, res) => {
      const { storagePath } = req.body || {};
      const userId = rejectAnonymous(resolveUserId(req as RequestWithUser));

      if (!userId) {
        return respond.fail(res, req, 401, {
          error: "Authentication required",
          code: "AUTH_REQUIRED",
        });
      }

      if (typeof storagePath !== "string" || storagePath.trim().length === 0) {
        return respond.fail(res, req, 400, {
          error: "Missing required field: storagePath",
          code: "INVALID_REQUEST",
        });
      }
      const result = await storageService.confirmUpload(
        userId,
        storagePath.trim(),
      );

      return respond.ok(res, req, result);
    }),
  );

  router.get(
    "/view-url",
    asyncHandler(async (req, res) => {
      const path =
        typeof req.query.path === "string" ? req.query.path.trim() : null;
      const userId = rejectAnonymous(resolveUserId(req as RequestWithUser));

      if (!userId) {
        return respond.fail(res, req, 401, {
          error: "Authentication required",
          code: "AUTH_REQUIRED",
        });
      }

      if (!path) {
        return respond.fail(res, req, 400, {
          error: "Missing required query parameter: path",
          code: "INVALID_REQUEST",
        });
      }
      const result = await storageService.getViewUrl(userId, path);

      return respond.ok(res, req, result);
    }),
  );

  router.get(
    "/download-url",
    asyncHandler(async (req, res) => {
      const path =
        typeof req.query.path === "string" ? req.query.path.trim() : null;
      const filename =
        typeof req.query.filename === "string"
          ? req.query.filename.trim()
          : null;
      const userId = rejectAnonymous(resolveUserId(req as RequestWithUser));

      if (!userId) {
        return respond.fail(res, req, 401, {
          error: "Authentication required",
          code: "AUTH_REQUIRED",
        });
      }

      if (!path) {
        return respond.fail(res, req, 400, {
          error: "Missing required query parameter: path",
          code: "INVALID_REQUEST",
        });
      }
      const result = await storageService.getDownloadUrl(
        userId,
        path,
        filename || undefined,
      );

      return respond.ok(res, req, result);
    }),
  );

  router.get(
    "/list",
    asyncHandler(async (req, res) => {
      const type = normalizeStorageType(req.query.type);
      const limitValue =
        typeof req.query.limit === "string"
          ? Number.parseInt(req.query.limit, 10)
          : NaN;
      const cursor =
        typeof req.query.cursor === "string" ? req.query.cursor : undefined;
      const userId = rejectAnonymous(resolveUserId(req as RequestWithUser));

      if (!userId) {
        return respond.fail(res, req, 401, {
          error: "Authentication required",
          code: "AUTH_REQUIRED",
        });
      }

      if (req.query.type !== undefined && !type) {
        return respond.fail(res, req, 400, {
          error: `Invalid type. Expected one of: ${Object.values(STORAGE_TYPES).join(", ")}`,
          code: "INVALID_REQUEST",
        });
      }
      const listOptions = {
        limit: Number.isFinite(limitValue) ? limitValue : 50,
        ...(type ? { type } : {}),
        ...(cursor ? { pageToken: cursor } : {}),
      };
      const result = await storageService.listFiles(userId, listOptions);

      return respond.ok(res, req, result);
    }),
  );

  router.get(
    "/usage",
    asyncHandler(async (req, res) => {
      const userId = rejectAnonymous(resolveUserId(req as RequestWithUser));

      if (!userId) {
        return respond.fail(res, req, 401, {
          error: "Authentication required",
          code: "AUTH_REQUIRED",
        });
      }
      const result = await storageService.getStorageUsage(userId);

      return respond.ok(res, req, result);
    }),
  );

  router.delete(
    "/:path(*)",
    asyncHandler(async (req, res) => {
      const { path } = req.params as { path?: string };
      const userId = rejectAnonymous(resolveUserId(req as RequestWithUser));

      if (!userId) {
        return respond.fail(res, req, 401, {
          error: "Authentication required",
          code: "AUTH_REQUIRED",
        });
      }

      if (!path) {
        return respond.fail(res, req, 400, {
          error: "Missing required parameter: path",
          code: "INVALID_REQUEST",
        });
      }
      const result = await storageService.deleteFile(userId, path.trim());

      return respond.ok(res, req, result);
    }),
  );

  router.post(
    "/delete-batch",
    asyncHandler(async (req, res) => {
      const { paths } = req.body || {};
      const userId = rejectAnonymous(resolveUserId(req as RequestWithUser));

      if (!userId) {
        return respond.fail(res, req, 401, {
          error: "Authentication required",
          code: "AUTH_REQUIRED",
        });
      }

      if (!paths || !Array.isArray(paths)) {
        return respond.fail(res, req, 400, {
          error: "Missing required field: paths (array)",
          code: "INVALID_REQUEST",
        });
      }
      const result = await storageService.deleteFiles(userId, paths);

      return respond.ok(res, req, result);
    }),
  );

  return router;
}

export default createStorageRoutes;
