import { describe, expect, it } from "vitest";
import { VideoStrategy } from "../VideoStrategy";

describe("VideoStrategy regression", () => {
  it("renders plain prose without technical/variation markdown blocks", () => {
    const strategy = new VideoStrategy({
      execute: async () => ({
        text: "",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      }),
    } as never);

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

    // Through the public interface: rendering is what callers get, and the
    // private reassemble helper this used to reach into is gone.
    const output = strategy.renderStructuredPrompt(parsed as never);

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

  it("makes a malformed camera_lens eligible for reroll on severity, not wording", async () => {
    // The contract between the linter and the reroll path is `severity`, not
    // the message text. This test used to assert that the message matched the
    // strategy's filter regexes — meaning a reworded message silently disabled
    // the reroll.
    const { lintVideoPromptSlots } = await import("../videoPromptLinter.js");
    const { decideSlotRepair } = await import(
      "../video/slots/decideSlotRepair.js"
    );

    const lint = lintVideoPromptSlots({
      shot_framing: "Wide Shot",
      camera_angle: "Eye-Level Shot",
      camera_move: "slow dolly in",
      subject: "a cat",
      subject_details: ["with green eyes", "wearing a red collar"],
      action: "walking across the kitchen slowly",
      camera_lens: "anamorphic lens at",
    });

    const lensFindings = lint.findings.filter((finding) =>
      finding.code.startsWith("camera_lens_"),
    );
    expect(lensFindings.length).toBeGreaterThan(0);
    expect(
      lensFindings.every((finding) => finding.severity === "quality"),
    ).toBe(true);

    const decision = decideSlotRepair({
      findings: lint.findings,
      completenessScore: 1,
      minAcceptableScore: 0.5,
    });
    expect(decision.shouldRepair).toBe(true);
    expect(decision.rerollAttempts).toBe(3);
  });
});
