/**
 * Zod schemas for preview / video-generation API responses.
 *
 * Canonical source — client features import from here (directly or via
 * re-export).  Used in contract tests to validate server payloads.
 * `.passthrough()` allows forward-compatible additions.
 */
import { z } from "zod";
import { ApiErrorCodeSchema } from "./api.schemas.js";
import type { ApiErrorCode } from "../types/api.js";

/**
 * Image-preview speed modes — the user-facing latency/quality tiers a creator
 * picks for a first-frame preview, sent as `speedMode` on a generate-preview
 * request. Canonical across client and server: the client offers exactly these
 * and the server validates against them, so they must never drift. Derive the
 * type, the Zod enum, validation Sets, and option strings from this one array.
 */
export const IMAGE_PREVIEW_SPEED_MODES = [
  "Lightly Juiced",
  "Juiced",
  "Extra Juiced",
  "Real Time",
] as const;

export const ImagePreviewSpeedModeSchema = z.enum(IMAGE_PREVIEW_SPEED_MODES);

export type ImagePreviewSpeedMode = z.infer<typeof ImagePreviewSpeedModeSchema>;

// ---------------------------------------------------------------------------
// Preview response envelope
// ---------------------------------------------------------------------------

/**
 * Preview's error arm: the canonical ApiResponse error shape plus the legacy
 * `message` field the preview handlers emit alongside `error`. `error` is
 * always present on the wire (verified across every handler emission).
 */
const PreviewErrorArmSchema = z
  .object({
    success: z.literal(false),
    error: z.string(),
    message: z.string().optional(),
    code: ApiErrorCodeSchema.optional(),
    details: z.string().optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

/**
 * Canonical discriminated envelope for preview endpoints. Mirrors
 * `ApiResponseSchema` (api.schemas.ts) with the preview error arm above.
 * `data` is required on success — every handler sends it.
 */
const previewEnvelope = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.discriminatedUnion("success", [
    z
      .object({
        success: z.literal(true),
        data: dataSchema,
        requestId: z.string().optional(),
      })
      .passthrough(),
    PreviewErrorArmSchema,
  ]);

/** Server-side pinning type for preview handler responses (pairs with
 *  `previewEnvelope`; keep the two in sync). */
export type PreviewApiResponse<T> =
  | { success: true; data: T; requestId?: string }
  | {
      success: false;
      error: string;
      message?: string;
      code?: ApiErrorCode;
      details?: string;
      requestId?: string;
    };

const PreviewMetadataSchema = z.object({
  aspectRatio: z.string(),
  model: z.string(),
  duration: z.number(),
  generatedAt: z.string(),
});

export const GeneratePreviewResponseSchema = previewEnvelope(
  z.object({
    imageUrl: z.string(),
    storagePath: z.string().optional(),
    viewUrl: z.string().optional(),
    viewUrlExpiresAt: z.string().optional(),
    sizeBytes: z.number().optional(),
    metadata: PreviewMetadataSchema,
    // Present when the picture was persisted as a session generation record
    // (client supplied sessionId + promptVersionId) — so it can be a node in
    // the space (ADR-0013 / M5 D4). Absent for anonymous quick pictures.
    generationId: z.string().optional(),
  }),
);

export const UploadPreviewImageResponseSchema = previewEnvelope(
  z.object({
    imageUrl: z.string(),
    storagePath: z.string().optional(),
    viewUrl: z.string().optional(),
    viewUrlExpiresAt: z.string().optional(),
    sizeBytes: z.number().optional(),
    contentType: z.string().optional(),
  }),
);

export const GenerateStoryboardPreviewResponseSchema = z.discriminatedUnion(
  "success",
  [
    z
      .object({
        success: z.literal(true),
        data: z.object({
          imageUrls: z.array(z.string()),
          storagePaths: z.array(z.string()).optional(),
          deltas: z.array(z.string()),
          baseImageUrl: z.string(),
          // ISSUE-12: present when the server persisted the generation into
          // the named session version. Absent for legacy (no-session) POSTs.
          generationId: z.string().optional(),
        }),
        // Server-authoritative post-billing balance. The client uses this to
        // refresh its credit pill in one round-trip after a successful
        // storyboard preview, falling back to a /payment/credits/balance
        // fetch when the field is absent. Mirrors GenerateVideoResponseSchema
        // (ISSUE-37).
        remainingCredits: z.number().optional(),
        requestId: z.string().optional(),
      })
      .passthrough(),
    PreviewErrorArmSchema,
  ],
);

export const MediaViewUrlResponseSchema = previewEnvelope(
  z.object({
    viewUrl: z.string(),
    expiresAt: z.string().optional(),
    storagePath: z.string().optional(),
    assetId: z.string().optional(),
    source: z.string().optional(),
  }),
);

export const MediaViewUrlBatchItemSchema = z.object({
  assetId: z.string(),
  viewUrl: z.string().nullable(),
  error: z.string().optional(),
});

export const MediaViewUrlBatchResponseSchema = previewEnvelope(
  z.object({
    results: z.array(MediaViewUrlBatchItemSchema),
  }),
);

export const FaceSwapPreviewResponseSchema = previewEnvelope(
  z.object({
    faceSwapUrl: z.string(),
    creditsDeducted: z.number(),
  }),
);

export const GenerateVideoResponseSchema = z
  .object({
    // Discriminant: this schema describes the success body only. The server
    // hardcodes success:true here; failures return non-2xx and are thrown by
    // the client transport before reaching this parse, so a literal is correct
    // and prevents a success:false body from masquerading as a success.
    success: z.literal(true),
    videoUrl: z.string().optional(),
    assetId: z.string().optional(),
    storagePath: z.string().optional(),
    viewUrl: z.string().optional(),
    viewUrlExpiresAt: z.string().optional(),
    sizeBytes: z.number().optional(),
    inputMode: z.enum(["t2v", "i2v"]).optional(),
    startImageUrl: z.string().optional(),
    resolvedAspectRatio: z.string().optional(),
    jobId: z.string().optional(),
    status: z.enum(["queued", "processing", "completed", "failed"]).optional(),
    creditsReserved: z.number().optional(),
    creditsDeducted: z.number().optional(),
    remainingCredits: z.number().optional(),
    keyframeGenerated: z.boolean().optional(),
    keyframeUrl: z.string().nullish(),
    faceSwapApplied: z.boolean().optional(),
    faceSwapUrl: z.string().nullish(),
    error: z.string().optional(),
    message: z.string().optional(),
  })
  .passthrough();

export const VideoJobStatusResponseSchema = z
  .object({
    // Intentionally a boolean, NOT z.literal(true) (cf. GenerateVideoResponse).
    // pollJobStatus has explicit graceful-degradation handling for success:false
    // (`if (!status.success) throw status.error ...`). A literal would turn that
    // into a zod parse error instead of surfacing the server's message, so the
    // permissive shape is deliberate here.
    success: z.boolean(),
    jobId: z.string(),
    status: z.enum(["queued", "processing", "completed", "failed"]),
    requestId: z.string().optional(),
    progress: z.number().nullable().optional(),
    createdAtMs: z.number().optional(),
    videoUrl: z.string().optional(),
    assetId: z.string().optional(),
    contentType: z.string().optional(),
    storagePath: z.string().optional(),
    viewUrl: z.string().optional(),
    viewUrlExpiresAt: z.string().optional(),
    sizeBytes: z.number().optional(),
    inputMode: z.enum(["t2v", "i2v"]).optional(),
    startImageUrl: z.string().optional(),
    resolvedAspectRatio: z.string().optional(),
    serverTimeoutMs: z.number().optional(),
    suggestedPollIntervalMs: z.number().optional(),
    creditsReserved: z.number().optional(),
    creditsDeducted: z.number().optional(),
    error: z.string().optional(),
    message: z.string().optional(),
  })
  .passthrough();
