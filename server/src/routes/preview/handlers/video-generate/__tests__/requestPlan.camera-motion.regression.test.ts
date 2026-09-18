import { describe, expect, it } from "vitest";
import { buildVideoRequestPlan } from "../requestPlan";

/**
 * ADR-0022 decision 7, "no hidden channel": "any provider option a camera
 * choice implies travels by name and is documented; a camera choice never
 * changes generation behavior the creator cannot see."
 *
 * A chosen camera id used to flip `promptExtend` off for image-to-video
 * requests. Nothing about that crossed the wire to the creator: two requests
 * with identical visible words and an identical model behaved differently
 * because a camera chip had been clicked. The camera choice now lands in the
 * words themselves, so the coupling is gone rather than documented.
 *
 * The assertion below is exhaustive on purpose — a `toEqual` on the whole
 * options object, not a `not.toHaveProperty`. Anything a future camera
 * feature quietly adds fails here.
 */

const CREATOR_WORDS =
  "A clockmaker adjusts a brass clock in a dim workshop. The camera pushes in.";

const planWith = (generationParams: Record<string, unknown>) =>
  buildVideoRequestPlan({
    generationParams,
    model: "wan-2.5",
    operation: "generateVideoPreview",
    requestId: "req-camera-1",
    userId: "user-1",
    costModel: "wan-video/wan-2.5-i2v",
    cleanedPrompt: CREATOR_WORDS,
    resolvedStartImage: "https://example.com/frame.png",
    aspectRatio: "16:9",
    faceSwapAlreadyApplied: false,
    swappedImageUrl: null,
  });

describe("regression: a camera choice adds nothing the creator cannot see", () => {
  it("submits the creator's visible words plus documented options, and nothing else", () => {
    const result = planWith({
      duration_s: 5,
      aspect_ratio: "16:9",
      camera_motion_id: "push_in",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected plan to succeed");

    // The queued prompt is the creator's text verbatim — no motion prose
    // spliced in (ADR-0010's truth contract).
    // Every entry here traces to something the creator set or the model's
    // own capability defaults — nothing to the camera choice.
    expect(result.value.options).toEqual({
      aspectRatio: "16:9",
      model: "wan-2.5",
      startImage: "https://example.com/frame.png",
      seconds: "5",
      seed: 0,
      size: "720p",
    });
  });

  it("builds the same options with and without a camera choice", () => {
    const withCamera = planWith({
      duration_s: 5,
      aspect_ratio: "16:9",
      camera_motion_id: "push_in",
    });
    const withoutCamera = planWith({ duration_s: 5, aspect_ratio: "16:9" });

    expect(withCamera.ok && withoutCamera.ok).toBe(true);
    if (!withCamera.ok || !withoutCamera.ok) {
      throw new Error("Expected both plans to succeed");
    }

    expect(withCamera.value.options).toEqual(withoutCamera.value.options);
  });

  it("still resolves the camera id for telemetry without letting it steer the run", () => {
    const result = planWith({
      duration_s: 5,
      aspect_ratio: "16:9",
      camera_motion_id: "push_in",
    });
    if (!result.ok) throw new Error("Expected plan to succeed");

    expect(result.value.motionContext.cameraMotionId).toBe("push_in");
    expect(result.value).not.toHaveProperty("disablePromptExtend");
    expect(result.value).not.toHaveProperty("promptWithMotion");
    expect(result.value).not.toHaveProperty("motionGuidanceAppended");
  });
});
