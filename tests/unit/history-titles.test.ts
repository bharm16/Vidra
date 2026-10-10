import { describe, it, expect } from "vitest";

import { resolveEntryTitle } from "@features/history/utils/historyTitles";
import type { PromptHistoryEntry } from "@features/prompt-optimizer/types/domain/prompt-session";

const createEntry = (
  overrides: Partial<PromptHistoryEntry> = {},
): PromptHistoryEntry => ({
  input: "default input",
  output: "output",
  ...overrides,
});

describe("historyTitles", () => {
  describe("error handling", () => {
    it('returns "Untitled" when only stop words are present', () => {
      const entry = createEntry({ title: null, input: "the the" });

      expect(resolveEntryTitle(entry)).toBe("Untitled");
    });
  });

  describe("core behavior", () => {
    it("uses the normalized explicit title when provided", () => {
      const entry = createEntry({ title: "  My   Title  " });

      expect(resolveEntryTitle(entry)).toBe("My Title");
    });

    it("derives a short title with token casing rules", () => {
      const entry = createEntry({ title: null, input: "a tv NASA launch" });

      // Stop-word "a" dropped; remaining 3 tokens fit under the
      // 6-token / 40-char budget (established in commit 82490368).
      // "tv" → "TV" (hardcoded), "NASA" → "NASA" (≤4-char uppercase
      // preserved), "launch" → "Launch" (title-case). The test here
      // exercises the casing rules; the length budget is covered by
      // the invariant-first regression tests in
      // client/src/features/history/utils/__tests__/historyTitles.regression.test.ts.
      expect(resolveEntryTitle(entry)).toBe("TV NASA Launch");
    });
  });
});
