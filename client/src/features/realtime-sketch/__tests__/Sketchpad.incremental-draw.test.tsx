import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Sketchpad, type SketchpadHandle } from "../components/Sketchpad";

/**
 * Drawing must stay cheap as the sketch grows: a pointermove strokes only
 * the new segment of the active stroke. Replaying every prior stroke on
 * every move made input latency scale with total sketch complexity —
 * found during the 2026-07-27 live-editor performance diagnosis.
 * Full replay remains the contract for undo/clear (they must repaint).
 */

interface ContextOp {
  op: string;
}

function recordingContext(): { ops: ContextOp[]; context: object } {
  const ops: ContextOp[] = [];
  const record =
    (op: string) =>
    (..._args: unknown[]): void => {
      ops.push({ op });
    };
  const context = {
    fillRect: record("fillRect"),
    beginPath: record("beginPath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    stroke: record("stroke"),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    lineCap: "",
    lineJoin: "",
  };
  return { ops, context };
}

describe("Sketchpad incremental drawing", () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  let recorded: { ops: ContextOp[]; context: object };

  beforeEach(() => {
    recorded = recordingContext();
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => recorded.context,
    ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toDataURL = vi.fn(
      () => "data:image/jpeg;base64,stub",
    ) as unknown as typeof HTMLCanvasElement.prototype.toDataURL;
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
  });

  function drawStroke(canvas: HTMLElement, points: number): void {
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
    for (let i = 1; i <= points; i += 1) {
      fireEvent.pointerMove(canvas, {
        clientX: 10 + i,
        clientY: 10 + i,
        pointerId: 1,
      });
    }
    fireEvent.pointerUp(canvas, { pointerId: 1 });
  }

  it("a pointermove strokes only the new segment, not every prior stroke", () => {
    render(
      <Sketchpad
        tool="brush"
        ink="#1e2c47"
        brushSize={18}
        onSnapshot={() => undefined}
      />,
    );
    const canvas = screen.getByLabelText("Sketchpad");

    drawStroke(canvas, 30);
    recorded.ops.length = 0;

    fireEvent.pointerDown(canvas, { clientX: 200, clientY: 200, pointerId: 1 });
    const opsAfterDown = recorded.ops.length;
    fireEvent.pointerMove(canvas, { clientX: 201, clientY: 201, pointerId: 1 });

    const moveOps = recorded.ops.slice(opsAfterDown);
    const lineToCount = moveOps.filter((entry) => entry.op === "lineTo").length;
    // Full replay would re-issue the first stroke's ~30 lineTo calls here.
    expect(lineToCount).toBeLessThanOrEqual(1);
    expect(moveOps.filter((entry) => entry.op === "fillRect")).toHaveLength(0);
  });

  it("undo still repaints the whole sketch from scratch", () => {
    const handle = React.createRef<SketchpadHandle>();
    render(
      <Sketchpad
        ref={handle}
        tool="brush"
        ink="#1e2c47"
        brushSize={18}
        onSnapshot={() => undefined}
      />,
    );
    const canvas = screen.getByLabelText("Sketchpad");

    drawStroke(canvas, 5);
    drawStroke(canvas, 5);
    recorded.ops.length = 0;

    handle.current?.undo();

    // The background repaint is the signature of a full replay.
    expect(
      recorded.ops.filter((entry) => entry.op === "fillRect").length,
    ).toBeGreaterThan(0);
    expect(
      recorded.ops.filter((entry) => entry.op === "lineTo").length,
    ).toBeGreaterThan(0);
  });
});
