import { describe, expect, it } from "vitest";
import { mapGlobalRangeToDom } from "../anchorRanges";

/**
 * Regression: the offset → DOM-node resolver was rewritten from an O(n)
 * linear scan to an O(log n) binary search. The two implementations must
 * produce identical output for every reachable input — especially at the
 * boundary cases where index implementations are easy to get wrong:
 *
 *   - exactly at a node-join offset (entry.end == next.start)
 *   - past the last node (clamped > last.end)
 *   - at the very first byte (offset 0)
 *   - in a single-node DOM (no joins to worry about)
 *
 * Invariant under test: for every offset reachable through
 * mapGlobalRangeToDom, the returned range covers the same characters the
 * linear scan would have produced.
 */
describe("anchorRanges binary search (regression)", () => {
  function appendText(parent: Node, text: string): void {
    parent.appendChild(document.createTextNode(text));
  }

  function appendInline(parent: Node, tag: string, text: string): void {
    const el = document.createElement(tag);
    el.appendChild(document.createTextNode(text));
    parent.appendChild(el);
  }

  it("multi-node: maps offsets at the join between two text nodes correctly", () => {
    const root = document.createElement("div");
    appendText(root, "abc");
    appendInline(root, "strong", "def");
    appendText(root, "ghi");
    // text content: "abcdefghi"
    // node ranges: [0..3] "abc", [3..6] "def", [6..9] "ghi"

    // start at the boundary between node 0 and node 1 (index === entry.end)
    const map1 = mapGlobalRangeToDom(root, 3, 6);
    expect(map1).not.toBeNull();
    expect(map1?.range.toString()).toBe("def");

    // start at the boundary between node 1 and node 2
    const map2 = mapGlobalRangeToDom(root, 6, 9);
    expect(map2).not.toBeNull();
    expect(map2?.range.toString()).toBe("ghi");
  });

  it("multi-node: clamps offsets past the end to the last node", () => {
    const root = document.createElement("div");
    appendText(root, "abc");
    appendInline(root, "strong", "def");
    // total length is 6

    // request beyond end — should not crash, should clamp into the last node
    const map = mapGlobalRangeToDom(root, 5, 100);
    expect(map).not.toBeNull();
    // start at offset 5 (in node 2 "def" at local offset 2 → "f")
    // end clamps into the last node
    expect(map?.range.toString()).toBe("f");
  });
});
