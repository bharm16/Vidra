import React from "react";
import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useTextSelection } from "../useTextSelection";
import type { ParseResult, SpanClickPayload } from "../../types";

// Minimal payload — only `span.id` is branched on; the rest passes straight
// through to onFetchSuggestions, so a focused cast keeps the test on the gate.
const span = {
  id: "span-1",
  quote: "golden retriever",
  start: 0,
  end: 16,
  category: "subject",
  source: "llm",
} as unknown as SpanClickPayload;

describe("regression: click-to-enhance is not gated by a start frame (M3)", () => {
  // ADR-0010 / design audit 2026-07-02: a start frame (I2V mode) used to
  // disable span click-to-enhance via a gate in this hook — that killed the
  // differentiator in the only state where spans render. The gate is removed;
  // the hook no longer knows about I2V mode, so a category span click always
  // reaches suggestions.
  it("fetches suggestions on a category span click", () => {
    const onFetchSuggestions = vi.fn();
    const { result } = renderHook(() =>
      useTextSelection({
        selectedMode: "video",
        editorRef: React.createRef<HTMLElement>(),
        displayedPrompt: "a golden retriever",
        parseResult: { spans: [] } as unknown as ParseResult,
        onFetchSuggestions,
      }),
    );

    result.current.handleSpanClickFromCategory(span);

    expect(onFetchSuggestions).toHaveBeenCalledTimes(1);
  });
});
