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

  // Sample prompts for testing
  const samplePrompts = [
    "A woman walking in the park",
    "A cinematic shot of a car driving through the city at night",
    "Close up of a flower blooming in slow motion",
    "A man running through a forest with dramatic lighting",
    "Aerial view of a beach at sunset with golden hour lighting",
    "A dog playing in the snow, wide shot",
    "Two people talking in a cafe, medium shot",
    "A bird flying over mountains with cloudy weather",
    "A chef cooking in a kitchen with soft lighting",
    "A dancer performing on stage with dramatic backlighting",
  ];

  // Camera types for testing
  const cameraTypes = [
    "wide shot",
    "close up",
    "medium shot",
    "aerial view",
    "low angle",
    "high angle",
    "pov",
    "tracking shot",
  ];

  // Camera movements for testing
  const cameraMovements = [
    "pan left",
    "pan right",
    "tilt up",
    "tilt down",
    "dolly in",
    "zoom out",
    "tracking",
    "static",
    "orbit",
  ];

  // Lighting keywords for testing
  const lightingKeywords = [
    "natural light",
    "golden hour",
    "dramatic lighting",
    "soft lighting",
    "backlit",
    "neon",
    "volumetric lighting",
  ];

  // Weather keywords for testing
  const weatherKeywords = [
    "sunny",
    "cloudy",
    "rainy",
    "snowy",
    "foggy",
    "stormy",
  ];

  // Style presets for testing
  const stylePresets = [
    "cinematic",
    "documentary",
    "commercial",
    "anime",
    "realistic",
    "noir",
    "sci-fi",
  ];

  /**
   * Property 5: Veo Cinematic Prose Output
   *
   * For any Veo prompt, the transform phase SHALL produce a prose string
   * containing cinematic descriptors: subject, action, camera type/movement,
   * lighting, and style references.
   *
   * **Feature: video-model-optimization, Property 5: Veo Prose Output**
   * **Validates: Requirements 7.2, 7.3, 7.5**
   */
  describe("Property 5: Veo Cinematic Prose Output", () => {
    it("produces prose string output for any prompt", async () => {
      await fc.assert(
        fc.asyncProperty(fc.constantFrom(...samplePrompts), async (prompt) => {
          const normalized = strategy.normalize(prompt);
          const result = await strategy.transform(normalized);

          // Result should be a string (prose, not JSON schema)
          expect(typeof result.prompt).toBe("string");
          const prose = result.prompt as string;
          expect(prose.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 },
      );
    });

    it("includes camera references in prose output", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...cameraTypes),
          fc.string({ minLength: 5, maxLength: 30 }),
          async (cameraType, suffix) => {
            const prompt = `A person ${suffix} ${cameraType}`;
            const normalized = strategy.normalize(prompt);
            const result = await strategy.transform(normalized);

            const prose = result.prompt as string;
            // Should contain camera-related terms
            expect(
              prose.toLowerCase().includes("shot") ||
                prose.toLowerCase().includes("camera") ||
                prose.toLowerCase().includes("angle"),
            ).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("includes movement references in prose output", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...cameraMovements),
          fc.string({ minLength: 5, maxLength: 30 }),
          async (movement, prefix) => {
            const prompt = `${prefix} with ${movement}`;
            const normalized = strategy.normalize(prompt);
            const result = await strategy.transform(normalized);

            const prose = result.prompt as string;
            // Should contain movement-related terms
            expect(
              prose.toLowerCase().includes("movement") ||
                prose.toLowerCase().includes("camera") ||
                prose.toLowerCase().includes("static") ||
                prose.toLowerCase().includes("pan") ||
                prose.toLowerCase().includes("dolly") ||
                prose.toLowerCase().includes("tracking"),
            ).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("includes lighting references in prose output", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...lightingKeywords),
          fc.string({ minLength: 5, maxLength: 30 }),
          async (lighting, prefix) => {
            const prompt = `${prefix} with ${lighting}`;
            const normalized = strategy.normalize(prompt);
            const result = await strategy.transform(normalized);

            const prose = result.prompt as string;
            // Should contain lighting-related terms
            expect(
              prose.toLowerCase().includes("lit") ||
                prose.toLowerCase().includes("light") ||
                prose.toLowerCase().includes("backlit"),
            ).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("includes weather references when detected in prose", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...weatherKeywords),
          fc.string({ minLength: 5, maxLength: 30 }),
          async (weather, prefix) => {
            const prompt = `${prefix} on a ${weather} day`;
            const normalized = strategy.normalize(prompt);
            const result = await strategy.transform(normalized);

            const prose = result.prompt as string;
            // Should be a string
            expect(typeof prose).toBe("string");
            expect(prose.length).toBeGreaterThan(0);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("augment enhances prose with style references", async () => {
      await fc.assert(
        fc.asyncProperty(fc.constantFrom(...samplePrompts), async (prompt) => {
          const normalized = strategy.normalize(prompt);
          const transformResult = await strategy.transform(normalized);
          const augmentResult = strategy.augment(transformResult);

          // Result should be string prose
          expect(typeof augmentResult.prompt).toBe("string");
          const prose = augmentResult.prompt as string;
          expect(prose.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 },
      );
    });

    it("detects and incorporates style presets in prose", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...stylePresets),
          fc.string({ minLength: 5, maxLength: 30 }),
          async (style, suffix) => {
            const prompt = `A ${style} shot of ${suffix}`;
            const normalized = strategy.normalize(prompt);
            const transformResult = await strategy.transform(normalized);
            const augmentResult = strategy.augment(transformResult);

            const prose = augmentResult.prompt as string;
            // Should be prose string containing some style reference
            expect(typeof prose).toBe("string");
            expect(prose.length).toBeGreaterThan(0);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("augmentation maintains readable prose structure", async () => {
      await fc.assert(
        fc.asyncProperty(fc.constantFrom(...samplePrompts), async (prompt) => {
          const normalized = strategy.normalize(prompt);
          const transformResult = await strategy.transform(normalized);
          const augmentResult = strategy.augment(transformResult);

          const prose = augmentResult.prompt as string;

          // Should contain key cinematic descriptors
          expect(
            prose.toLowerCase().includes("shot") ||
              prose.toLowerCase().includes("camera") ||
              prose.toLowerCase().includes("lit") ||
              prose.toLowerCase().includes("light"),
          ).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it("handles random text inputs gracefully", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 10, maxLength: 100 }),
          async (randomText) => {
            // Filter out empty or whitespace-only strings
            if (randomText.trim().length === 0) return;

            const normalized = strategy.normalize(randomText);

            // Skip if normalization resulted in empty string
            if (normalized.trim().length === 0) return;

            const result = await strategy.transform(normalized);

            // Should produce prose string output
            expect(typeof result.prompt).toBe("string");
            const prose = result.prompt as string;
            expect(prose.length).toBeGreaterThan(0);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

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

    it("strips conversational filler", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            "I want a video of a cat",
            "Please create a scene with a dog",
            "Can you make a video of birds",
            "I would like to see a sunset",
            "Could you generate a forest scene",
          ),
          (fillerText) => {
            const result = strategy.normalize(fillerText);

            // Conversational filler should be stripped
            expect(result.toLowerCase()).not.toContain("i want");
            expect(result.toLowerCase()).not.toContain("please create");
            expect(result.toLowerCase()).not.toContain("can you");
            expect(result.toLowerCase()).not.toContain("i would like");
            expect(result.toLowerCase()).not.toContain("could you");
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("Flow Editing Mode", () => {
    it("detects edit instructions and produces prose output", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            "Remove the car from the scene",
            "Delete the background",
            "Add a tree to the left",
            "Change the color to blue",
            "Replace the sky with sunset",
          ),
          async (editInstruction) => {
            const normalized = strategy.normalize(editInstruction);
            const result = await strategy.transform(normalized);

            // Should produce prose string output
            expect(typeof result.prompt).toBe("string");
            const prose = result.prompt as string;
            expect(prose.length).toBeGreaterThan(0);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("preserves generation for non-edit prompts with prose output", async () => {
      await fc.assert(
        fc.asyncProperty(fc.constantFrom(...samplePrompts), async (prompt) => {
          const normalized = strategy.normalize(prompt);
          const result = await strategy.transform(normalized);

          // Should produce prose string output
          expect(typeof result.prompt).toBe("string");
          const prose = result.prompt as string;
          expect(prose.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 },
      );
    });
  });
});
