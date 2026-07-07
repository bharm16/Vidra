import { describe, expect, it } from "vitest";
import { failureCopy } from "../failureCopy";
import type { FailureKind } from "../deriveWorkspaceStage";

/**
 * The per-stage failure copy (ADR-0010 / M4 "nothing punishes"): every failure
 * states what failed, offers a retry verb, and — for the paid generation stages
 * — says nothing was charged. Rendered from the derived {stage, failure} flag.
 */
describe("failureCopy", () => {
  const ALL: FailureKind[] = [
    "writing",
    "labeling",
    "picture",
    "motion",
    "video",
  ];

  it("gives every failure kind a message and a retry verb", () => {
    for (const kind of ALL) {
      const copy = failureCopy(kind);
      expect(copy.message.length).toBeGreaterThan(0);
      expect(copy.retryLabel.length).toBeGreaterThan(0);
    }
  });

  it("says nothing was charged for the paid generation stages only", () => {
    expect(failureCopy("picture").notCharged).toBe(true);
    expect(failureCopy("motion").notCharged).toBe(true);
    expect(failureCopy("video").notCharged).toBe(true);
    // Writing (expansion) and labeling are free — no charge line.
    expect(failureCopy("writing").notCharged).toBe(false);
    expect(failureCopy("labeling").notCharged).toBe(false);
  });

  it("names the picture and clip in their respective failures", () => {
    expect(failureCopy("picture").message.toLowerCase()).toContain("picture");
    expect(failureCopy("video").message.toLowerCase()).toContain("clip");
  });
});
