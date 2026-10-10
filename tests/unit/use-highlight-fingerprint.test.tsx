import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { useHighlightFingerprint } from "@features/span-highlighting/hooks/useHighlightFingerprint";
import type { ParseResult } from "@features/span-highlighting/hooks/types";

vi.mock("@features/span-highlighting/hooks/useSpanLabeling", () => ({
  createHighlightSignature: vi.fn(() => "sig-base"),
}));

describe("useHighlightFingerprint", () => {
  describe("core behavior", () => {
    it("invalidates rendered highlights when a span category or range changes", () => {
      const parseResult: ParseResult = {
        displayText: "Hello world",
        spans: [
          {
            id: "span-1",
            start: 0,
            end: 5,
            displayStart: 0,
            displayEnd: 5,
            category: "subject",
          },
          { start: 6, end: 11, category: "action" },
        ],
      };

      const { result, rerender } = renderHook(
        ({ value }) => useHighlightFingerprint(true, value),
        { initialProps: { value: parseResult } },
      );
      const initial = result.current;
      rerender({
        value: {
          ...parseResult,
          spans: [
            { ...parseResult.spans![0]!, category: "style" },
            parseResult.spans![1]!,
          ],
        },
      });
      expect(result.current).not.toBe(initial);
      const changedCategory = result.current;
      rerender({
        value: {
          ...parseResult,
          spans: [
            {
              ...parseResult.spans![0]!,
              category: "style",
              displayEnd: 4,
            },
            parseResult.spans![1]!,
          ],
        },
      });
      expect(result.current).not.toBe(changedCategory);
    });
  });
});
