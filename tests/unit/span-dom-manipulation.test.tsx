import { describe, expect, it, vi } from "vitest";

import {
  createHighlightWrapper,
  enhanceWrapperWithMetadata,
  unwrapHighlight,
} from "@features/span-highlighting/utils/domManipulation";
import { DATASET_KEYS } from "@features/span-highlighting/config/constants";

vi.mock("@/services/LoggingService", () => ({
  logger: {
    child: () => ({ warn: vi.fn() }),
  },
}));

describe("domManipulation", () => {
  it("creates wrapper with dataset values and styles", () => {
    const root = document.createElement("div");
    const span = {
      id: "span-1",
      category: "style",
      source: "llm",
      start: 1,
      end: 4,
      confidence: 0.8,
    };

    const wrapper = createHighlightWrapper(root, span, 1, 4, () => ({
      bg: "rgba(255, 0, 0, 0.12)",
      border: "rgba(255, 0, 0, 0.35)",
      ring: "rgba(255, 0, 0, 0.18)",
    }));

    expect(wrapper.className).toContain("value-word");
    expect(wrapper.dataset[DATASET_KEYS.SPAN_ID]).toBe("span-1");
    // applyHighlightStyles now derives text color from the border's RGB channel
    // rather than writing --highlight-bg/border/ring CSS variables.
    expect(wrapper.style.color).toBe("rgba(255, 0, 0, 0.9)");
  });

  it("enhances wrapper metadata", () => {
    const wrapper = document.createElement("span");
    enhanceWrapperWithMetadata(wrapper, {
      start: 0,
      end: 4,
      quote: "text",
      leftCtx: "left",
      rightCtx: "right",
      displayQuote: "display",
      displayLeftCtx: "dl",
      displayRightCtx: "dr",
      confidence: 0.9,
    });

    expect(wrapper.dataset[DATASET_KEYS.QUOTE]).toBe("text");
    expect(wrapper.dataset[DATASET_KEYS.CONFIDENCE]).toBe("0.9");
  });

  it("unwraps highlight element", () => {
    const parent = document.createElement("div");
    const wrapper = document.createElement("span");
    wrapper.textContent = "hello";
    parent.appendChild(wrapper);

    unwrapHighlight(wrapper);

    expect(parent.textContent).toBe("hello");
    expect(parent.querySelector("span")).toBeNull();
  });
});
