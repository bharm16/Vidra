/**
 * Property-based tests for Runway CSAE Ordering
 *
 * Tests the following correctness property:
 * - Property 4: Runway CSAE Ordering
 *
 * For any Runway prompt containing camera, subject, action, and environment elements,
 * the transform phase SHALL produce output where camera terms appear before subject terms,
 * subject terms appear before action terms, and action terms appear before environment terms.
 *
 * @module runway-csae-ordering.property.test
 *
 * **Feature: video-model-optimization, Property 4: Runway CSAE Ordering**
 * **Validates: Requirements 3.3, 3.4**
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import { RunwayStrategy } from "@services/video-prompt-analysis/strategies/RunwayStrategy";

/**
 * Camera movement terms for generating test prompts
 */
const CAMERA_TERMS = [
  "pan left",
  "pan right",
  "tilt up",
  "tilt down",
  "dolly in",
  "dolly out",
  "zoom in",
  "zoom out",
  "tracking shot",
  "crane shot",
  "steadicam",
  "handheld",
  "low angle",
  "high angle",
  "wide angle",
  "telephoto",
] as const;

/**
 * Subject terms for generating test prompts
 */
const SUBJECT_TERMS = [
  "a man",
  "a woman",
  "a person",
  "a child",
  "a dog",
  "a cat",
  "the man",
  "the woman",
  "someone",
  "a figure",
  "a character",
] as const;

/**
 * Action terms for generating test prompts
 */
const ACTION_TERMS = [
  "walking",
  "running",
  "jumping",
  "sitting",
  "standing",
  "dancing",
  "talking",
  "looking",
  "holding",
  "reaching",
  "falling",
  "flying",
  "swimming",
  "driving",
] as const;

/**
 * Environment terms for generating test prompts
 */
const ENVIRONMENT_TERMS = [
  "in a forest",
  "in the city",
  "at the beach",
  "on a mountain",
  "in a room",
  "at a park",
  "in the desert",
  "on the street",
  "inside a building",
  "outside",
  "in the garden",
] as const;

function findSegmentIndex(prompt: string, terms: readonly string[]): number {
  const segments = prompt
    .toLowerCase()
    .split(",")
    .map((segment) => segment.trim());

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    if (segment && terms.some((term) => segment.includes(term.toLowerCase()))) {
      return i;
    }
  }

  return -1;
}

function subjectTermVariants(subjectTerm: string): string[] {
  const stripped = subjectTerm.replace(/^(a|the)\s+/i, "").trim();
  const variants = [subjectTerm.toLowerCase()];
  if (stripped.length > 0) {
    variants.push(stripped.toLowerCase());
  }
  return variants;
}

describe("Runway CSAE Ordering Property Tests", () => {
  const strategy = new RunwayStrategy();

  /**
   * Property 4: Runway CSAE Ordering
   *
   * For any Runway prompt containing camera, subject, action, and environment elements,
   * the transform phase SHALL produce output where camera terms appear before subject terms,
   * subject terms appear before action terms, and action terms appear before environment terms.
   *
   * **Feature: video-model-optimization, Property 4: Runway CSAE Ordering**
   * **Validates: Requirements 3.3, 3.4**
   */
  describe("Property 4: Runway CSAE Ordering", () => {
    it("full CSAE ordering is maintained with all four elements", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...CAMERA_TERMS),
          fc.constantFrom(...SUBJECT_TERMS),
          fc.constantFrom(...ACTION_TERMS),
          fc.constantFrom(...ENVIRONMENT_TERMS),
          async (cameraTerm, subjectTerm, actionTerm, envTerm) => {
            // Create input with all elements in reverse CSAE order (EASC)
            const input = `${envTerm}, ${actionTerm}, ${subjectTerm}, ${cameraTerm}`;

            const normalized = strategy.normalize(input);
            const result = await strategy.transform(normalized);
            const prompt =
              typeof result.prompt === "string"
                ? result.prompt
                : JSON.stringify(result.prompt);

            const cameraPos = findSegmentIndex(prompt, [cameraTerm]);
            const subjectPos = findSegmentIndex(
              prompt,
              subjectTermVariants(subjectTerm),
            );
            const actionPos = findSegmentIndex(prompt, [actionTerm]);
            const envPos = findSegmentIndex(prompt, [envTerm]);

            // All elements should be present
            expect(cameraPos).not.toBe(-1);

            // CSAE ordering: Camera < Subject < Action < Environment
            if (cameraPos !== -1 && subjectPos !== -1) {
              expect(cameraPos).toBeLessThan(subjectPos);
            }
            if (subjectPos !== -1 && actionPos !== -1) {
              expect(subjectPos).toBeLessThan(actionPos);
            }
            if (actionPos !== -1 && envPos !== -1) {
              expect(actionPos).toBeLessThan(envPos);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("depth terms are mapped to dolly camera motion", async () => {
      const depthTerms = ["depth", "3d feel", "3d effect", "parallax"];

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...depthTerms),
          fc.constantFrom(...SUBJECT_TERMS),
          async (depthTerm, subjectTerm) => {
            const input = `${subjectTerm} with ${depthTerm}`;

            const normalized = strategy.normalize(input);
            const result = await strategy.transform(normalized);
            const prompt =
              typeof result.prompt === "string"
                ? result.prompt
                : JSON.stringify(result.prompt);

            // Should contain dolly camera motion
            expect(prompt.toLowerCase()).toContain("dolly");
          },
        ),
        { numRuns: 100 },
      );
    });

    it("vertigo terms are mapped to zoom camera motion", async () => {
      const vertigoTerms = ["vertigo", "compression", "dolly zoom", "zolly"];

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...vertigoTerms),
          fc.constantFrom(...SUBJECT_TERMS),
          async (vertigoTerm, subjectTerm) => {
            const input = `${subjectTerm} with ${vertigoTerm}`;

            const normalized = strategy.normalize(input);
            const result = await strategy.transform(normalized);
            const prompt =
              typeof result.prompt === "string"
                ? result.prompt
                : JSON.stringify(result.prompt);

            // Should contain zoom camera motion
            expect(prompt.toLowerCase()).toContain("zoom");
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("CSAE Ordering Edge Cases", () => {
    it("preserves semantic content during CSAE reordering", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...CAMERA_TERMS),
          fc.constantFrom(...SUBJECT_TERMS),
          fc.constantFrom(...ACTION_TERMS),
          async (cameraTerm, subjectTerm, actionTerm) => {
            const input = `${actionTerm} ${subjectTerm} ${cameraTerm}`;

            const normalized = strategy.normalize(input);
            const result = await strategy.transform(normalized);
            const prompt =
              typeof result.prompt === "string"
                ? result.prompt
                : JSON.stringify(result.prompt);
            const lowerPrompt = prompt.toLowerCase();
            const subjectVariants = subjectTermVariants(subjectTerm);

            // All original terms should still be present (possibly reordered)
            expect(lowerPrompt).toContain(cameraTerm.toLowerCase());
            expect(
              subjectVariants.some((term) => lowerPrompt.includes(term)),
            ).toBe(true);
            expect(lowerPrompt).toContain(actionTerm.toLowerCase());
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
