/**
 * Suggestion Validation Schemas
 *
 * Zod schemas for validating enhancement suggestion requests.
 */

import { z } from "zod";

const labeledSpanSchema = z.object({
  text: z.string().min(1),
  role: z.string().min(1),
  category: z.string().optional(),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  confidence: z.number().min(0).max(1).optional(),
});

const nearbySpanSchema = z.object({
  text: z.string().min(1),
  role: z.string().min(1),
  category: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  distance: z.number().int().min(0),
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
  allLabeledSpans: z.array(labeledSpanSchema).optional(),
  nearbySpans: z.array(nearbySpanSchema).optional(),
  editHistory: z.array(editHistoryItemSchema).max(50).optional(),
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
