import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ParseResult } from "@features/span-highlighting/hooks/types";
import { useHighlightRendering } from "@features/span-highlighting/hooks/useHighlightRendering";

vi.mock("@/services/LoggingService", () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

vi.mock("@utils/PromptContext", () => ({
  PromptContext: {
    getCategoryColor: () => undefined,
  },
}));

const createParseResult = (text: string): ParseResult => ({
  displayText: text,
  spans: [
    {
      id: "span-1",
      start: 0,
      end: 5,
      text: "Hello",
      quote: "Hello",
      category: "subject",
    },
  ],
});

describe("useHighlightRendering", () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  afterEach(() => {
    document.body.removeChild(root);
    vi.clearAllMocks();
  });

  describe("error handling", () => {
    it("clears highlights when disabled", async () => {
      const text = "Hello world";
      root.textContent = text;
      const editorRef = { current: root };
      const parseResult = createParseResult(text);

      const { result, rerender } = renderHook(
        ({ enabled }) =>
          useHighlightRendering({
            editorRef,
            parseResult,
            enabled,
            fingerprint: enabled ? "fp-1" : null,
            text,
          }),
        { initialProps: { enabled: true } },
      );

      await waitFor(() => {
        expect(result.current.current!.spanMap.size).toBe(1);
      });

      rerender({ enabled: false });

      await waitFor(() => {
        expect(result.current.current!.spanMap.size).toBe(0);
      });

      expect(root.querySelectorAll("span")).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("clears existing wrappers when spans become empty", async () => {
      const text = "Hello world";
      root.textContent = text;
      const editorRef = { current: root };
      const parseResult = createParseResult(text);

      const { result, rerender } = renderHook(
        ({ spans }) =>
          useHighlightRendering({
            editorRef,
            parseResult: { ...parseResult, spans },
            enabled: true,
            fingerprint: spans.length ? "fp-2" : "fp-empty",
            text,
          }),
        { initialProps: { spans: parseResult.spans ?? [] } },
      );

      await waitFor(() => {
        expect(result.current.current!.spanMap.size).toBe(1);
      });

      rerender({ spans: [] });

      await waitFor(() => {
        expect(result.current.current!.spanMap.size).toBe(0);
      });
      expect(root.querySelectorAll("span")).toHaveLength(0);
    });
  });

  describe("core behavior", () => {
    it("renders highlight wrappers for valid spans", async () => {
      const text = "Hello world";
      root.textContent = text;
      const editorRef = { current: root };
      const parseResult = createParseResult(text);

      const { result } = renderHook(() =>
        useHighlightRendering({
          editorRef,
          parseResult,
          enabled: true,
          fingerprint: "fp-3",
          text,
        }),
      );

      await waitFor(() => {
        expect(result.current.current!.spanMap.size).toBe(1);
      });

      const wrapper = root.querySelector("span");
      expect(wrapper).not.toBeNull();
      expect(wrapper?.dataset.spanId).toBe("span-1");
      expect(wrapper?.textContent).toBe("Hello");
    });
  });
});
