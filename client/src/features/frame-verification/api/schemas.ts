/**
 * Wire schemas for the frame-verification API.
 *
 * Validation boundary (not a transform): the client shape matches the
 * server DTO, so responses are Zod-validated at the wire and passed through.
 */

import { z } from 'zod';

export const SpanVerdictValueSchema = z.enum([
  'present',
  'absent',
  'uncertain',
]);

export const FrameVerificationSpanSchema = z.object({
  text: z.string(),
  category: z.string(),
  start: z.number().int().optional(),
  end: z.number().int().optional(),
});

export const SpanVerdictSchema = z.object({
  span: FrameVerificationSpanSchema,
  verdict: SpanVerdictValueSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.string().optional(),
});

export const FrameVerificationDataSchema = z.object({
  verdicts: z.array(SpanVerdictSchema),
  model: z.string(),
  durationMs: z.number(),
});

export const FrameVerificationResponseSchema = z.union([
  z.object({
    success: z.literal(true),
    data: FrameVerificationDataSchema,
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
    details: z.string().optional(),
  }),
]);

export type SpanVerdictValue = z.infer<typeof SpanVerdictValueSchema>;
export type FrameVerificationSpan = z.infer<typeof FrameVerificationSpanSchema>;
export type SpanVerdict = z.infer<typeof SpanVerdictSchema>;
export type FrameVerificationData = z.infer<typeof FrameVerificationDataSchema>;
export type FrameVerificationResponse = z.infer<
  typeof FrameVerificationResponseSchema
>;
