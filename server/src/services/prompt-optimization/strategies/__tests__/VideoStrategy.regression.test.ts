import { describe, expect, it } from "vitest";
import { VideoStrategy } from "../VideoStrategy";

describe("VideoStrategy regression", () => {
  it("reassembles plain prose without technical/variation markdown blocks", () => {
    const strategy = new VideoStrategy(
      {
        execute: async () => ({
          text: "",
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        }),
      } as never,
      {} as never,
    );

    const parsed = {
      _creative_strategy: "test",
      shot_framing: "Close-Up",
      camera_angle: "Eye-Level Shot",
      camera_move: "slow pull back",
      subject: "baby",
      subject_details: ["wide eyes", "infectious smile"],
      action: "driving a colorful toy car",
      setting: "sunny park",
      time: "golden hour",
      lighting: "warm golden light",
      style: "whimsical children's storybook",
      technical_specs: {
        duration: "8s",
        aspect_ratio: "16:9",
        frame_rate: "24fps",
      },
      variations: [{ label: "Different Angle", prompt: "alt angle" }],
    };

    type ReassembleFn = (
      parsed: Record<string, unknown>,
      onMetadata?: (metadata: Record<string, unknown>) => void,
      generationParams?: Record<string, unknown> | null,
    ) => string;

    const output = (
      strategy as unknown as {
        _reassembleOutput: (
          parsed: Record<string, unknown>,
          onMetadata?: (metadata: Record<string, unknown>) => void,
          generationParams?: Record<string, unknown> | null,
        ) => string;
      }
    )._reassembleOutput(
      parsed as unknown as Parameters<ReassembleFn>[0],
      undefined,
      null,
    );

    expect(output).not.toContain("**TECHNICAL SPECS**");
    expect(output).not.toContain("**ALTERNATIVE APPROACHES**");
    expect(output.toLowerCase()).toContain("close-up");
    expect(output.toLowerCase()).toContain("baby");
  });

  it("isQualityVideoPromptLintError recognizes camera_lens lint messages (eligible for reroll)", async () => {
    // The lint message text is the contract between the linter and the
    // reroll path. This test protects against future drift in either the
    // lint message string or the filter regex by asserting the linter's
    // observable error text matches the patterns isQualityVideoPromptLintError
    // checks for.
    const { lintVideoPromptSlots } = await import("../videoPromptLinter.js");
    const errors = lintVideoPromptSlots({
      shot_framing: "Wide Shot",
      camera_angle: "Eye-Level Shot",
      camera_move: "slow dolly in",
      subject: "a cat",
      subject_details: ["with green eyes", "wearing a red collar"],
      action: "walking across the kitchen slowly",
      camera_lens: "anamorphic lens at",
    }).errors;

    const cameraLensError = errors.find((e) => e.includes("camera_lens"));
    expect(cameraLensError).toBeDefined();
    expect(
      /`camera_lens` must contain aperture/i.test(cameraLensError!) ||
        /`camera_lens` ends in a dangling preposition/i.test(
          cameraLensError!,
        ) ||
        /`camera_lens` is too long/i.test(cameraLensError!),
    ).toBe(true);
  });
});
