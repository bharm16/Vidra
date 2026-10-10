/**
 * Property-based tests for Sora Safety Filtering (Celebrity Name Stripping)
 *
 * Tests the following correctness property:
 * - Property 3 (Sora): Celebrity Name Stripping
 *
 * For any prompt containing public figure names, the SoraStrategy normalize phase
 * SHALL aggressively strip those names to prevent API rejections, while preserving
 * valid @Cameo identity tokens.
 *
 * @module sora-safety-filtering.property.test
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import { SoraStrategy } from "@services/video-prompt-analysis/strategies/SoraStrategy";

describe("SoraStrategy Property Tests", () => {
  const strategy = new SoraStrategy();

  // Sample public figure names for testing
  const publicFigureNames = [
    "Taylor Swift",
    "Elon Musk",
    "Beyonce",
    "Kim Kardashian",
    "Dwayne Johnson",
    "Tom Cruise",
    "Brad Pitt",
    "Leonardo DiCaprio",
    "Scarlett Johansson",
    "Chris Hemsworth",
    "Keanu Reeves",
    "Zendaya",
    "Barack Obama",
    "Oprah Winfrey",
    "LeBron James",
  ];

  // Sample @Cameo tokens for testing
  const cameoTokens = [
    "@Cameo(user123)",
    "@Cameo(celebrity_abc)",
    "@Cameo(id_456)",
    "@Cameo(custom_identity)",
  ];

  /**
   * Property 3 (Sora): Celebrity Name Stripping
   *
   * WHEN normalizing a Sora prompt, THE SoraStrategy SHALL aggressively strip
   * public figure names to prevent API rejections.
   *
   * **Feature: video-model-optimization, Property 3 (Sora): Celebrity Name Stripping**
   * **Validates: Requirements 6.1, 6.2**
   */
  describe("Property 3 (Sora): Celebrity Name Stripping", () => {
    it("preserves @Cameo tokens while stripping celebrity names", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...cameoTokens),
          fc.constantFrom(...publicFigureNames),
          (cameoToken, celebrity) => {
            const input = `${cameoToken} meets ${celebrity} at a cafe`;
            const result = strategy.normalize(input);

            // @Cameo token should be preserved
            expect(result).toContain(cameoToken);

            // Celebrity name should be stripped
            expect(result.toLowerCase()).not.toContain(celebrity.toLowerCase());
          },
        ),
        { numRuns: 100 },
      );
    });

    it("handles multiple @Cameo tokens in same prompt", () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom(...cameoTokens), {
            minLength: 2,
            maxLength: 3,
          }),
          (tokens) => {
            const uniqueTokens = [...new Set(tokens)];
            const input = uniqueTokens.join(" talking to ") + " in a room";
            const result = strategy.normalize(input);

            // All @Cameo tokens should be preserved
            for (const token of uniqueTokens) {
              expect(result).toContain(token);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
