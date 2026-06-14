/**
 * Prompt Validation Schemas
 *
 * Zod schemas for validating prompt optimization requests.
 */

import { z } from "zod";
import { LockedSpanSchema } from "@shared/schemas/optimization.schemas";

export const promptSchema = z.object({
  prompt: z
    .string()
    .min(1, "Prompt is required")
    .max(10000, "Prompt must not exceed 10,000 characters"),
  mode: z.enum(["video"]).optional().default("video"),
  targetModel: z
    .string()
    .max(64, "Target model must not exceed 64 characters")
    .optional()
    .nullable(),
  context: z
    .object({
      specificAspects: z.string().max(5000).optional(),
      backgroundLevel: z.string().max(1000).optional(),
      intendedUse: z.string().max(1000).optional(),
    })
    .optional()
    .nullable(),
  brainstormContext: z
    .object({
      elements: z.record(z.string(), z.unknown()).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
      version: z.string().optional(),
      createdAt: z.number().optional(),
    })
    .optional()
    .nullable(),
  generationParams: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional()
    .nullable(),
  startImage: z
    .string()
    .max(10000, "startImage must not exceed 10,000 characters")
    .optional(),
  sourcePrompt: z
    .string()
    .max(10000, "sourcePrompt must not exceed 10,000 characters")
    .optional(),
  skipCache: z.boolean().optional().default(false),
  lockedSpans: z.array(LockedSpanSchema).optional().default([]),
});

export type PromptRequest = z.infer<typeof promptSchema>;

export const compileSchema = z
  .object({
    prompt: z
      .string()
      .min(1, "Prompt must not be empty")
      .max(10000, "Prompt must not exceed 10,000 characters")
      .optional(),
    artifactKey: z
      .string()
      .min(1, "artifactKey must not be empty")
      .max(256, "artifactKey must not exceed 256 characters")
      .optional(),
    targetModel: z
      .string()
      .min(1, "Target model is required")
      .max(64, "Target model must not exceed 64 characters"),
    context: z
      .object({
        originalPrompt: z.string().max(10000).optional(),
        originalUserPrompt: z.string().max(10000).optional(),
        specificAspects: z.string().max(5000).optional(),
        backgroundLevel: z.string().max(1000).optional(),
        intendedUse: z.string().max(1000).optional(),
        constraints: z.record(z.string(), z.unknown()).optional(),
        apiParams: z.record(z.string(), z.unknown()).optional(),
        assets: z.array(z.record(z.string(), z.unknown())).max(20).optional(),
      })
      .optional()
      .nullable(),
  })
  .superRefine((value, ctx) => {
    const hasPrompt =
      typeof value.prompt === "string" && value.prompt.trim().length > 0;
    const hasArtifactKey =
      typeof value.artifactKey === "string" &&
      value.artifactKey.trim().length > 0;

    if (!hasPrompt && !hasArtifactKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["prompt"],
        message: "Either prompt or artifactKey is required",
      });
    }
  });

export type CompileRequest = z.infer<typeof compileSchema>;
