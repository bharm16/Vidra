/**
 * Property-based tests for SafetySanitizer Replacement Consistency
 *
 * Tests the following correctness property:
 * - Property 8: SafetySanitizer Replacement Consistency
 *
 * For any input containing blocked terms, SafetySanitizer SHALL return sanitized
 * text where all blocked terms are replaced with generic descriptors, and the
 * replacements list SHALL contain an entry for each replacement made. For inputs
 * without blocked terms, the original text SHALL be returned unchanged.
 *
 * @module safety-sanitizer.property.test
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import { SafetySanitizer } from "@services/video-prompt-analysis/utils/SafetySanitizer";

describe("SafetySanitizer Property Tests", () => {
  const sanitizer = new SafetySanitizer();

  // Sample celebrity names for testing
  const celebrityNames = [
    "Taylor Swift",
    "Elon Musk",
    "Beyonce",
    "Kim Kardashian",
    "Dwayne Johnson",
    "Tom Cruise",
  ];

  // Sample NSFW terms for testing
  const nsfwTerms = ["nude", "naked", "nsfw", "explicit"];

  // Sample violence terms for testing
  const violenceTerms = ["murder", "torture", "gore", "massacre"];

  /**
   * Property 8: SafetySanitizer Replacement Consistency
   *
   * For any input containing blocked terms, SafetySanitizer SHALL return
   * sanitized text where all blocked terms are replaced with generic descriptors,
   * and the replacements list SHALL contain an entry for each replacement made.
   * For inputs without blocked terms, the original text SHALL be returned unchanged.
   *
   * **Feature: video-model-optimization, Property 8: SafetySanitizer Replacement Consistency**
   * **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**
   */
  describe("Property 8: SafetySanitizer Replacement Consistency", () => {
    it("replaces celebrity names with physical descriptions", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...celebrityNames),
          fc.string({ minLength: 0, maxLength: 50 }),
          fc.string({ minLength: 0, maxLength: 50 }),
          (celebrity, prefix, suffix) => {
            const input = `${prefix} ${celebrity} ${suffix}`.trim();
            const result = sanitizer.sanitize(input);

            // Celebrity name should not appear in output
            expect(result.text.toLowerCase()).not.toContain(
              celebrity.toLowerCase(),
            );

            // Should have at least one replacement
            expect(result.replacements.length).toBeGreaterThan(0);

            // Replacement should be for celebrity category
            const celebrityReplacement = result.replacements.find(
              (r) => r.category === "celebrity",
            );
            expect(celebrityReplacement).toBeDefined();

            // wasModified should be true
            expect(result.wasModified).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("replaces NSFW terms with content removed marker", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...nsfwTerms),
          fc.string({ minLength: 0, maxLength: 50 }),
          fc.string({ minLength: 0, maxLength: 50 }),
          (nsfwTerm, prefix, suffix) => {
            const input = `${prefix} ${nsfwTerm} ${suffix}`.trim();
            const result = sanitizer.sanitize(input);

            // NSFW term should not appear in output (as a word)
            const termRegex = new RegExp(`\\b${nsfwTerm}\\b`, "i");
            expect(result.text).not.toMatch(termRegex);

            // Should have replacement for nsfw category
            const nsfwReplacement = result.replacements.find(
              (r) => r.category === "nsfw",
            );
            expect(nsfwReplacement).toBeDefined();

            // wasModified should be true
            expect(result.wasModified).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("replaces violence terms with content removed marker", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...violenceTerms),
          fc.string({ minLength: 0, maxLength: 50 }),
          fc.string({ minLength: 0, maxLength: 50 }),
          (violenceTerm, prefix, suffix) => {
            const input = `${prefix} ${violenceTerm} ${suffix}`.trim();
            const result = sanitizer.sanitize(input);

            // Violence term should not appear in output (as a word)
            const termRegex = new RegExp(`\\b${violenceTerm}\\b`, "i");
            expect(result.text).not.toMatch(termRegex);

            // Should have replacement for violence category
            const violenceReplacement = result.replacements.find(
              (r) => r.category === "violence",
            );
            expect(violenceReplacement).toBeDefined();

            // wasModified should be true
            expect(result.wasModified).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("returns original text unchanged when no blocked terms present", () => {
      fc.assert(
        fc.property(
          fc
            .array(
              fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz ".split("")),
              {
                minLength: 10,
                maxLength: 100,
              },
            )
            .map((chars) => chars.join(""))
            // Ask the sanitizer itself whether the input is clean, rather than
            // re-deriving it from the sample lists above: those name six
            // celebrities where the real blocklist carries forty-one, so a
            // generated string can satisfy the sample filter and still hold a
            // blocked term. Seeds that reach one are rare but real — a full-suite
            // run turned up "aaaaaaa ye", and "ye" is Kanye West's legal name.
            // containsBlockedTerms is the broader check (it matches celebrities
            // as substrings where sanitize replaces on word boundaries), so
            // anything it calls clean is guaranteed to come back unmodified.
            .filter(
              (s) => !sanitizer.containsBlockedTerms(s) && s.trim().length > 0,
            ),
          (safeInput) => {
            const result = sanitizer.sanitize(safeInput);

            // Text should be unchanged (except whitespace normalization)
            expect(result.text.replace(/\s+/g, " ").trim()).toBe(
              safeInput.replace(/\s+/g, " ").trim(),
            );

            // No replacements should be made
            expect(result.replacements).toHaveLength(0);

            // wasModified should be false
            expect(result.wasModified).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
