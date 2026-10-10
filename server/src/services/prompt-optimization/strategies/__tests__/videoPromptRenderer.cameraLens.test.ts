import { describe, expect, it } from "vitest";

import {
  renderMainVideoPrompt,
  renderCompactVideoPrompt,
  renderPreviewPrompt,
} from "../videoPromptRenderer.js";
import type { VideoPromptSlots } from "../videoPromptTypes.js";

function baseSlots(
  overrides: Partial<VideoPromptSlots> = {},
): VideoPromptSlots {
  return {
    shot_framing: "Wide Shot",
    camera_angle: "Eye-Level Shot",
    camera_move: "slow dolly in",
    camera_lens: null,
    subject: "a ginger cat",
    subject_details: ["with green eyes", "wearing a red collar"],
    action: "walking slowly across the sunlit kitchen floor",
    setting: "a sunlit kitchen",
    time: "golden hour",
    lighting: "warm key from a tall window, soft fill from the right",
    style: "Wes Anderson aesthetic, pastel palette",
    ...overrides,
  };
}

describe("renderMainVideoPrompt — camera_lens slot", () => {
  it("falls back to focusFromFraming when camera_lens is null (back-compat)", () => {
    const output = renderMainVideoPrompt(baseSlots({ camera_lens: null }));
    // Wide Shot → "deep focus" preserved
    expect(output).toContain("deep focus");
  });
});

describe("renderCompactVideoPrompt — camera_lens slot", () => {
  it("renders 'on {camera_lens}' when present", () => {
    const output = renderCompactVideoPrompt(
      baseSlots({ camera_lens: "85mm prime at f/1.8" }),
      { require: ["camera"] },
    );
    expect(output).toContain("on 85mm prime at f/1.8");
  });

  it("omits lens phrase when camera_lens is null", () => {
    const output = renderCompactVideoPrompt(baseSlots({ camera_lens: null }), {
      require: ["camera"],
    });
    expect(output).not.toContain("f/");
  });
});

describe("renderPreviewPrompt — camera_lens slot", () => {
  it("renders 'on {camera_lens}' when present", () => {
    const output = renderPreviewPrompt(
      baseSlots({ camera_lens: "anamorphic 50mm at f/2.8" }),
    );
    expect(output).toContain("on anamorphic 50mm at f/2.8");
  });
});
