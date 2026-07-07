import { describe, expect, it } from "vitest";

import { buildMotionGuidance } from "../motionVocabulary.js";

describe("buildMotionGuidance (D6 — motion vocabulary bias)", () => {
  it("returns camera-motion vocabulary for a camera span", () => {
    const guidance = buildMotionGuidance("camera.movement");
    expect(guidance).not.toBeNull();
    expect(guidance).toContain("dolly");
  });

  it("returns subject-motion vocabulary for an action span", () => {
    const guidance = buildMotionGuidance("action.movement");
    expect(guidance).not.toBeNull();
    expect(guidance).toContain("gesturing");
  });

  it("distinguishes camera-motion from subject-motion guidance", () => {
    expect(buildMotionGuidance("camera.movement")).not.toBe(
      buildMotionGuidance("action"),
    );
  });

  it("returns null for categories that describe the still picture", () => {
    expect(buildMotionGuidance("subject")).toBeNull();
    expect(buildMotionGuidance("shot.type")).toBeNull();
    expect(buildMotionGuidance("style.colorGrade")).toBeNull();
    expect(buildMotionGuidance(null)).toBeNull();
    expect(buildMotionGuidance(undefined)).toBeNull();
  });
});
