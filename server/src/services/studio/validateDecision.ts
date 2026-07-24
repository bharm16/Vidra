/**
 * Referential validation of an LLM StudioDecision — the checks
 * StructuredOutputEnforcer's JSON-shape pass cannot do (plan: "Input
 * validation beyond JSON shape"). Violations take the schema-retry path:
 * the caller treats them exactly like malformed JSON and re-asks the LLM.
 *
 * Pure function: decision + the set of image ids that exist in THIS
 * project in, verdict out. Runs before any spend reservation or image call.
 */

import type { StudioDecision } from "./types";

export const MAX_EDIT_SOURCE_IMAGES = 14; // nano-banana-2 image_input limit
export const MAX_CLARIFY_QUESTIONS = 2; // behavior 1

export type DecisionValidation = { ok: true } | { ok: false; reason: string };

export function validateDecisionReferences(
  decision: StudioDecision,
  projectImageIds: ReadonlySet<string>,
): DecisionValidation {
  switch (decision.action) {
    case "clarify": {
      if (decision.questions.length === 0) {
        return { ok: false, reason: "clarify carries no questions" };
      }
      if (decision.questions.length > MAX_CLARIFY_QUESTIONS) {
        return {
          ok: false,
          reason: `clarify exceeds ${MAX_CLARIFY_QUESTIONS} questions`,
        };
      }
      return { ok: true };
    }
    case "edit": {
      if (decision.sourceImageIds.length === 0) {
        return { ok: false, reason: "edit carries no sourceImageIds" };
      }
      if (decision.sourceImageIds.length > MAX_EDIT_SOURCE_IMAGES) {
        return {
          ok: false,
          reason: `edit exceeds ${MAX_EDIT_SOURCE_IMAGES} source images`,
        };
      }
      const missing = decision.sourceImageIds.filter(
        (id) => !projectImageIds.has(id),
      );
      if (missing.length > 0) {
        return {
          ok: false,
          reason: `edit references images not in this project: ${missing.join(", ")}`,
        };
      }
      return { ok: true };
    }
    case "transform": {
      if (!projectImageIds.has(decision.sourceImageId)) {
        return {
          ok: false,
          reason: `transform references an image not in this project: ${decision.sourceImageId}`,
        };
      }
      return { ok: true };
    }
    case "generate":
    case "diagnose":
    case "negotiate":
      return { ok: true };
  }
}
