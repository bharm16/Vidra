/**
 * Regression: session titles must not truncate mid-phrase at exactly 2 words,
 * and disambiguator suffixes must not echo words already in the base title.
 *
 * Invariants:
 *  (a) For any input with N>2 meaningful words, deriveBaseTitle may include
 *      up to MAX_TITLE_TOKENS words constrained by MAX_TITLE_CHARS — never
 *      exactly the first 2 tokens regardless of content.
 *  (b) extractDisambiguator(input, excludeTokens) MUST NOT return a token
 *      that already appears in excludeTokens (case-insensitive), otherwise
 *      the composed title becomes an echo like "Cinematic Aerial - aerial".
 *
 * Bugs captured:
 *  - "astronaut on mars at sunset" rendered as "Astronaut On" (truncated
 *    at 2 words, cut mid-phrase).
 *  - "Cinematic aerial shot..." rendered as "Cinematic Aerial - aerial"
 *    (disambiguator duplicated a word already in the title).
 */

import { describe, expect, it } from "vitest";
import type { PromptHistoryEntry } from "@features/prompt-optimizer";
import { extractDisambiguator, resolveEntryTitle } from "../historyTitles";

const entry = (input: string): PromptHistoryEntry =>
  ({
    id: "test-entry",
    uuid: "test-uuid",
    timestamp: new Date().toISOString(),
    title: null,
    input,
    output: "",
    score: null,
    mode: "video",
    targetModel: null,
    generationParams: null,
    keyframes: null,
    brainstormContext: null,
    highlightCache: null,
    versions: [],
  }) as unknown as PromptHistoryEntry;

describe("regression: session title derivation", () => {
  it("keeps more than 2 words from 'astronaut on mars at sunset'", () => {
    const title = resolveEntryTitle(entry("astronaut on mars at sunset"));
    expect(title).not.toBe("Astronaut On");
    expect(title.split(" ").length).toBeGreaterThanOrEqual(3);
    expect(title.toLowerCase()).toContain("mars");
  });

  it("stops at first sentence boundary to avoid running into trailing clauses", () => {
    const title = resolveEntryTitle(
      entry(
        "A cinematic aerial shot. Extreme Wide Shot of a lone astronaut with neon-lit backpack.",
      ),
    );
    // The second sentence ("Extreme Wide Shot of a lone astronaut...") must
    // not leak into the title.
    expect(title.toLowerCase()).not.toContain("astronaut");
    expect(title.toLowerCase()).not.toContain("neon");
  });

  it("caps title length at MAX_TITLE_CHARS", () => {
    const title = resolveEntryTitle(
      entry(
        "supercalifragilisticexpialidocious adventure through the cosmos featuring a lonely wanderer",
      ),
    );
    expect(title.length).toBeLessThanOrEqual(40);
  });
});

describe("regression: disambiguator does not echo base title tokens", () => {
  it("returns a non-duplicate keyword when one is available", () => {
    // "aerial" is in base title; "night" is not. Should return "night".
    const result = extractDisambiguator(
      "aerial shot at night of a lone astronaut",
      "Aerial Shot",
    );
    expect(result).toBe("night");
  });

  it("falls through to null when every candidate keyword is in the base title", () => {
    const result = extractDisambiguator(
      "cinematic aerial shot",
      "Cinematic Aerial Shot",
    );
    expect(result).toBeNull();
  });

  it("preserves original behavior when no excludeTokens is provided", () => {
    const result = extractDisambiguator("aerial shot at sunset");
    expect(result).toBe("aerial");
  });
});
