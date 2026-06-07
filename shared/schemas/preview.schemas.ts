/**
 * Zod schemas for preview / video-generation API responses.
 *
 * Canonical source — client features import from here (directly or via
 * re-export).  Used in contract tests to validate server payloads.
 * `.passthrough()` allows forward-compatible additions.
 */
import { z } from "zod";

const PreviewMetadataSchema = z.object({
  aspectRatio: z.string(),
  model: z.string(),
  duration: z.number(),
  generatedAt: z.string(),
});

export const GeneratePreviewResponseSchema = z
  .object({
    success: z.boolean(),
    data: z
      .object({
        imageUrl: z.string(),
        storagePath: z.string().optional(),
        viewUrl: z.string().optional(),
        viewUrlExpiresAt: z.string().optional(),
        sizeBytes: z.number().optional(),
        metadata: PreviewMetadataSchema,
      })
      .optional(),
    error: z.string().optional(),
    message: z.string().optional(),
  })
  .passthrough();

export const UploadPreviewImageResponseSchema = z
  .object({
    success: z.boolean(),
    data: z
      .object({
        imageUrl: z.string(),
        storagePath: z.string().optional(),
        viewUrl: z.string().optional(),
        viewUrlExpiresAt: z.string().optional(),
        sizeBytes: z.number().optional(),
        contentType: z.string().optional(),
      })
      .optional(),
    error: z.string().optional(),
    message: z.string().optional(),
  })
  .passthrough();

export const GenerateStoryboardPreviewResponseSchema = z
  .object({
    success: z.boolean(),
    data: z
      .object({
        imageUrls: z.array(z.string()),
        storagePaths: z.array(z.string()).optional(),
        deltas: z.array(z.string()),
        baseImageUrl: z.string(),
        // ISSUE-12: present when the server persisted the generation into the
        // named session version. Absent for legacy (no-session) POSTs.
        generationId: z.string().optional(),
      })
      .optional(),
    // Server-authoritative post-billing balance. The client uses this to
    // refresh its credit pill in one round-trip after a successful
    // storyboard preview, falling back to a /payment/credits/balance fetch
    // when the field is absent. Mirrors GenerateVideoResponseSchema (ISSUE-37).
    remainingCredits: z.number().optional(),
    error: z.string().optional(),
    message: z.string().optional(),
  })
  .passthrough();

export const MediaViewUrlResponseSchema = z
  .object({
    success: z.boolean(),
    data: z
      .object({
        viewUrl: z.string(),
        expiresAt: z.string().optional(),
        storagePath: z.string().optional(),
        assetId: z.string().optional(),
        source: z.string().optional(),
      })
      .optional(),
    error: z.string().optional(),
    message: z.string().optional(),
  })
  .passthrough();

export const MediaViewUrlBatchItemSchema = z.object({
  assetId: z.string(),
  viewUrl: z.string().nullable(),
  error: z.string().optional(),
});

export const MediaViewUrlBatchResponseSchema = z
  .object({
    success: z.boolean(),
    data: z
      .object({
        results: z.array(MediaViewUrlBatchItemSchema),
      })
      .optional(),
    error: z.string().optional(),
  })
  .passthrough();

export const FaceSwapPreviewResponseSchema = z
  .object({
    success: z.boolean(),
    data: z
      .object({
        faceSwapUrl: z.string(),
        creditsDeducted: z.number(),
      })
      .optional(),
    error: z.string().optional(),
    message: z.string().optional(),
  })
  .passthrough();

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
