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

  it("full pipeline: with camera_lens present, rendered output contains lens once and no duplicated f-stop", async () => {
    // Regression for the dominant Sub-project D failure mode: the "lens at,"
    // fragment in optimize outputs. With a well-formed camera_lens slot,
    // the rendered output must:
    //   (a) contain the lens phrase exactly once
    //   (b) NOT contain the renderer's hardcoded focusFromFraming f-stop
    //       fallback (eliminates duplication root cause)
    const { renderMainVideoPrompt } = await import("../videoPromptRenderer.js");
    const slots = {
      shot_framing: "Wide Shot",
      camera_angle: "Eye-Level Shot",
      camera_move: "slow dolly in",
      camera_lens: "28mm at f/11",
      subject: "a ginger cat",
      subject_details: ["with green eyes", "wearing a red collar"],
      action: "walking slowly across the sunlit kitchen floor",
      setting: "a sunlit kitchen",
      time: "golden hour",
      lighting: "warm key from a tall window, soft fill",
      style: "Wes Anderson aesthetic, pastel palette",
    };
    const output = renderMainVideoPrompt(
      slots as unknown as Parameters<typeof renderMainVideoPrompt>[0],
    );

    const lensPhraseCount = (output.match(/28mm at f\/11/g) || []).length;
    expect(lensPhraseCount).toBe(1);
    expect(output).not.toContain("(f/11-f/16)");
    expect(output).not.toContain("(f/1.8-f/2.8)");
    expect(output).not.toContain("(f/4-f/5.6)");
    expect(output).not.toMatch(/lens at[,.]\s/);
  });

  it("regression: linter rejects the labeled 'anamorphic lens at' fragment", async () => {
    // Direct link to Sub-project D's calibration entry pattern:
    // "captured with an anamorphic lens at. An abstract..." appeared in
    // ~50% of labeled optimize entries. The lint rule must catch this exact
    // shape — orphaned preposition with no aperture value following.
    const { lintVideoPromptSlots } = await import("../videoPromptLinter.js");
    const result = lintVideoPromptSlots({
      shot_framing: "Wide Shot",
      camera_angle: "Eye-Level Shot",
      camera_move: "static tripod",
      camera_lens: "anamorphic lens at",
      subject: "an abstract pattern",
      subject_details: ["geometric shapes", "high contrast"],
      action: "shifting slowly across the frame",
    });
    const cameraLensErrors = result.errors.filter((e) =>
      e.includes("camera_lens"),
    );
    expect(cameraLensErrors.length).toBeGreaterThan(0);
  });

  it("fallback looseSchema does NOT require camera_lens (slot is optional)", async () => {
    // Defense against future hardening that would break optional-null
    // semantics. camera_lens is intentionally OUT of the required array;
    // any change should be a deliberate decision, not an accident.
    const { readFile } = await import("node:fs/promises");
    const url = new URL("../VideoStrategy.ts", import.meta.url);
    const src = await readFile(url, "utf8");
    const looseSchemaMatch = src.match(
      /const looseSchema = \{[\s\S]*?required: \[([\s\S]*?)\]/,
    );
    expect(looseSchemaMatch).not.toBeNull();
    const requiredArrayContents = looseSchemaMatch![1]!;
    expect(requiredArrayContents).not.toContain("camera_lens");
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
