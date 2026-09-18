import type { Request, Response } from "express";
import type { PreviewApiResponse } from "@shared/schemas/preview.schemas";
import { extractFirebaseUid } from "@utils/requestHelpers";
import { logger } from "@infrastructure/Logger";
import type { PreviewRoutesServices } from "@routes/types";
import { cleanupUploadFile, readUploadBuffer } from "@utils/upload";
import { validateImageBuffer } from "@utils/validateFileType";
import { admitPictureTake } from "@services/admission/admitPictureTake";
import type { TakeAttachment } from "@shared/schemas/attachment.schemas";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

function parseMetadata(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

type ImageUploadServices = Pick<
  PreviewRoutesServices,
  | "storageService"
  | "imageAssetStore"
  | "sessionService"
  | "requestIdempotencyService"
>;

/**
 * An upload that names a destination session, a words-version, and an
 * admission key is a FIRST FRAME entering the session as a take (ADR-0022
 * decision 1). An upload that names none of them is a reference image and
 * keeps the pre-ADR behaviour exactly: bytes in storage, a URL back, no take.
 *
 * All three are required together on purpose. A destination without a
 * words-version cannot say what the take's associated words are, and either
 * without a key cannot survive a retry — so a partial trio is a bad request,
 * never a silent fallback to the reference-image path.
 */
interface AdmissionIntent {
  sessionId: string;
  promptVersionId: string;
  idempotencyKey: string;
}

type AdmissionIntentResult =
  | { kind: "none" }
  | { kind: "admit"; intent: AdmissionIntent }
  | { kind: "invalid"; message: string };

function readAdmissionIntent(body: {
  sessionId?: unknown;
  promptVersionId?: unknown;
  admissionKey?: unknown;
}): AdmissionIntentResult {
  const sessionId = normalizeOptionalString(body.sessionId);
  const promptVersionId = normalizeOptionalString(body.promptVersionId);
  const idempotencyKey = normalizeOptionalString(body.admissionKey);

  const named = [sessionId, promptVersionId, idempotencyKey].filter(Boolean);
  if (named.length === 0) return { kind: "none" };
  if (!sessionId || !promptVersionId || !idempotencyKey) {
    return {
      kind: "invalid",
      message:
        "Admitting an uploaded first frame requires sessionId, promptVersionId and admissionKey together.",
    };
  }
  return {
    kind: "admit",
    intent: { sessionId, promptVersionId, idempotencyKey },
  };
}

export const createImageUploadHandler =
  ({
    storageService,
    imageAssetStore,
    sessionService,
    requestIdempotencyService,
  }: ImageUploadServices) =>
  async (
    req: Request,
    res: Response<
      PreviewApiResponse<{
        imageUrl: string;
        storagePath?: string | undefined;
        viewUrl?: string | undefined;
        viewUrlExpiresAt?: string | undefined;
        sizeBytes?: number | undefined;
        contentType?: string | undefined;
        generationId?: string | undefined;
        promptVersionId?: string | undefined;
        assetId?: string | undefined;
        attachment?: TakeAttachment | undefined;
      }>
    >,
  ): Promise<Response | void> => {
    const userId = extractFirebaseUid(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
        message: "You must be logged in to upload images.",
      });
    }

    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      return res.status(400).json({
        success: false,
        error: "No file provided",
        message: "Upload must include a file field.",
      });
    }

    if (!ALLOWED_CONTENT_TYPES.has(file.mimetype)) {
      return res.status(400).json({
        success: false,
        error: "Unsupported file type",
        message: "Supported types: PNG, JPEG, WebP.",
      });
    }

    const metadata = parseMetadata(
      (req as Request & { body?: { metadata?: unknown } }).body?.metadata,
    );
    const source = normalizeOptionalString(
      (req as Request & { body?: { source?: unknown } }).body?.source,
    );
    const label = normalizeOptionalString(
      (req as Request & { body?: { label?: unknown } }).body?.label,
    );

    const admission = readAdmissionIntent(
      (req as Request & { body?: Record<string, unknown> }).body ?? {},
    );
    if (admission.kind === "invalid") {
      return res.status(400).json({
        success: false,
        error: "Incomplete admission",
        message: admission.message,
      });
    }

    if (admission.kind === "admit") {
      if (!imageAssetStore || !sessionService || !requestIdempotencyService) {
        return res.status(503).json({
          success: false,
          error: "Admission unavailable",
          message:
            "Admitting an uploaded first frame requires the asset store, the session service and the idempotency service.",
        });
      }
    } else if (!storageService) {
      return res.status(503).json({
        success: false,
        error: "Storage service unavailable",
        message: "Storage service is not configured for preview uploads.",
      });
    }

    try {
      const buffer = await readUploadBuffer(file);
      const verifiedMime = await validateImageBuffer(buffer, "file");

      if (
        admission.kind === "admit" &&
        imageAssetStore &&
        sessionService &&
        requestIdempotencyService
      ) {
        // ADR-0022 decisions 1 and 2: the take's origin is `upload` and its
        // production provenance is recorded as unknown. The words the file was
        // dropped under are the take's ASSOCIATED words — never presented as
        // the text that produced it.
        const admitted = await admitPictureTake(
          {
            sessionService,
            mediaStore: imageAssetStore,
            idempotency: requestIdempotencyService,
          },
          {
            userId,
            sessionId: admission.intent.sessionId,
            promptVersionId: admission.intent.promptVersionId,
            origin: "upload",
            media: { buffer, contentType: verifiedMime },
            productionProvenance: { state: "unknown" },
            // An upload has no take ancestor: it hangs from the words-version
            // it was admitted under. It never produces a `refine` edge.
            displayAncestorGenerationId: null,
            idempotencyKey: admission.intent.idempotencyKey,
            // No associated-words override: the admitting version's own text
            // is the take's associated words. `label` is file metadata for the
            // reference-image path and is deliberately not reused as words.
          },
        );

        if (admitted.state === "refused") {
          return res.status(404).json({
            success: false,
            error: "Session not found",
            message: "That session is not available.",
          });
        }
        if (admitted.state === "in_progress") {
          return res.status(409).json({
            success: false,
            error: "Admission already in progress",
            message: "A matching upload is already being admitted.",
          });
        }
        if (admitted.state === "conflict") {
          return res.status(409).json({
            success: false,
            error: "Admission key already used",
            message:
              "That admission key was already used for a different destination.",
          });
        }

        const { take } = admitted;
        return res.status(201).json({
          success: true,
          data: {
            imageUrl: take.imageUrl,
            viewUrl: take.imageUrl,
            storagePath: take.storagePath,
            assetId: take.assetId,
            contentType: verifiedMime,
            sizeBytes: buffer.length,
            // The server-assigned take identity. Present only once the take is
            // actually in its session — `attachment` carries the other case.
            ...(take.attachment.state === "attached"
              ? { generationId: take.generationId }
              : {}),
            promptVersionId: take.promptVersionId,
            attachment: take.attachment,
          },
        });
      }

      if (!storageService) {
        return res.status(503).json({
          success: false,
          error: "Storage service unavailable",
          message: "Storage service is not configured for preview uploads.",
        });
      }

      const uploadMetadata = {
        ...metadata,
        ...(source ? { source } : {}),
        ...(label ? { label } : {}),
        originalName: file.originalname,
      };

      const result = await storageService.uploadBuffer(
        userId,
        "preview-image",
        buffer,
        verifiedMime,
        uploadMetadata,
      );

      return res.status(201).json({
        success: true,
        data: {
          imageUrl: result.viewUrl,
          storagePath: result.storagePath,
          viewUrl: result.viewUrl,
          viewUrlExpiresAt: result.expiresAt,
          sizeBytes: result.sizeBytes,
          contentType: result.contentType,
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const isClientError =
        errorMessage.includes("Invalid content type") ||
        errorMessage.includes("File too large");

      if (!isClientError) {
        logger.error(
          "Image upload failed",
          error instanceof Error ? error : new Error(errorMessage),
        );
      }

      return res.status(isClientError ? 400 : 500).json({
        success: false,
        error: "Image upload failed",
        message: errorMessage,
      });
    } finally {
      await cleanupUploadFile(file);
    }
  };
