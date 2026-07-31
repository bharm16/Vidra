/**
 * Regression: Auto-mode EDIT turns must not run on the cheapest editor.
 *
 * "Auto routing = cheapest capable" sent precision edits to the speed-tier
 * lite model, which repaints instead of preserving: a recolor decision with
 * a flawless instruction ("keep the exact silhouette, pose, proportions…")
 * came back as a different fox. The decision, source image, and instruction
 * were all correct — the executor was the fidelity leak.
 *
 * Ruling (narrow amendment): edits route to the designated standard editor;
 * cheapest-capable still governs every other capability; the lite tier
 * stays reachable by pinning it.
 */
import { describe, expect, it } from "vitest";
import { StudioModelRegistry } from "../StudioModelRegistry";

describe("StudioModelRegistry edit default (regression)", () => {
  const registry = new StudioModelRegistry();

  it("routes Auto edits to the standard editor, not the cheapest", () => {
    const editDefault = registry.editDefault();

    expect(editDefault.slug).toBe("nano-banana-2");
    expect(editDefault.capabilities).toContain("edit");
  });

  it("keeps the carve-out meaningful: a cheaper edit-capable tier exists", () => {
    const cheapest = registry.cheapestCapable("edit");
    const editDefault = registry.editDefault();

    // If the cheapest editor ever becomes the standard editor, this ruling
    // is moot and the carve-out should be deleted rather than left as lore.
    expect(cheapest.costCentsPerCall).toBeLessThan(
      editDefault.costCentsPerCall,
    );
  });

  it("leaves non-edit Auto routing on cheapest-capable", () => {
    const generate = registry.cheapestCapable("general");
    const candidates = registry
      .listModels()
      .filter((entry) => entry.capabilities.includes("general"));

    for (const candidate of candidates) {
      expect(generate.costCentsPerCall).toBeLessThanOrEqual(
        candidate.costCentsPerCall,
      );
    }
  });
});
