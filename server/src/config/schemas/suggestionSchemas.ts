/**
 * Suggestion Validation Schemas
 *
 * Zod schemas for validating enhancement suggestion requests.
 */

import { z } from "zod";
import { SPAN_CONTEXT_LIMITS } from "@config/spanContextLimits";

const spanTextSchema = z.string().min(1).max(SPAN_CONTEXT_LIMITS.maxTextLength)
  .refine((text) => text.trim().length > 0, "Span text must not be blank");
const spanCategorySchema = z.string().min(1).max(SPAN_CONTEXT_LIMITS.maxCategoryLength);

const labeledSpanSchema = z.object({
  text: spanTextSchema,
  role: spanCategorySchema,
  category: spanCategorySchema.optional(),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  confidence: z.number().min(0).max(1).optional(),
});

const nearbySpanSchema = z.object({
  text: spanTextSchema,
  role: spanCategorySchema,
  category: spanCategorySchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  distance: z.number().int().min(0).max(SPAN_CONTEXT_LIMITS.maxPromptLength),
  position: z.enum(["before", "after"]),
  start: z.number().int().min(0).optional(),
  end: z.number().int().min(0).optional(),
});

const editHistoryItemSchema = z.object({
  original: z.string().min(1),
  replacement: z.string().min(1),
  category: z.string().nullable().optional(),
  timestamp: z.number().optional(),
});

export const suggestionSchema = z.object({
  highlightedText: z
    .string()
    .min(1, "Highlighted text is required")
    .max(10000, "Highlighted text must not exceed 10,000 characters"),
  contextBefore: z.string().max(5000).optional(),
  contextAfter: z.string().max(5000).optional(),
  fullPrompt: z
    .string()
    .min(1, "Full prompt is required")
    .max(50000, "Full prompt must not exceed 50,000 characters"),
  originalUserPrompt: z.string().max(10000).optional(),
  highlightedCategory: z.string().max(200).nullable().optional(),
  highlightedCategoryConfidence: z.number().min(0).max(1).nullable().optional(),
  highlightedPhrase: z.string().max(1000).nullable().optional(),
  brainstormContext: z
    .looseObject({
      version: z.string().optional(),
      createdAt: z.number().optional(),
      elements: z
        .looseObject({
          subject: z.string().nullable().optional(),
          action: z.string().nullable().optional(),
          location: z.string().nullable().optional(),
          time: z.string().nullable().optional(),
          mood: z.string().nullable().optional(),
          style: z.string().nullable().optional(),
          event: z.string().nullable().optional(),
        })
        .optional(),
      metadata: z
        .looseObject({
          format: z.string().nullable().optional(),
          technicalParams: z.record(z.string(), z.unknown()).optional(),
          validationScore: z.unknown().optional(),
          history: z.array(z.unknown()).optional(),
        })
        .optional(),
    })
    .optional()
    .nullable(),
  allLabeledSpans: z.array(labeledSpanSchema).max(SPAN_CONTEXT_LIMITS.maxSpans).optional(),
  nearbySpans: z.array(nearbySpanSchema).max(SPAN_CONTEXT_LIMITS.maxSpans).optional(),
  editHistory: z.array(editHistoryItemSchema).max(50).optional(),
}).superRefine((request, ctx) => {
  for (const field of ["allLabeledSpans", "nearbySpans"] as const) {
    for (const [index, span] of (request[field] ?? []).entries()) {
      const { start, end } = span;
      if (start === undefined && end === undefined) continue;
      if (start === undefined || end === undefined || end <= start || end > request.fullPrompt.length) {
        ctx.addIssue({
          code: "custom",
          path: [field, index, "end"],
          message: "Span offsets must form a nonempty range within fullPrompt",
        });
      }
    }
  }
});

export const customSuggestionSchema = z.object({
  highlightedText: z
    .string()
    .min(1, "Highlighted text is required")
    .max(10000, "Highlighted text must not exceed 10,000 characters"),
  contextBefore: z.string().max(5000).optional(),
  contextAfter: z.string().max(5000).optional(),
  customRequest: z
    .string()
    .min(1, "Custom request is required")
    .max(1000, "Custom request must not exceed 1,000 characters"),
  fullPrompt: z
    .string()
    .min(1, "Full prompt is required")
    .max(50000, "Full prompt must not exceed 50,000 characters"),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

export const sceneChangeSchema = z.object({
  changedField: z.string().min(1),
  newValue: z
    .string()
    .min(1)
    .max(10000, "New value must not exceed 10,000 characters"),
  oldValue: z
    .string()
    .max(10000, "Old value must not exceed 10,000 characters")
    .nullable()
    .optional(),
  fullPrompt: z
    .string()
    .min(1)
    .max(50000, "Full prompt must not exceed 50,000 characters"),
  affectedFields: z.record(z.string(), z.unknown()).optional(),
  sectionHeading: z.string().max(200).nullable().optional(),
  sectionContext: z.string().max(5000).nullable().optional(),
});

export type SuggestionRequest = z.infer<typeof suggestionSchema>;
export type CustomSuggestionRequest = z.infer<typeof customSuggestionSchema>;
export type SceneChangeRequest = z.infer<typeof sceneChangeSchema>;
