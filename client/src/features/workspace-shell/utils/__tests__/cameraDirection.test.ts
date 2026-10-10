import { describe, expect, it } from "vitest";
import { TAXONOMY } from "@shared/taxonomy";
import { writeCameraDirection } from "../cameraDirection";

/**
 * ADR-0022 D7: the chosen camera path "lands in the input as an editable
 * camera span that replaces rather than accumulates, per ADR-0010's truth
 * contract", and a locked or pre-existing camera span is surfaced, never
 * silently overwritten.
 */

const PROMPT = "A clockmaker adjusts a brass clock in a dim workshop.";
const PAN_LEFT = "The camera pans left.";
const PUSH_IN = "The camera pushes in.";

describe("writeCameraDirection", () => {
  it("appends the direction as a camera span when the words hold none", () => {
    const result = writeCameraDirection({
      prompt: PROMPT,
      direction: PAN_LEFT,
    });

    expect(result.outcome).toBe("written");
    if (result.outcome !== "written") throw new Error("expected a write");

    expect(result.prompt).toBe(`${PROMPT} ${PAN_LEFT}`);
    expect(result.span.category).toBe(TAXONOMY.CAMERA.id);
    expect(result.prompt.slice(result.span.start, result.span.end)).toBe(
      PAN_LEFT,
    );
  });

  it("replaces the previous direction rather than accumulating a second one", () => {
    const first = writeCameraDirection({ prompt: PROMPT, direction: PAN_LEFT });
    if (first.outcome !== "written") throw new Error("expected a write");

    const second = writeCameraDirection({
      prompt: first.prompt,
      direction: PUSH_IN,
      previousDirection: PAN_LEFT,
    });

    expect(second.outcome).toBe("written");
    if (second.outcome !== "written") throw new Error("expected a write");

    expect(second.prompt).toBe(`${PROMPT} ${PUSH_IN}`);
    expect(second.prompt).not.toContain(PAN_LEFT);
    expect(second.prompt.slice(second.span.start, second.span.end)).toBe(
      PUSH_IN,
    );
  });
});
