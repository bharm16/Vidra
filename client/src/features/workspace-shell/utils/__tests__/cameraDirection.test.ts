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

  it("surfaces a conflict instead of overwriting camera words the creator wrote", () => {
    const prompt = `${PROMPT} A slow dolly follows him.`;
    const cameraQuote = "A slow dolly follows him.";

    const result = writeCameraDirection({
      prompt,
      direction: PAN_LEFT,
      spans: [
        {
          start: prompt.indexOf(cameraQuote),
          end: prompt.indexOf(cameraQuote) + cameraQuote.length,
          category: "camera.movement",
        },
      ],
    });

    expect(result).toEqual({
      outcome: "conflict",
      conflict: "existing-camera-span",
      conflictText: cameraQuote,
    });
  });

  it("replaces the creator's camera words only when the replace is explicit", () => {
    const prompt = `${PROMPT} A slow dolly follows him.`;
    const cameraQuote = "A slow dolly follows him.";

    const result = writeCameraDirection({
      prompt,
      direction: PAN_LEFT,
      replaceExistingCameraSpan: true,
      spans: [
        {
          start: prompt.indexOf(cameraQuote),
          end: prompt.indexOf(cameraQuote) + cameraQuote.length,
          category: "camera.movement",
        },
      ],
    });

    expect(result.outcome).toBe("written");
    if (result.outcome !== "written") throw new Error("expected a write");
    expect(result.prompt).toBe(`${PROMPT} ${PAN_LEFT}`);
  });

  it("never overwrites a locked span, even when the replace is explicit", () => {
    const prompt = `${PROMPT} A slow dolly follows him.`;
    const cameraQuote = "A slow dolly follows him.";

    const result = writeCameraDirection({
      prompt,
      direction: PAN_LEFT,
      replaceExistingCameraSpan: true,
      spans: [
        {
          start: prompt.indexOf(cameraQuote),
          end: prompt.indexOf(cameraQuote) + cameraQuote.length,
          category: "camera.movement",
        },
      ],
      lockedSpans: [{ id: "locked-1", text: cameraQuote }],
    });

    expect(result).toEqual({
      outcome: "conflict",
      conflict: "locked",
      conflictText: cameraQuote,
    });
  });

  it("never overwrites its own direction once the creator locks it", () => {
    const prompt = `${PROMPT} ${PAN_LEFT}`;

    const result = writeCameraDirection({
      prompt,
      direction: PUSH_IN,
      previousDirection: PAN_LEFT,
      lockedSpans: [{ id: "locked-1", text: PAN_LEFT }],
    });

    expect(result).toEqual({
      outcome: "conflict",
      conflict: "locked",
      conflictText: PAN_LEFT,
    });
  });

  it("leaves non-camera spans alone", () => {
    const result = writeCameraDirection({
      prompt: PROMPT,
      direction: PAN_LEFT,
      spans: [{ start: 0, end: 12, category: "subject" }],
    });

    expect(result.outcome).toBe("written");
  });
});
