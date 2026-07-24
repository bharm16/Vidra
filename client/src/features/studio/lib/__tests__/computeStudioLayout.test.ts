import { describe, it, expect } from "vitest";
import {
  computeStudioLayout,
  STUDIO_CELL_SIZE,
  STUDIO_CELL_GAP,
  STUDIO_GROUP_GAP,
} from "../computeStudioLayout";

describe("computeStudioLayout", () => {
  it("lays a 4-image batch out as a 2×2 grid", () => {
    const items = computeStudioLayout([
      { turnId: "t1", imageIds: ["a", "b", "c", "d"] },
    ]);

    expect(items).toHaveLength(4);
    const [a, b, c, d] = items;
    // Two columns: a|b on the first row, c|d on the second.
    expect(a?.y).toBe(b?.y);
    expect(c?.y).toBe(d?.y);
    expect(c?.y).toBe(STUDIO_CELL_SIZE + STUDIO_CELL_GAP);
    expect(a?.x).toBe(c?.x);
    expect(b?.x ?? 0 - (a?.x ?? 0)).toBeGreaterThan(0);
  });

  it("treats a single-image result as one cell, never a grid with blanks", () => {
    const items = computeStudioLayout([{ turnId: "t1", imageIds: ["only"] }]);
    expect(items).toHaveLength(1);
    expect(items[0]?.y).toBe(0);
  });

  it("stacks groups chronologically downward with a group gap", () => {
    const items = computeStudioLayout([
      { turnId: "t1", imageIds: ["a", "b", "c", "d"] },
      { turnId: "t2", imageIds: ["e"] },
    ]);

    const firstGroupHeight = 2 * STUDIO_CELL_SIZE + STUDIO_CELL_GAP;
    const e = items.find((item) => item.imageId === "e");
    expect(e?.y).toBe(firstGroupHeight + STUDIO_GROUP_GAP);
    expect(e?.turnId).toBe("t2");
  });

  it("centers each group on x = 0", () => {
    const items = computeStudioLayout([
      { turnId: "t1", imageIds: ["a", "b", "c", "d"] },
      { turnId: "t2", imageIds: ["e"] },
    ]);

    const row = items.filter((item) => item.turnId === "t1" && item.y === 0);
    const left = Math.min(...row.map((item) => item.x));
    const right = Math.max(...row.map((item) => item.x + item.size));
    expect(left + right).toBeCloseTo(0);

    const single = items.find((item) => item.imageId === "e");
    expect((single?.x ?? 0) + (single?.size ?? 0) / 2).toBeCloseTo(0);
  });

  it("skips empty groups (a failed turn adds nothing to the plane)", () => {
    const items = computeStudioLayout([
      { turnId: "t1", imageIds: [] },
      { turnId: "t2", imageIds: ["a"] },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.y).toBe(0);
  });

  it("is deterministic — same input, same output", () => {
    const groups = [
      { turnId: "t1", imageIds: ["a", "b", "c", "d"] },
      { turnId: "t2", imageIds: ["e", "f"] },
    ];
    expect(computeStudioLayout(groups)).toEqual(computeStudioLayout(groups));
  });
});
