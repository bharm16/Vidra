import { describe, expect, it } from "vitest";

import { edgePath } from "../edgePath";

describe("edgePath", () => {
  it("draws a horizontal-tangent bezier from source to target", () => {
    // Control points sit at the horizontal midpoint, keeping the curve tangent
    // to horizontal at both ends — the handoff's spine connector.
    expect(edgePath({ x: 0, y: 0 }, { x: 100, y: 40 })).toBe(
      "M0,0 C50,0 50,40 100,40",
    );
  });

  it("stays flat (straight) when both ends share a row", () => {
    expect(edgePath({ x: 10, y: 20 }, { x: 90, y: 20 })).toBe(
      "M10,20 C50,20 50,20 90,20",
    );
  });

  it("rounds sub-pixel coordinates so the path string stays clean", () => {
    expect(edgePath({ x: 0.4, y: 0.6 }, { x: 101.5, y: 39.2 })).toBe(
      "M0,1 C51,1 51,39 102,39",
    );
  });
});
