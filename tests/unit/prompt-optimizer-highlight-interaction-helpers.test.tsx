import { describe, expect, it } from "vitest";

import {
  extractHighlightMetadata,
  findHighlightNode,
} from "@features/prompt-optimizer/utils/highlightInteractionHelpers";

const buildHighlightNode = (): HTMLElement => {
  const node = document.createElement("span");
  node.className = "value-word";
  node.dataset.category = "style.aesthetic";
  node.dataset.source = "llm";
  node.dataset.spanId = "span-1";
  node.dataset.start = "5";
  node.dataset.end = "9";
  node.dataset.startGrapheme = "5";
  node.dataset.endGrapheme = "9";
  node.dataset.validatorPass = "true";
  node.dataset.confidence = "0.9";
  node.dataset.quote = "gold";
  node.dataset.leftCtx = "shiny";
  node.dataset.rightCtx = "light";
  node.dataset.idempotencyKey = "key-1";
  node.textContent = "gold";
  return node;
};

describe("highlightInteractionHelpers", () => {
  it("finds a highlight node by walking up the tree", () => {
    const root = document.createElement("div");
    const wrapper = document.createElement("span");
    const highlight = buildHighlightNode();
    wrapper.appendChild(highlight);
    root.appendChild(wrapper);

    expect(findHighlightNode(highlight, root)).toBe(highlight);
    expect(findHighlightNode(wrapper, root)).toBeNull();
  });

  it("extracts metadata from dataset and parseResult", () => {
    const node = buildHighlightNode();
    const parseResult = {
      spans: [{ id: "span-1", extra: "data" }],
    };

    const metadata = extractHighlightMetadata(node, parseResult);

    expect(metadata).toEqual(
      expect.objectContaining({
        category: "style.aesthetic",
        source: "llm",
        spanId: "span-1",
        start: 5,
        end: 9,
        confidence: 0.9,
        quote: "gold",
        leftCtx: "shiny",
        rightCtx: "light",
        idempotencyKey: "key-1",
      }),
    );
    expect(metadata?.span).toEqual({ id: "span-1", extra: "data" });
  });
});
