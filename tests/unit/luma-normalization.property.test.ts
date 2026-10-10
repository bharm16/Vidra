/**
 * Property-based tests for Luma Normalization Token Stripping
 *
 * Tests the following correctness property:
 * - Property 3 (Luma): Normalization Token Stripping
 *
 * For any Luma prompt with loop:true API parameter active, the normalize phase
 * SHALL strip "loop" and "seamless" terms.
 *
 * @module luma-normalization.property.test
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import { LumaStrategy } from "@services/video-prompt-analysis/strategies/LumaStrategy";
import type { PromptContext } from "@services/video-prompt-analysis/strategies";

describe("Luma Normalization Property Tests", () => {
  const strategy = new LumaStrategy();

  // Loop terms that should be stripped when loop:true
  const loopTerms = [
    "loop",
    "looping",
    "looped",
    "seamless",
    "seamlessly",
    "infinite",
    "continuous loop",
    "perfect loop",
    "endless",
  ];

  /**
   * Property 3 (Luma): Normalization Token Stripping
   *
   * For any Luma prompt with loop:true API parameter active,
   * the normalize phase SHALL strip "loop" and "seamless" terms.
   *
   * **Feature: video-model-optimization, Property 3 (Luma): Normalization Token Stripping**
   * **Validates: Requirements 4.1, 4.2**
   */
  describe("Property 3 (Luma): Normalization Token Stripping", () => {
    it("is case-insensitive for loop term detection", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...loopTerms),
          fc.constantFrom("upper", "lower", "mixed"),
          (loopTerm, caseType) => {
            let testTerm: string;
            switch (caseType) {
              case "upper":
                testTerm = loopTerm.toUpperCase();
                break;
              case "lower":
                testTerm = loopTerm.toLowerCase();
                break;
              default:
                testTerm =
                  loopTerm.charAt(0).toUpperCase() +
                  loopTerm.slice(1).toLowerCase();
            }

            const input = `video with ${testTerm} effect`;
            const context: PromptContext = {
              userIntent: "test",
              apiParams: { loop: true },
            };

            const result = strategy.normalize(input, context);

            // Term should be stripped regardless of case
            const termRegex = new RegExp(`\\b${loopTerm}\\b`, "i");
            expect(result).not.toMatch(termRegex);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
