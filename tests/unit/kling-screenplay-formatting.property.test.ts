/**
 * Property-based tests for Kling Screenplay Formatting
 *
 * Tests the following correctness property:
 * - Property 4 (Kling): Dialogue Formatting
 *
 * For any Kling prompt containing dialogue patterns, the transform phase SHALL
 * format dialogue as `[Character] ([Emotion]): "[Line]"` and extract sound effects
 * to separate `Audio:` blocks.
 *
 * @module kling-screenplay-formatting.property.test
 *
 * **Feature: video-model-optimization, Property 4 (Kling): Dialogue Formatting**
 * **Validates: Requirements 5.3, 5.4**
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fc from "fast-check";

import { KlingStrategy } from "@services/video-prompt-analysis/strategies/KlingStrategy";

/**
 * Character names for generating test prompts
 */
const CHARACTER_NAMES = [
  "John",
  "Sarah",
  "Michael",
  "Emma",
  "David",
  "Lisa",
  "James",
  "Anna",
  "Robert",
  "Maria",
] as const;

/**
 * Speech verbs for dialogue patterns
 */
const SPEECH_VERBS = [
  "says",
  "said",
  "speaks",
  "tells",
  "asks",
  "replies",
  "responds",
  "exclaims",
  "whispers",
  "shouts",
  "yells",
  "murmurs",
] as const;

/**
 * Sound effect types for audio blocks
 */
const SFX_TYPES = [
  "bang",
  "crash",
  "boom",
  "whoosh",
  "splash",
  "thud",
  "click",
  "beep",
  "thunder",
  "explosion",
  "footsteps",
] as const;

/**
 * Ambience types for audio blocks
 */
const AMBIENCE_TYPES = [
  "city sounds",
  "nature sounds",
  "crowd noise",
  "traffic",
  "birds chirping",
  "wind blowing",
  "rain falling",
  "ocean waves",
] as const;

/**
 * Music types for audio blocks
 */
const MUSIC_TYPES = [
  "background music",
  "orchestra",
  "piano",
  "guitar",
  "violin",
  "drums",
] as const;

/**
 * Generate a simple dialogue line
 */
const dialogueLineArb = fc.record({
  character: fc.constantFrom(...CHARACTER_NAMES),
  verb: fc.constantFrom(...SPEECH_VERBS),
  line: fc
    .string({ minLength: 5, maxLength: 50 })
    .filter(
      (s) =>
        s.trim().length > 0 &&
        !s.includes('"') &&
        !s.includes("'") &&
        /^[a-zA-Z0-9\s.,!?]+$/.test(s),
    ),
});

/**
 * Check if output contains formatted dialogue pattern
 * Pattern: [Character] (emotion): "line" or [Character]: "line"
 */
function containsFormattedDialogue(output: string): boolean {
  // Check for [Character] pattern with optional emotion
  const formattedPattern =
    /\[[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\](?:\s*\([^)]+\))?\s*:\s*"/;
  return formattedPattern.test(output);
}

/**
 * Check if output contains Audio: block
 */
function containsAudioBlock(output: string): boolean {
  return /Audio\s*\([A-Z]+\)\s*:/i.test(output);
}

/**
 * Extract character names from formatted dialogue
 */
function extractFormattedCharacters(output: string): string[] {
  const pattern = /\[([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\]/g;
  const characters: string[] = [];
  let match;
  while ((match = pattern.exec(output)) !== null) {
    if (match[1]) {
      characters.push(match[1]);
    }
  }
  return characters;
}

describe("Kling Screenplay Formatting Property Tests", () => {
  let strategy: KlingStrategy;

  beforeEach(() => {
    strategy = new KlingStrategy();
  });

  /**
   * Property 4 (Kling): Dialogue Formatting
   *
   * For any Kling prompt containing dialogue patterns, the transform phase SHALL
   * format dialogue as `[Character] ([Emotion]): "[Line]"`.
   *
   * **Feature: video-model-optimization, Property 4 (Kling): Dialogue Formatting**
   * **Validates: Requirements 5.3**
   */
  describe("Property 4: Dialogue Formatting", () => {
    it("dialogue with speech verbs is formatted to screenplay format", async () => {
      await fc.assert(
        fc.asyncProperty(dialogueLineArb, async ({ character, verb, line }) => {
          // Create input with dialogue pattern: Character says "line"
          const input = `${character} ${verb} "${line}"`;

          const normalized = strategy.normalize(input);
          const result = await strategy.transform(normalized);
          const prompt =
            typeof result.prompt === "string"
              ? result.prompt
              : JSON.stringify(result.prompt);

          // Output should contain formatted dialogue with [Character]
          expect(containsFormattedDialogue(prompt)).toBe(true);

          // Character name should be preserved in brackets
          const formattedChars = extractFormattedCharacters(prompt);
          expect(
            formattedChars.some(
              (c) => c.toLowerCase() === character.toLowerCase(),
            ),
          ).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it("dialogue with colon format is formatted to screenplay format", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...CHARACTER_NAMES),
          fc
            .string({ minLength: 5, maxLength: 50 })
            .filter(
              (s) =>
                s.trim().length > 0 &&
                !s.includes('"') &&
                !s.includes("'") &&
                /^[a-zA-Z0-9\s.,!?]+$/.test(s),
            ),
          async (character, line) => {
            // Create input with colon dialogue pattern: Character: "line"
            const input = `${character}: "${line}"`;

            const normalized = strategy.normalize(input);
            const result = await strategy.transform(normalized);
            const prompt =
              typeof result.prompt === "string"
                ? result.prompt
                : JSON.stringify(result.prompt);

            // Output should contain formatted dialogue
            expect(containsFormattedDialogue(prompt)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 4 (Kling): Sound Effect Extraction
   *
   * For any Kling prompt containing sound effects, the transform phase SHALL
   * extract them to separate `Audio:` blocks.
   *
   * **Feature: video-model-optimization, Property 4 (Kling): Dialogue Formatting**
   * **Validates: Requirements 5.4**
   */
  describe("Property 4: Sound Effect Extraction", () => {
    // NOTE: Kling screenplay formatting only activates when the prompt contains
    // screenplay-triggering keywords (sfx, ambience, audio, dialogue, music, @Element, or quotes).
    // The normalize step strips generic sound terms like "sound" and "noise",
    // so test inputs must use keywords that survive normalization.

    it("sound effects are extracted to Audio blocks", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...SFX_TYPES),
          fc.constantFrom(
            "A person walks through the park",
            "The camera pans across the scene",
            "A beautiful sunset over the city",
            "Two people talking at a cafe",
          ),
          async (sfx, visualContent) => {
            // Use "sfx:" keyword to trigger screenplay formatting
            const input = `${visualContent}. sfx: ${sfx} echoes loudly.`;

            const normalized = strategy.normalize(input);
            const result = await strategy.transform(normalized);
            const prompt =
              typeof result.prompt === "string"
                ? result.prompt
                : JSON.stringify(result.prompt);

            // Output should contain Audio block
            expect(containsAudioBlock(prompt)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("ambience descriptions are extracted to Audio blocks", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...AMBIENCE_TYPES),
          fc.constantFrom(
            "A person walks through the park",
            "The camera pans across the scene",
            "A beautiful sunset over the city",
            "Two people talking at a cafe",
            "A car drives down the street",
            "The protagonist enters the room",
            "A bird flies across the sky",
            "The waves crash on the shore",
          ),
          async (ambience, visualContent) => {
            // Use "ambience:" keyword to trigger screenplay formatting
            const input = `${visualContent}. ambience: ${ambience} in the background.`;

            const normalized = strategy.normalize(input);
            const result = await strategy.transform(normalized);
            const prompt =
              typeof result.prompt === "string"
                ? result.prompt
                : JSON.stringify(result.prompt);

            // Output should contain Audio block
            expect(containsAudioBlock(prompt)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("music descriptions are extracted to Audio blocks", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...MUSIC_TYPES),
          fc.constantFrom(
            "A person walks through the park",
            "The camera pans across the scene",
            "A beautiful sunset over the city",
            "Two people talking at a cafe",
          ),
          async (music, visualContent) => {
            // Use "music:" keyword to trigger screenplay formatting
            const input = `${visualContent}. music: ${music} plays softly.`;

            const normalized = strategy.normalize(input);
            const result = await strategy.transform(normalized);
            const prompt =
              typeof result.prompt === "string"
                ? result.prompt
                : JSON.stringify(result.prompt);

            // Output should contain Audio block
            expect(containsAudioBlock(prompt)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
