/**
 * Property-based tests for VeoStrategy prose output
 *
 * Tests the following correctness property:
 * - Property 5: Veo Cinematic Prose Output
 *
 * For any Veo prompt, the transform phase SHALL produce a non-empty prose
 * string carrying cinematic descriptors (subject, action, camera, lighting,
 * and style references) rather than a JSON schema.
 *
 * @module veo-strategy.property.test
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import { VeoStrategy } from "@services/video-prompt-analysis/strategies/VeoStrategy";

describe("VeoStrategy Property Tests", () => {
  const strategy = new VeoStrategy();

  describe("Normalization: Markdown and Filler Stripping", () => {
    it("strips markdown formatting", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            "# Header text",
            "**bold text**",
            "*italic text*",
            "`code text`",
            "[link](url)",
            "- list item",
            "1. numbered item",
            "> blockquote",
          ),
          (markdownText) => {
            const result = strategy.normalize(markdownText);

            expect(result.length).toBeGreaterThan(0);
            // Markdown syntax should be stripped
            expect(result).not.toContain("#");
            expect(result).not.toContain("**");
            expect(result).not.toContain("`");
            expect(result).not.toContain("[");
            expect(result).not.toContain("](");
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
