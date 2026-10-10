import { describe, expect, it } from "vitest";
import {
  mapGlobalRangeToDom,
  surroundRange,
  wrapRangeSegments,
} from "../anchorRanges";

describe("anchorRanges", () => {
  it("maps global ranges to DOM ranges and extracts selected text", () => {
    const root = document.createElement("div");
    root.textContent = "A cinematic slow pan across skyline";

    const mapping = mapGlobalRangeToDom(root, 12, 20);

    expect(mapping).not.toBeNull();
    expect(mapping?.range.toString()).toBe("slow pan");
    expect(mapping?.start.localOffset).toBe(12);
    expect(mapping?.end.localOffset).toBe(20);
  });

  it("surroundRange wraps selected content when mapping is valid", () => {
    const root = document.createElement("div");
    root.textContent = "Alpha Beta Gamma";

    const wrapper = surroundRange({
      root,
      start: 6,
      end: 10,
      createWrapper: () => {
        const span = document.createElement("span");
        span.className = "highlight";
        return span;
      },
    });

    expect(wrapper).not.toBeNull();
    expect(wrapper?.textContent).toBe("Beta");
    expect(root.querySelector(".highlight")?.textContent).toBe("Beta");
  });

  it("wrapRangeSegments wraps ranges that cross multiple text nodes", () => {
    const root = document.createElement("div");
    root.innerHTML = "Hello <strong>world</strong> and <em>friends</em>";

    const wrappers = wrapRangeSegments({
      root,
      start: 3,
      end: 16,
      createWrapper: ({ globalStart, globalEnd }) => {
        const span = document.createElement("span");
        span.dataset.segment = `${globalStart}-${globalEnd}`;
        return span;
      },
    });

    expect(wrappers.length).toBeGreaterThanOrEqual(2);
    const wrappedText = wrappers.map((wrapper) => wrapper.textContent).join("");
    expect(wrappedText).toBe("lo world and ");
  });

  it("returns null/empty for invalid ranges or missing root", () => {
    expect(mapGlobalRangeToDom(null, 0, 1)).toBeNull();
    expect(mapGlobalRangeToDom(document.createElement("div"), 0, 0)).toBeNull();

    expect(
      wrapRangeSegments({
        root: document.createElement("div"),
        start: 5,
        end: 5,
        createWrapper: () => document.createElement("span"),
      }),
    ).toEqual([]);

    expect(
      surroundRange({
        root: null,
        start: 0,
        end: 1,
        createWrapper: () => document.createElement("span"),
      }),
    ).toBeNull();
  });
});
