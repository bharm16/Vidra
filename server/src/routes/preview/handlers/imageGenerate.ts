import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { PreviewApiResponse } from "@shared/schemas/preview.schemas";
import { extractFirebaseUid } from "@utils/requestHelpers";
import { logger } from "@infrastructure/Logger";
import { sendApiError } from "@middleware/apiErrorResponse";
import { GENERATION_ERROR_CODES } from "@routes/generationErrorCodes";
import type { ApiErrorCode } from "@shared/types/api";
import type { PreviewRoutesServices } from "@routes/types";
import { resolveImagePreviewProviderSelection } from "@services/image-generation/providers/registry";
import type {
  ImagePreviewProviderSelection,
  ImagePreviewSpeedMode,
} from "@services/image-generation/providers/types";
import { IMAGE_PREVIEW_SPEED_MODES } from "@shared/schemas/preview.schemas";
import { buildRefundKey, refundWithGuard } from "@services/credits/refundGuard";
import { buildCompletedTakeRecord } from "@services/sessions/takeRecord";
import { attachTakeWithOwedTracking } from "@services/sessions/attachTakeWithOwedTracking";
import type { TakeAttachment } from "@shared/schemas/attachment.schemas";

type ImageGenerateServices = Pick<
  PreviewRoutesServices,
  | "imageGenerationService"
  | "userCreditService"
  | "assetService"
  | "storageService"
  | "requestIdempotencyService"
  | "sessionService"
  | "owedTakeAttachmentStore"
>;

const IMAGE_PREVIEW_CREDIT_COST = 1;
const TRIGGER_REGEX = /@([a-zA-Z][a-zA-Z0-9_-]*)/g;

const SPEED_MODE_OPTIONS = new Set<ImagePreviewSpeedMode>(
  IMAGE_PREVIEW_SPEED_MODES,
);

const hasPromptTriggers = (prompt: string): boolean =>
  Array.from(prompt.matchAll(TRIGGER_REGEX)).length > 0;

export const createImageGenerateHandler =
  ({
    imageGenerationService,
    userCreditService,
    assetService,
    storageService,
    requestIdempotencyService,
    sessionService,
    owedTakeAttachmentStore,
  }: ImageGenerateServices) =>
  async (req: Request, res: Response): Promise<Response | void> => {
    if (!imageGenerationService) {
      return sendApiError(res, req, 503, {
        error: "Image generation service is not available",
        code: GENERATION_ERROR_CODES.SERVICE_UNAVAILABLE,
        details: "No image preview providers are configured",
      });
    }

    const {
      prompt,
      aspectRatio,
      provider,
      inputImageUrl,
      seed,
      speedMode,
      outputQuality,
      sessionId,
      promptVersionId,
    } = (req.body || {}) as {
      prompt?: unknown;
      aspectRatio?: unknown;
      provider?: unknown;
      inputImageUrl?: unknown;
      seed?: unknown;
      speedMode?: unknown;
      outputQuality?: unknown;
      sessionId?: unknown;
      promptVersionId?: unknown;
    };

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return sendApiError(res, req, 400, {
        error: "Prompt must be a non-empty string",
        code: GENERATION_ERROR_CODES.INVALID_REQUEST,
      });
    }

    if (aspectRatio !== undefined && typeof aspectRatio !== "string") {
      return sendApiError(res, req, 400, {
        error: "aspectRatio must be a string",
        code: GENERATION_ERROR_CODES.INVALID_REQUEST,
      });
    }

    let resolvedProvider: ImagePreviewProviderSelection | undefined;
    if (provider !== undefined) {
      if (typeof provider !== "string") {
        return sendApiError(res, req, 400, {
          error: "provider must be a string",
          code: GENERATION_ERROR_CODES.INVALID_REQUEST,
        });
      }
      const selection = resolveImagePreviewProviderSelection(provider);
      if (!selection) {
        return sendApiError(res, req, 400, {
          error: `Unsupported provider: ${provider}`,
          code: GENERATION_ERROR_CODES.INVALID_REQUEST,
        });
      }
      resolvedProvider = selection;
    }

    let normalizedInputImageUrl: string | undefined;
    if (inputImageUrl !== undefined) {
      if (
        typeof inputImageUrl !== "string" ||
        inputImageUrl.trim().length === 0
      ) {
        return sendApiError(res, req, 400, {
          error: "inputImageUrl must be a non-empty string",
          code: GENERATION_ERROR_CODES.INVALID_REQUEST,
        });
      }
      normalizedInputImageUrl = inputImageUrl.trim();
    }

    let normalizedSeed: number | undefined;
    if (seed !== undefined) {
      if (typeof seed !== "number" || !Number.isFinite(seed)) {
        return sendApiError(res, req, 400, {
          error: "seed must be a finite number",
          code: GENERATION_ERROR_CODES.INVALID_REQUEST,
        });
      }
      normalizedSeed = seed;
    }

    let normalizedSpeedMode: ImagePreviewSpeedMode | undefined;
    if (speedMode !== undefined) {
      if (typeof speedMode !== "string") {
        return sendApiError(res, req, 400, {
          error: "speedMode must be a string",
          code: GENERATION_ERROR_CODES.INVALID_REQUEST,
        });
      }
      if (!SPEED_MODE_OPTIONS.has(speedMode as ImagePreviewSpeedMode)) {
        return sendApiError(res, req, 400, {
          error: `speedMode must be one of: ${IMAGE_PREVIEW_SPEED_MODES.join(", ")}`,
          code: GENERATION_ERROR_CODES.INVALID_REQUEST,
        });
      }
      normalizedSpeedMode = speedMode as ImagePreviewSpeedMode;
    }

    let normalizedOutputQuality: number | undefined;
    if (outputQuality !== undefined) {
      if (
        typeof outputQuality !== "number" ||
        !Number.isFinite(outputQuality)
      ) {
        return sendApiError(res, req, 400, {
          error: "outputQuality must be a finite number",
          code: GENERATION_ERROR_CODES.INVALID_REQUEST,
        });
      }
      normalizedOutputQuality = outputQuality;
    }

    if (
      resolvedProvider === "replicate-flux-kontext-fast" &&
      !normalizedInputImageUrl
    ) {
      return sendApiError(res, req, 400, {
        error:
          "inputImageUrl is required when using the replicate-flux-kontext-fast provider",
        code: GENERATION_ERROR_CODES.INVALID_REQUEST,
      });
    }

    const userId = extractFirebaseUid(req);
    const requestId = (req as Request & { id?: string }).id;
    if (!userId) {
      return sendApiError(res, req, 401, {
        error: "Authentication required",
        code: GENERATION_ERROR_CODES.AUTH_REQUIRED,
        details: "You must be logged in to generate image previews.",
      });
    }

    const rawIdempotencyKey = req.get("Idempotency-Key");
    const idempotencyKey =
      typeof rawIdempotencyKey === "string" &&
      rawIdempotencyKey.trim().length > 0
        ? rawIdempotencyKey.trim()
        : null;
    let idempotencyRecordId: string | null = null;

    const releaseIdempotencyLock = async (reason: string): Promise<void> => {
      if (!idempotencyRecordId || !requestIdempotencyService) {
        return;
      }
      await requestIdempotencyService.markFailed(idempotencyRecordId, reason);
    };

    const respondWithError = async (
      status: number,
      payload: { error: string; code: ApiErrorCode; details?: string },
    ): Promise<Response> => {
      await releaseIdempotencyLock(payload.code || payload.error);
      return sendApiError(res, req, status, payload);
    };

    if (idempotencyKey) {
      if (!requestIdempotencyService) {
        logger.warn(
          "Idempotency key supplied but request idempotency service is unavailable",
          {
            userId,
            requestId,
            path: req.path,
          },
        );
        return sendApiError(res, req, 503, {
          error: "Image generation service is not available",
          code: GENERATION_ERROR_CODES.SERVICE_UNAVAILABLE,
          details: "Idempotency service is not configured",
        });
      }

      const claim = await requestIdempotencyService.claimRequest({
        userId,
        route: "/api/preview/generate",
        key: idempotencyKey,
        payload: {
          prompt: prompt.trim(),
          ...(aspectRatio ? { aspectRatio } : {}),
          ...(resolvedProvider ? { provider: resolvedProvider } : {}),
          ...(normalizedInputImageUrl
            ? { inputImageUrl: normalizedInputImageUrl }
            : {}),
          ...(normalizedSeed !== undefined ? { seed: normalizedSeed } : {}),
          ...(normalizedSpeedMode ? { speedMode: normalizedSpeedMode } : {}),
          ...(normalizedOutputQuality !== undefined
            ? { outputQuality: normalizedOutputQuality }
            : {}),
        },
      });

      if (claim.state === "replay") {
        return res.status(claim.snapshot.statusCode).json(claim.snapshot.body);
      }
      if (claim.state === "conflict") {
        return sendApiError(res, req, 409, {
          error: "Idempotency key was already used with a different payload",
          code: GENERATION_ERROR_CODES.IDEMPOTENCY_CONFLICT,
        });
      }
      if (claim.state === "in_progress") {
        return sendApiError(res, req, 409, {
          error: "A matching request is already in progress",
          code: GENERATION_ERROR_CODES.REQUEST_IN_PROGRESS,
        });
      }

      idempotencyRecordId = claim.recordId;
    }

    let resolvedPrompt = prompt.trim();
    const shouldResolvePrompt = hasPromptTriggers(resolvedPrompt);
    let resolvedAssetCount = 0;
    let resolvedCharacterCount = 0;

    if (shouldResolvePrompt) {
      if (!assetService) {
        logger.warn("Asset service unavailable for image prompt resolution", {
          userId,
          path: req.path,
        });
      } else {
        try {
          const resolved = await assetService.resolvePrompt(
            userId,
            resolvedPrompt,
          );
          const expandedPrompt = resolved.expandedText.trim();
          if (expandedPrompt.length > 0) {
            resolvedPrompt = expandedPrompt;
          }
          resolvedAssetCount = resolved.assets.length;
          resolvedCharacterCount = resolved.characters.length;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logger.error(
            "Image prompt resolution failed",
            error instanceof Error ? error : new Error(errorMessage),
            {
              userId,
              path: req.path,
            },
          );
          return await respondWithError(500, {
            error: "Image prompt resolution failed",
            code: GENERATION_ERROR_CODES.GENERATION_FAILED,
            details: errorMessage,
          });
        }
      }
    }

    if (!userCreditService) {
      logger.error(
        "User credit service is not available - blocking preview access",
        undefined,
        {
          path: req.path,
        },
      );
      return await respondWithError(503, {
        error: "Image generation service is not available",
        code: GENERATION_ERROR_CODES.SERVICE_UNAVAILABLE,
        details: "Credit service is not configured",
      });
    }

    const previewCost = IMAGE_PREVIEW_CREDIT_COST;
    const refundOperationToken =
      requestId ??
      buildRefundKey([
        "preview-image",
        userId,
        resolvedPrompt,
        Date.now(),
        randomUUID().slice(0, 8),
      ]);
    const previewRefundKey = buildRefundKey([
      "preview-image",
      refundOperationToken,
      userId,
      "generation",
    ]);
    const hasCredits = await userCreditService.reserveCredits(
      userId,
      previewCost,
    );
    if (!hasCredits) {
      return await respondWithError(402, {
        error: "Insufficient credits",
        code: GENERATION_ERROR_CODES.INSUFFICIENT_CREDITS,
        details: `This preview requires ${previewCost} credit${previewCost === 1 ? "" : "s"}.`,
      });
    }

    try {
      const result = await imageGenerationService.generatePreview(
        resolvedPrompt,
        {
          ...(aspectRatio ? { aspectRatio } : {}),
          ...(userId ? { userId } : {}),
          ...(resolvedProvider ? { provider: resolvedProvider } : {}),
          ...(normalizedInputImageUrl
            ? { inputImageUrl: normalizedInputImageUrl }
            : {}),
          ...(normalizedSeed !== undefined ? { seed: normalizedSeed } : {}),
          ...(normalizedSpeedMode ? { speedMode: normalizedSpeedMode } : {}),
          ...(normalizedOutputQuality !== undefined
            ? { outputQuality: normalizedOutputQuality }
            : {}),
        },
      );

      let storageResult: {
        storagePath: string;
        viewUrl: string;
        expiresAt: string;
        sizeBytes: number;
      } | null = null;

      if (storageService) {
        storageResult = await storageService.saveFromUrl(
          userId,
          result.imageUrl,
          "preview-image",
          {
            model: result.metadata.model,
            promptId: (req.body as { promptId?: string })?.promptId,
            aspectRatio: result.metadata.aspectRatio,
          },
        );
      }

      // M5 / D4 (ADR-0013): when the client supplies sessionId + promptVersionId,
      // the picture becomes a session generation record so it can be a node in
      // the space.
      //
      // ADR-0022 decision 6: the attachment is a SECOND fact, reported beside
      // the media rather than swallowed. A failure here leaves the picture made
      // but not saved — the media URLs are still returned, the creator is not
      // refunded and nothing is regenerated, and the take identity minted below
      // rides back out so a retry attaches this same take.
      //
      // Issue #133: a generated take is not admitted, so it has no idempotency
      // snapshot to resume from. `attachTakeWithOwedTracking` writes a durable
      // `pending` checkpoint BEFORE the append and settles it after, so a lost
      // response leaves a debt a reloaded client can discover and repair with no
      // regeneration — the quick-picture mirror of the clip worker's resume.
      const finalImageUrl = storageResult?.viewUrl ?? result.imageUrl;
      let attachment: TakeAttachment | null = null;
      if (
        typeof sessionId === "string" &&
        sessionId.length > 0 &&
        typeof promptVersionId === "string" &&
        promptVersionId.length > 0 &&
        sessionService
      ) {
        // Minted before anything can fail: the take's name is not the append's
        // to lose.
        const generationId = randomUUID();
        const mediaAssetId = storageResult?.storagePath
          ? (storageResult.storagePath.split("/").filter(Boolean).pop() ??
            storageResult.storagePath)
          : null;
        try {
          const generationRecord = buildCompletedTakeRecord({
            id: generationId,
            model: result.metadata.model,
            mediaType: "image",
            prompt,
            promptVersionId,
            mediaUrls: [finalImageUrl],
            ...(mediaAssetId ? { mediaAssetIds: [mediaAssetId] } : {}),
            thumbnailUrl: finalImageUrl,
            // ADR-0013: a picture roots at its words-version — the
            // version→picture edge is structural (this record lives in that
            // version's generations).
            ancestorGenerationId: null,
          });
          attachment = await attachTakeWithOwedTracking({
            store: owedTakeAttachmentStore ?? undefined,
            sessionService,
            input: {
              userId,
              generationId,
              sessionId,
              promptVersionId,
              record: generationRecord,
            },
            logLabel: "Quick picture",
          });
        } catch (buildError) {
          // The builder validates against the record schema; a validation throw
          // is an unattached take like any other, not a voided generation.
          const reason =
            buildError instanceof Error
              ? buildError.message
              : String(buildError);
          logger.error(
            "Quick picture take record could not be built; picture is unattached",
            buildError instanceof Error ? buildError : new Error(reason),
            { userId, sessionId, promptVersionId, generationId },
          );
          attachment = {
            state: "failed",
            generationId,
            sessionId,
            promptVersionId,
            reason,
          };
        }
      }

      const responseData = {
        ...(storageResult
          ? {
              ...result,
              imageUrl: storageResult.viewUrl,
              viewUrl: storageResult.viewUrl,
              viewUrlExpiresAt: storageResult.expiresAt,
              storagePath: storageResult.storagePath,
              sizeBytes: storageResult.sizeBytes,
            }
          : result),
        // `generationId` has always meant "this take is in the session", so it
        // appears only when the attachment actually succeeded.
        ...(attachment?.state === "attached"
          ? { generationId: attachment.generationId }
          : {}),
        ...(attachment ? { attachment } : {}),
      };

      const responseBody = {
        success: true,
        data: responseData,
      } satisfies PreviewApiResponse<typeof responseData>;

      if (idempotencyRecordId && requestIdempotencyService) {
        await requestIdempotencyService.markCompleted({
          recordId: idempotencyRecordId,
          snapshot: {
            statusCode: 200,
            body: responseBody,
          },
        });
      }

      return res.json(responseBody);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const statusCode = (error as { statusCode?: number }).statusCode || 500;
      const errorInstance =
        error instanceof Error ? error : new Error(errorMessage);
      const isServiceUnavailable = statusCode === 503;

      await refundWithGuard({
        userCreditService,
        userId,
        amount: previewCost,
        refundKey: previewRefundKey,
        reason: "preview image generation failed",
        metadata: {
          requestId,
          path: req.path,
        },
      });

      logger.error("Image preview generation failed", errorInstance, {
        statusCode,
        userId,
        aspectRatio,
        shouldResolvePrompt,
        resolvedAssetCount,
        resolvedCharacterCount,
      });

      return await respondWithError(statusCode, {
        error: "Image generation failed",
        code: isServiceUnavailable
          ? GENERATION_ERROR_CODES.SERVICE_UNAVAILABLE
          : GENERATION_ERROR_CODES.GENERATION_FAILED,
        details: errorMessage,
      });
    }
  };
