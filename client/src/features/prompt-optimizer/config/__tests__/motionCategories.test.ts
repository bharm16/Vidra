import { describe, expect, it } from "vitest";
import { isMotionCategory } from "../motionCategories";

/**
 * Motion categories (ADR-0010 S2): camera and subject action "drive the video,
 * not the picture". The predicate keys off the span's declared taxonomy parent —
 * a taxonomy lookup, never text classification.
 */
describe("isMotionCategory", () => {
  it("treats the two motion parents as motion", () => {
    expect(isMotionCategory("camera")).toBe(true);
    expect(isMotionCategory("action")).toBe(true);
  });

  it("resolves a child attribute to its parent before deciding", () => {
    expect(isMotionCategory("camera.movement")).toBe(true);
    expect(isMotionCategory("action.gesture")).toBe(true);
  });

  it("treats picture categories as not motion", () => {
    expect(isMotionCategory("subject")).toBe(false);
    expect(isMotionCategory("style")).toBe(false);
    expect(isMotionCategory("shot")).toBe(false);
    expect(isMotionCategory("subject.wardrobe")).toBe(false);
  });

  it("is false for absent or empty categories", () => {
    expect(isMotionCategory(undefined)).toBe(false);
    expect(isMotionCategory(null)).toBe(false);
    expect(isMotionCategory("")).toBe(false);
  });
});
