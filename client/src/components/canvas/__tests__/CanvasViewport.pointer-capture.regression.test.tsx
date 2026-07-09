import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CanvasViewport } from "../CanvasViewport";

/**
 * Regression: capturing the pointer on pointerdown made the browser retarget
 * the trailing click to the canvas, so real mouse clicks on nodes (the
 * demoted Prompt chip, takes) never reached them — selection was dead for
 * real users while JS `element.click()` (which skips the pointer pipeline)
 * kept working in tests and verification.
 *
 * Invariant: for any pointer gesture with travel at or under the click
 * threshold, the viewport must NOT capture the pointer. Capture may engage
 * only once the gesture is genuinely a drag (travel beyond the threshold).
 */
describe("regression: clean clicks are never pointer-captured by the canvas", () => {
  it("does not capture for a click's worth of travel; captures once dragging", () => {
    render(
      <CanvasViewport>
        <button type="button">node</button>
      </CanvasViewport>,
    );
    const canvas = screen.getByTestId("space-canvas") as HTMLElement & {
      setPointerCapture: (pointerId: number) => void;
    };
    const capture = vi.fn();
    canvas.setPointerCapture = capture;

    // A real click: down, jitter under the threshold, up. Never captured —
    // the click event must stay targeted at whatever sits under the cursor.
    fireEvent.pointerDown(canvas, {
      clientX: 100,
      clientY: 100,
      button: 0,
      pointerId: 1,
    });
    fireEvent.pointerMove(canvas, { clientX: 102, clientY: 101, pointerId: 1 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    expect(capture).not.toHaveBeenCalled();

    // A genuine drag: capture engages once travel crosses the threshold so
    // the pan can follow the pointer beyond the canvas bounds.
    fireEvent.pointerDown(canvas, {
      clientX: 100,
      clientY: 100,
      button: 0,
      pointerId: 2,
    });
    fireEvent.pointerMove(canvas, { clientX: 130, clientY: 100, pointerId: 2 });
    expect(capture).toHaveBeenCalledWith(2);
  });
});
