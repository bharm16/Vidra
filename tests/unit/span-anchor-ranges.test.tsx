import { describe, expect, it } from "vitest";

import {
  mapGlobalRangeToDom,
  surroundRange,
  wrapRangeSegments,
} from "@features/span-highlighting/utils/anchorRanges";

describe("anchorRanges", () => {
  it("maps global range to DOM range", () => {
    const root = document.createElement("div");
    root.textContent = "Hello world";

    const mapping = mapGlobalRangeToDom(root, 6, 11);

    expect(mapping?.range.toString()).toBe("world");
  });

  it("surrounds range with wrapper", () => {
    const root = document.createElement("div");
    root.textContent = "Hello world";

    const wrapper = surroundRange({
      root,
      start: 0,
      end: 5,
      createWrapper: () => document.createElement("mark"),
    });

    expect(wrapper?.tagName).toBe("MARK");
    expect(wrapper?.textContent).toBe("Hello");
  });

  it("wraps range segments across text nodes", () => {
    const root = document.createElement("div");
    root.appendChild(document.createTextNode("Hello "));
    const span = document.createElement("span");
    span.textContent = "world";
    root.appendChild(span);

    const wrappers = wrapRangeSegments({
      root,
      start: 0,
      end: 11,
      createWrapper: () => document.createElement("mark"),
    });

    expect(wrappers.length).toBeGreaterThan(0);
    expect(wrappers[0]?.textContent).toContain("Hello");
  });
});
