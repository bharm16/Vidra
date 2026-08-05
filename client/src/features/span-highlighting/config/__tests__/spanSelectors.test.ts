import { describe, expect, it } from "vitest";
import { DATASET_KEYS } from "../constants";
import {
  HIGHLIGHT_CLASS,
  HIGHLIGHT_SELECTOR,
  LABELLED_HIGHLIGHT_SELECTOR,
  SPAN_ID_ATTR,
  spanIdSelector,
} from "../spanSelectors";
import { getHighlightClassName } from "../highlightStyles";

/**
 * The read side of the highlight protocol. `prompt-optimizer` finds rendered
 * highlights through these; `span-highlighting` writes them. Before this
 * module the two ends were bare literals in six places.
 */
describe("span selectors", () => {
  it("matches the class the writer actually emits", () => {
    expect(getHighlightClassName("subject").split(" ")).toContain(
      HIGHLIGHT_CLASS,
    );
    expect(getHighlightClassName(null).split(" ")).toContain(HIGHLIGHT_CLASS);
    expect(HIGHLIGHT_SELECTOR).toBe(`.${HIGHLIGHT_CLASS}`);
  });

  /**
   * `dataset.spanId` and `[data-span-id]` are one fact in the DOM's two
   * spellings. They are declared separately for readability, so this is what
   * keeps them honest.
   */
  it("spells DATASET_KEYS.SPAN_ID the way an attribute selector needs", () => {
    const asDataAttribute = `data-${DATASET_KEYS.SPAN_ID.split("")
      .map((char) =>
        char >= "A" && char <= "Z" ? `-${char.toLowerCase()}` : char,
      )
      .join("")}`;
    expect(SPAN_ID_ATTR).toBe(asDataAttribute);
  });

  it("finds an element the writer's dataset assignment produced", () => {
    const el = document.createElement("span");
    el.className = getHighlightClassName("camera");
    el.dataset[DATASET_KEYS.SPAN_ID] = "span-7";
    document.body.appendChild(el);

    expect(document.querySelector(spanIdSelector("span-7"))).toBe(el);
    expect(document.querySelector(HIGHLIGHT_SELECTOR)).toBe(el);
    expect(document.querySelector(LABELLED_HIGHLIGHT_SELECTOR)).toBe(el);

    document.body.removeChild(el);
  });

  /**
   * Span ids come from the server DTO. One of the six read sites interpolated
   * them raw, so a value carrying a quote was parsed as selector syntax —
   * a thrown SyntaxError rather than a miss.
   */
  it("escapes ids that would otherwise be read as selector syntax", () => {
    for (const id of ['a"b', "a\\b", "a]b", "1leading-digit"]) {
      expect(() => document.querySelector(spanIdSelector(id))).not.toThrow();
    }
  });

  it("matches an id containing a quote rather than throwing on it", () => {
    const el = document.createElement("span");
    el.className = getHighlightClassName("subject");
    el.dataset[DATASET_KEYS.SPAN_ID] = 'quote"id';
    document.body.appendChild(el);

    expect(document.querySelector(spanIdSelector('quote"id'))).toBe(el);

    document.body.removeChild(el);
  });
});
