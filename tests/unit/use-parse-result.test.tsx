import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useParseResult } from "@features/prompt-optimizer/PromptCanvas/hooks/useParseResult";
import {
  convertLabeledSpansToHighlights,
  createHighlightSignature,
} from "@features/span-highlighting";

const logSpies = {
  debug: vi.fn(),
};

vi.mock("@/services/LoggingService", () => ({
  logger: {
    child: () => logSpies,
  },
}));

vi.mock("@features/span-highlighting", () => ({
  convertLabeledSpansToHighlights: vi.fn(),
  createHighlightSignature: vi.fn(),
}));

const mockConvertLabeledSpansToHighlights = vi.mocked(
  convertLabeledSpansToHighlights,
);
const mockCreateHighlightSignature = vi.mocked(createHighlightSignature);

describe("useParseResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateHighlightSignature.mockReturnValue("sig-current");
  });

  it("returns empty spans when ML highlighting is disabled", () => {
    const { result } = renderHook(() =>
      useParseResult({
        labeledSpans: [
          { start: 0, end: 5, category: "style", confidence: 0.9 },
        ],
        labeledMeta: { source: "test" },
        labelingSignature: "sig-current",
        labelingStatus: "success",
        labelingError: null,
        enableMLHighlighting: false,
        displayedPrompt: "Hello",
      }),
    );

    expect(result.current.spans).toEqual([]);
    expect(result.current.meta).toEqual({ source: "test" });
    expect(mockConvertLabeledSpansToHighlights).not.toHaveBeenCalled();
  });

  it("drops spans and meta on signature mismatch and logs warning", async () => {
    const { result } = renderHook(() =>
      useParseResult({
        labeledSpans: [
          { start: 0, end: 5, category: "style", confidence: 0.9 },
        ],
        labeledMeta: { source: "test" },
        labelingSignature: "sig-other",
        labelingStatus: "success",
        labelingError: null,
        enableMLHighlighting: true,
        displayedPrompt: "Hello",
      }),
    );

    expect(result.current.spans).toEqual([]);
    expect(result.current.meta).toBeNull();

    await waitFor(() => {
      expect(logSpies.debug).toHaveBeenCalledWith(
        "Span signature mismatch; dropping labeled spans",
        expect.objectContaining({
          labeledSpanCount: 1,
          labelingSignature: "sig-other",
        }),
      );
    });
  });
});
