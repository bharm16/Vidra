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

describe("videoPromptLinter — camera_lens validation", () => {
  it("accepts null camera_lens (slot is optional)", () => {
    const result = lintVideoPromptSlots(baseSlots({ camera_lens: null }));
    expect(result.errors.filter((e) => e.includes("camera_lens"))).toEqual([]);
  });

  it("accepts undefined camera_lens (slot is optional)", () => {
    const result = lintVideoPromptSlots(baseSlots({}));
    expect(result.errors.filter((e) => e.includes("camera_lens"))).toEqual([]);
  });

  it("accepts a valid focal-length + aperture string", () => {
    const result = lintVideoPromptSlots(
      baseSlots({ camera_lens: "28mm at f/11" }),
    );
    expect(result.errors.filter((e) => e.includes("camera_lens"))).toEqual([]);
  });

  it("accepts an anamorphic descriptor with aperture", () => {
    const result = lintVideoPromptSlots(
      baseSlots({ camera_lens: "anamorphic 50mm at f/2.8" }),
    );
    expect(result.errors.filter((e) => e.includes("camera_lens"))).toEqual([]);
  });

  it("rejects orphaned-preposition fragment like 'anamorphic lens at'", () => {
    const result = lintVideoPromptSlots(
      baseSlots({ camera_lens: "anamorphic lens at" }),
    );
    const cameraLensErrors = result.errors.filter((e) =>
      e.includes("camera_lens"),
    );
    expect(cameraLensErrors.length).toBeGreaterThan(0);
    expect(
      cameraLensErrors.some(
        (e) => /dangling preposition/i.test(e) || /aperture/i.test(e),
      ),
    ).toBe(true);
  });

  it("rejects a string with no aperture and no focal-length unit", () => {
    const result = lintVideoPromptSlots(
      baseSlots({ camera_lens: "a beautiful cinematic shot" }),
    );
    const cameraLensErrors = result.errors.filter((e) =>
      e.includes("camera_lens"),
    );
    expect(cameraLensErrors.length).toBeGreaterThan(0);
  });

  it("rejects camera_lens longer than 12 words", () => {
    const result = lintVideoPromptSlots(
      baseSlots({
        camera_lens:
          "28mm at f/11 with a vintage Cooke prime lens and a soft anti-flare coating please use this exactly",
      }),
    );
    const cameraLensErrors = result.errors.filter((e) =>
      e.includes("camera_lens"),
    );
    expect(cameraLensErrors.length).toBeGreaterThan(0);
    expect(cameraLensErrors.some((e) => /too long/i.test(e))).toBe(true);
  });
});
