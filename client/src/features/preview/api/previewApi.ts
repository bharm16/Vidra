/**
 * Preview API
 *
 * API client for image preview generation
 */

import { z } from "zod";
import { apiClient } from "@/services/ApiClient";
import { API_CONFIG } from "@/config/api.config";
import { buildFirebaseAuthHeaders } from "@/services/http/firebaseAuth";
import { logger } from "@/services/LoggingService";
import { sanitizeError } from "@/utils/logging";
import { extractMotionMeta } from "@/utils/motion";
import { safeUrlHost } from "@/utils/url";
import {
  FaceSwapPreviewResponseSchema,
  GeneratePreviewResponseSchema,
  GenerateStoryboardPreviewResponseSchema,
  GenerateVideoResponseSchema,
  MediaViewUrlBatchItemSchema,
  MediaViewUrlBatchResponseSchema,
  MediaViewUrlResponseSchema,
  UploadPreviewImageResponseSchema,
  VideoJobStatusResponseSchema,
} from "./schemas";
import type { ImagePreviewSpeedMode } from "@shared/schemas/preview.schemas";

const log = logger.child("previewApi");
const VIDEO_OPERATION = "generateVideoPreview";
const PREVIEW_IMAGE_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const PREVIEW_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

function requireNonEmptyString(
  value: unknown,
  name: string,
): asserts value is string {
  if (!value || typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} is required and must be a non-empty string`);
  }
}

function generateIdempotencyKey(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  const randomPart = Math.random().toString(36).slice(2);
  return `video-${Date.now()}-${randomPart}`;
}

export type PreviewProvider =
  | "replicate-flux-schnell"
  | "replicate-flux-kontext-fast"
  | "auto";

export type PreviewSpeedMode = ImagePreviewSpeedMode;

export interface GeneratePreviewRequest {
  prompt: string;
  aspectRatio?: string;
  provider?: PreviewProvider;
  inputImageUrl?: string;
  seed?: number;
  speedMode?: PreviewSpeedMode;
  outputQuality?: number;
}

// Response types are derived from canonical Zod schemas so the inferred TS
// type cannot drift from runtime parsing. Field-level docs live in
// shared/schemas/preview.schemas.ts.
export type GeneratePreviewResponse = z.infer<
  typeof GeneratePreviewResponseSchema
>;

export type UploadPreviewImageResponse = z.infer<
  typeof UploadPreviewImageResponseSchema
>;

export type PreviewImageValidationResult =
  | { valid: true }
  | { valid: false; error: string };

export function validatePreviewImageFile(
  file: File,
): PreviewImageValidationResult {
  if (!PREVIEW_IMAGE_ALLOWED_TYPES.has(file.type)) {
    return {
      valid: false,
      error: "Only PNG, JPEG, and WebP files are supported.",
    };
  }
  if (file.size > PREVIEW_IMAGE_MAX_BYTES) {
    return { valid: false, error: "Image must be 10MB or smaller." };
  }
  return { valid: true };
}

export interface GenerateStoryboardPreviewRequest {
  prompt: string;
  aspectRatio?: string;
  seedImageUrl?: string;
  speedMode?: PreviewSpeedMode;
  seed?: number;
  // ISSUE-12: when both provided, the server appends the generation to the
  // named session version so the client can render it from a session refetch
  // instead of an optimistic local dispatch.
  sessionId?: string;
  promptVersionId?: string;
}

// ISSUE-37: derive from the canonical Zod schema so the inferred TS type
// cannot drift from runtime parsing. Field-level docs (generationId,
// remainingCredits, …) live in shared/schemas/preview.schemas.ts.
export type GenerateStoryboardPreviewResponse = z.infer<
  typeof GenerateStoryboardPreviewResponseSchema
>;

export type MediaViewUrlResponse = z.infer<typeof MediaViewUrlResponseSchema>;

export type FaceSwapPreviewResponse = z.infer<
  typeof FaceSwapPreviewResponseSchema
>;

/**
 * Generate a preview image from a prompt
 *
 * @param prompt - The prompt text to generate an image from
 * @param aspectRatio - Optional aspect ratio (default: "16:9")
 * @returns Promise resolving to the preview response
 */
export async function generatePreview(
  prompt: string,
  options?: string | Omit<GeneratePreviewRequest, "prompt">,
): Promise<GeneratePreviewResponse> {
  requireNonEmptyString(prompt, "Prompt");

  const resolvedOptions: Omit<GeneratePreviewRequest, "prompt"> | undefined =
    typeof options === "string" ? { aspectRatio: options } : options;
  const inputImageUrl = resolvedOptions?.inputImageUrl?.trim();
  const isKontext =
    resolvedOptions?.provider === "replicate-flux-kontext-fast" ||
    Boolean(inputImageUrl);

  const payload = (await apiClient.post(
    "/preview/generate",
    {
      prompt: prompt.trim(),
      ...(resolvedOptions?.aspectRatio
        ? { aspectRatio: resolvedOptions.aspectRatio }
        : {}),
      ...(resolvedOptions?.provider
        ? { provider: resolvedOptions.provider }
        : {}),
      ...(inputImageUrl ? { inputImageUrl } : {}),
      ...(resolvedOptions?.seed !== undefined
        ? { seed: resolvedOptions.seed }
        : {}),
      ...(resolvedOptions?.speedMode
        ? { speedMode: resolvedOptions.speedMode }
        : {}),
      ...(resolvedOptions?.outputQuality !== undefined
        ? { outputQuality: resolvedOptions.outputQuality }
        : {}),
    },
    {
      ...(isKontext ? { timeout: 60000 } : {}),
      headers: {
        "Idempotency-Key": generateIdempotencyKey(),
      },
    },
  )) as unknown;

  return GeneratePreviewResponseSchema.parse(payload);
}

/**
 * Generate a storyboard preview (base frame + chained edits)
 */
export async function generateStoryboardPreview(
  prompt: string,
  options?: Omit<GenerateStoryboardPreviewRequest, "prompt">,
): Promise<GenerateStoryboardPreviewResponse> {
  requireNonEmptyString(prompt, "Prompt");

  const seedImageUrl = options?.seedImageUrl?.trim();

  const payload = (await apiClient.post(
    "/preview/generate/storyboard",
    {
      prompt: prompt.trim(),
      ...(options?.aspectRatio ? { aspectRatio: options.aspectRatio } : {}),
      ...(seedImageUrl ? { seedImageUrl } : {}),
      ...(options?.speedMode ? { speedMode: options.speedMode } : {}),
      ...(options?.seed !== undefined ? { seed: options.seed } : {}),
      ...(options?.sessionId ? { sessionId: options.sessionId } : {}),
      ...(options?.promptVersionId
        ? { promptVersionId: options.promptVersionId }
        : {}),
    },
    {
      timeout: API_CONFIG.timeout.storyboard,
      headers: {
        "Idempotency-Key": generateIdempotencyKey(),
      },
    },
  )) as unknown;

  return GenerateStoryboardPreviewResponseSchema.parse(payload);
}

export async function faceSwapPreview(options: {
  characterAssetId: string;
  targetImageUrl: string;
  aspectRatio?: string;
}): Promise<FaceSwapPreviewResponse> {
  requireNonEmptyString(options?.characterAssetId, "characterAssetId");
  requireNonEmptyString(options?.targetImageUrl, "targetImageUrl");

  const payload = (await apiClient.post(
    "/preview/face-swap",
    {
      characterAssetId: options.characterAssetId.trim(),
      targetImageUrl: options.targetImageUrl.trim(),
      ...(options.aspectRatio ? { aspectRatio: options.aspectRatio } : {}),
    },
    {
      headers: {
        "Idempotency-Key": generateIdempotencyKey(),
      },
    },
  )) as unknown;

  const parsed = FaceSwapPreviewResponseSchema.parse(payload);

  const swapData = parsed.success ? parsed.data : null;
  log.info("Face-swap preview request completed", {
    hasFaceSwapUrl: Boolean(swapData?.faceSwapUrl),
    faceSwapUrlHost: swapData?.faceSwapUrl
      ? safeUrlHost(swapData.faceSwapUrl)
      : null,
    creditsDeducted: swapData?.creditsDeducted ?? null,
  });

  return parsed;
}

export async function getImageAssetViewUrl(
  assetId: string,
): Promise<MediaViewUrlResponse> {
  requireNonEmptyString(assetId, "assetId");

  const encoded = encodeURIComponent(assetId.trim());
  const payload = (await apiClient.get(
    `/preview/image/view?assetId=${encoded}`,
  )) as unknown;
  return MediaViewUrlResponseSchema.parse(payload);
}

export async function getVideoAssetViewUrl(
  assetId: string,
): Promise<MediaViewUrlResponse> {
  requireNonEmptyString(assetId, "assetId");

  const encoded = encodeURIComponent(assetId.trim());
  const payload = (await apiClient.get(
    `/preview/video/view?assetId=${encoded}`,
  )) as unknown;
  return MediaViewUrlResponseSchema.parse(payload);
}

export type BatchViewUrlItem = z.infer<typeof MediaViewUrlBatchItemSchema>;

export type BatchViewUrlResponse = z.infer<
  typeof MediaViewUrlBatchResponseSchema
>;

/**
 * Resolve multiple image asset IDs to signed view URLs in a single request.
 * Falls back to individual requests if the batch endpoint fails.
 */
export async function getImageAssetViewUrlBatch(
  assetIds: string[],
): Promise<BatchViewUrlResponse> {
  if (assetIds.length === 0) {
    return { success: true, data: { results: [] } };
  }

  const payload = (await apiClient.post("/preview/image/view-batch", {
    assetIds,
  })) as unknown;
  return MediaViewUrlBatchResponseSchema.parse(payload);
}

export async function uploadPreviewImage(
  file: File,
  metadata: Record<string, unknown> = {},
  options: { source?: string; label?: string } = {},
): Promise<UploadPreviewImageResponse> {
  const authHeaders = await buildFirebaseAuthHeaders();
  const formData = new FormData();
  formData.append("file", file);
  if (Object.keys(metadata).length > 0) {
    formData.append("metadata", JSON.stringify(metadata));
  }
  if (options.source) {
    formData.append("source", options.source);
  }
  if (options.label) {
    formData.append("label", options.label);
  }

  const response = await fetch(`${API_CONFIG.baseURL}/preview/upload`, {
    method: "POST",
    headers: {
      ...authHeaders,
    },
    body: formData,
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const envelope =
      typeof payload === "object" && payload !== null
        ? (payload as { error?: unknown; message?: unknown })
        : null;
    const message =
      (typeof envelope?.error === "string" ? envelope.error : null) ||
      (typeof envelope?.message === "string" ? envelope.message : null) ||
      "Failed to upload image";
    throw new Error(message);
  }

  if (!payload) {
    return UploadPreviewImageResponseSchema.parse({
      success: false,
      error: "Failed to upload image",
    });
  }

  const parsed = UploadPreviewImageResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return UploadPreviewImageResponseSchema.parse({
      success: false,
      error: "Failed to upload image",
    });
  }

  return parsed.data;
}

export type GenerateVideoResponse = z.infer<typeof GenerateVideoResponseSchema>;

export type VideoJobStatus = "queued" | "processing" | "completed" | "failed";

export type VideoJobStatusResponse = z.infer<
  typeof VideoJobStatusResponseSchema
>;

export interface GenerateVideoPreviewOptions {
  startImage?: string | undefined;
  endImage?: string | undefined;
  referenceImages?: Array<{ url: string; type: "asset" | "style" }> | undefined;
  extendVideoUrl?: string | undefined;
  inputReference?: string | undefined;
  generationParams?: Record<string, unknown> | undefined;
  characterAssetId?: string | undefined;
  autoKeyframe?: boolean | undefined;
  faceSwapAlreadyApplied?: boolean | undefined;
  idempotencyKey?: string | undefined;
  // ISSUE-12: when both provided, the worker's processVideoJob pipeline
  // appends the completed generation to the named session version after
  // markCompleted — makes video generation server-authoritative.
  sessionId?: string | undefined;
  promptVersionId?: string | undefined;
}

/**
 * Generate a preview video from a prompt
 */
export async function generateVideoPreview(
  prompt: string,
  aspectRatio?: string,
  model?: string,
  options?: GenerateVideoPreviewOptions,
): Promise<GenerateVideoResponse> {
  requireNonEmptyString(prompt, "Prompt");
  const trimmedPrompt = prompt.trim();
  const startedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const motionMeta = extractMotionMeta(options?.generationParams);
  const startImageUrlHost = safeUrlHost(options?.startImage);
  const endImageUrlHost = safeUrlHost(options?.endImage);
  const inputReferenceUrlHost = safeUrlHost(options?.inputReference);
  const extendVideoUrlHost = safeUrlHost(options?.extendVideoUrl);

  const payload = {
    prompt: trimmedPrompt,
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(model ? { model } : {}),
    ...(options?.startImage ? { startImage: options.startImage } : {}),
    ...(options?.endImage ? { endImage: options.endImage } : {}),
    ...(options?.referenceImages?.length
      ? { referenceImages: options.referenceImages }
      : {}),
    ...(options?.extendVideoUrl
      ? { extendVideoUrl: options.extendVideoUrl }
      : {}),
    ...(options?.inputReference
      ? { inputReference: options.inputReference }
      : {}),
    ...(options?.generationParams
      ? { generationParams: options.generationParams }
      : {}),
    ...(options?.characterAssetId
      ? { characterAssetId: options.characterAssetId }
      : {}),
    ...(options?.autoKeyframe !== undefined
      ? { autoKeyframe: options.autoKeyframe }
      : {}),
    ...(options?.faceSwapAlreadyApplied
      ? { faceSwapAlreadyApplied: true }
      : {}),
    ...(options?.sessionId ? { sessionId: options.sessionId } : {}),
    ...(options?.promptVersionId
      ? { promptVersionId: options.promptVersionId }
      : {}),
  };
  const idempotencyKey =
    options?.idempotencyKey && options.idempotencyKey.trim().length > 0
      ? options.idempotencyKey.trim()
      : generateIdempotencyKey();

  log.info("Video preview request started", {
    operation: VIDEO_OPERATION,
    promptLength: trimmedPrompt.length,
    aspectRatio: aspectRatio ?? null,
    model: model ?? null,
    hasStartImage: Boolean(options?.startImage),
    startImageUrlHost,
    hasEndImage: Boolean(options?.endImage),
    endImageUrlHost,
    referenceImageCount: options?.referenceImages?.length ?? 0,
    hasExtendVideo: Boolean(options?.extendVideoUrl),
    extendVideoUrlHost,
    hasInputReference: Boolean(options?.inputReference),
    inputReferenceUrlHost,
    hasCharacterAssetId: Boolean(options?.characterAssetId),
    autoKeyframe: options?.autoKeyframe ?? null,
    faceSwapAlreadyApplied: options?.faceSwapAlreadyApplied ?? null,
    ...motionMeta,
  });

  try {
    const responsePayload = (await apiClient.post(
      "/preview/video/generate",
      payload,
      {
        timeout: API_CONFIG.timeout.video,
        headers: {
          "Idempotency-Key": idempotencyKey,
        },
      },
    )) as unknown;

    const response = GenerateVideoResponseSchema.parse(responsePayload);

    const durationMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) -
        startedAt,
    );

    log.info("Video preview request succeeded", {
      operation: VIDEO_OPERATION,
      durationMs,
      success: response.success,
      hasVideoUrl: Boolean(response.videoUrl),
      hasJobId: Boolean(response.jobId),
      jobId: response.jobId ?? null,
      creditsReserved: response.creditsReserved ?? null,
      creditsDeducted: response.creditsDeducted ?? null,
      ...motionMeta,
    });

    return response;
  } catch (error) {
    const durationMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) -
        startedAt,
    );
    const info = sanitizeError(error);
    const errObj = error instanceof Error ? error : new Error(info.message);

    log.error("Video preview request failed", errObj, {
      operation: VIDEO_OPERATION,
      durationMs,
      promptLength: trimmedPrompt.length,
      aspectRatio: aspectRatio ?? null,
      model: model ?? null,
      hasStartImage: Boolean(options?.startImage),
      startImageUrlHost,
      hasEndImage: Boolean(options?.endImage),
      endImageUrlHost,
      referenceImageCount: options?.referenceImages?.length ?? 0,
      hasExtendVideo: Boolean(options?.extendVideoUrl),
      extendVideoUrlHost,
      hasInputReference: Boolean(options?.inputReference),
      inputReferenceUrlHost,
      hasCharacterAssetId: Boolean(options?.characterAssetId),
      autoKeyframe: options?.autoKeyframe ?? null,
      faceSwapAlreadyApplied: options?.faceSwapAlreadyApplied ?? null,
      errorName: info.name,
      ...motionMeta,
    });
    throw errObj;
  }
}

export async function getVideoPreviewStatus(
  jobId: string,
): Promise<VideoJobStatusResponse> {
  if (!jobId || typeof jobId !== "string") {
    throw new Error("jobId is required");
  }

  const payload = (await apiClient.get(`/preview/video/jobs/${jobId}`, {
    fetchOptions: {
      cache: "no-store",
    },
  })) as unknown;

  return VideoJobStatusResponseSchema.parse(payload);
}
