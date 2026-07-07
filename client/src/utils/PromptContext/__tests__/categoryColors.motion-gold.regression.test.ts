import { describe, it, expect } from "vitest";
import { getCategoryColor } from "@/utils/PromptContext/categoryStyles";

// M3 slice 3 / ADR-0010 (S2 painting): motion phrases — camera movement and
// subject action — render in gold, the "not in the picture / this drives the
// video" receipt. Gold is #d3a44e → rgba(211, 164, 78, *). This locks the two
// motion categories to gold and keeps a picture-describing category (subject)
// distinct, so the treatment stays derived from labels (absent when labeling
// produces no motion spans).
describe("regression: motion categories render gold (M3)", () => {
  const GOLD = {
    bg: "rgba(211, 164, 78, 0.15)",
    border: "rgba(211, 164, 78, 0.35)",
    ring: "rgba(211, 164, 78, 0.18)",
  };

  it("camera (camera movement) resolves to gold", () => {
    expect(getCategoryColor("camera")).toEqual(GOLD);
  });

  it("action (subject action) resolves to gold", () => {
    expect(getCategoryColor("action")).toEqual(GOLD);
  });

  it("a picture-describing category (subject) is not gold", () => {
    expect(getCategoryColor("subject").border).not.toBe(GOLD.border);
  });
});
