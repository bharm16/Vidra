import { describe, expect, it } from "vitest";

import { lintVideoPromptSlots } from "../videoPromptLinter.js";
import type { VideoPromptSlots } from "../videoPromptTypes.js";

function baseSlots(
  overrides: Partial<VideoPromptSlots>,
): Partial<VideoPromptSlots> {
  return {
    shot_framing: "Wide Shot",
    camera_angle: "Eye-Level Shot",
    camera_move: "slow dolly in",
    subject: "a ginger cat",
    subject_details: ["with green eyes", "wearing a red collar"],
    action: "walking slowly across a sunlit kitchen floor",
    setting: "a sunlit kitchen",
    time: "golden hour",
    lighting: "warm key from window, soft fill",
    style: "Wes Anderson, pastel palette",
    ...overrides,
  };
}

/**
 * Severity is part of the linter's interface, not something callers should
 * rediscover by matching message prose. These cases pin the severity of one
 * finding per class so a reworded message can never silently change whether
 * the strategy repairs, rerolls, or ships the slots as-is.
 */
describe("videoPromptLinter — typed findings", () => {
  it("reports a clean slot set with no findings", () => {
    const result = lintVideoPromptSlots(baseSlots({}));

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("marks a missing shot_framing critical", () => {
    const slots = baseSlots({});
    delete slots.shot_framing;
    const result = lintVideoPromptSlots(slots);

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "missing_shot_framing",
        severity: "critical",
      }),
    );
  });

  it("marks framing-that-is-really-an-angle critical", () => {
    const result = lintVideoPromptSlots(
      baseSlots({ shot_framing: "Low-Angle View" }),
    );

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "shot_framing_is_angle",
        severity: "critical",
      }),
    );
  });

  it("marks a missing camera_angle critical", () => {
    const slots = baseSlots({});
    delete slots.camera_angle;
    const result = lintVideoPromptSlots(slots);

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "missing_camera_angle",
        severity: "critical",
      }),
    );
  });

  it("marks orphaned subject_details critical", () => {
    const result = lintVideoPromptSlots(
      baseSlots({ subject: null, subject_details: ["with green eyes"] }),
    );

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "subject_details_must_be_null",
        severity: "critical",
      }),
    );
  });

  it("marks viewer-facing language a quality finding", () => {
    const result = lintVideoPromptSlots(
      baseSlots({ setting: "a kitchen inviting the viewer in" }),
    );

    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "viewer_language", severity: "quality" }),
    );
  });

  it("marks generic style a quality finding", () => {
    const result = lintVideoPromptSlots(baseSlots({ style: "cinematic" }));

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "style_too_generic",
        severity: "quality",
      }),
    );
  });

  it("marks a non-participle action a quality finding", () => {
    const result = lintVideoPromptSlots(
      baseSlots({ action: "walks slowly across the sunlit kitchen floor" }),
    );

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "action_not_present_participle",
        severity: "quality",
      }),
    );
  });

  it("marks a dangling camera_lens preposition a quality finding", () => {
    const result = lintVideoPromptSlots(
      baseSlots({ camera_lens: "35mm lens at" }),
    );

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "camera_lens_dangling_preposition",
        severity: "quality",
      }),
    );
  });

  it("marks an over-long action minor (shape is fine, length is not)", () => {
    const result = lintVideoPromptSlots(
      baseSlots({
        action:
          "walking very slowly across the wide sunlit kitchen floor toward the far window ledge",
      }),
    );

    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "action_too_long", severity: "minor" }),
    );
  });

  it("marks non-cinematographic camera_move minor", () => {
    const result = lintVideoPromptSlots(
      baseSlots({ camera_move: "camera goes closer" }),
    );

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "camera_move_not_cinematographic",
        severity: "minor",
      }),
    );
  });

  it("keeps `errors` as the message-only projection of findings", () => {
    const result = lintVideoPromptSlots(baseSlots({ style: "cinematic" }));

    expect(result.errors).toEqual(result.findings.map((f) => f.message));
  });
});
