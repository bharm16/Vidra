import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Sketchpad, type SketchpadHandle } from "../Sketchpad";

function stubCanvas(): void {
  const context = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    lineCap: "round",
    lineJoin: "round",
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  };
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => context,
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(
    () => "data:image/jpeg;base64,sketchpad-mock",
  );
}

function drawStroke(surface: HTMLElement): void {
  fireEvent.pointerDown(surface, { clientX: 40, clientY: 40, pointerId: 1 });
  fireEvent.pointerMove(surface, { clientX: 80, clientY: 90, pointerId: 1 });
  fireEvent.pointerUp(surface, { clientX: 80, clientY: 90, pointerId: 1 });
}

describe("Sketchpad", () => {
  beforeEach(() => {
    stubCanvas();
  });

  it("does not draw or snapshot while the select tool is active", () => {
    const onSnapshot = vi.fn();
    render(
      <Sketchpad
        tool="select"
        ink="#1e2c47"
        brushSize={18}
        onSnapshot={onSnapshot}
      />,
    );

    drawStroke(screen.getByLabelText("Sketchpad"));

    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it("draws and emits a snapshot when a brush stroke ends", () => {
    const onSnapshot = vi.fn();
    render(
      <Sketchpad
        tool="brush"
        ink="#1e2c47"
        brushSize={18}
        onSnapshot={onSnapshot}
      />,
    );

    drawStroke(screen.getByLabelText("Sketchpad"));

    expect(onSnapshot).toHaveBeenCalled();
    const [dataUri, encodeMs] = onSnapshot.mock.calls.at(-1) as [
      string,
      number,
    ];
    expect(dataUri).toBe("data:image/jpeg;base64,sketchpad-mock");
    expect(typeof encodeMs).toBe("number");
  });

  it("undo and clear via the handle re-render and emit fresh snapshots", () => {
    const onSnapshot = vi.fn();
    const handle = createRef<SketchpadHandle>();
    render(
      <Sketchpad
        ref={handle}
        tool="brush"
        ink="#1e2c47"
        brushSize={18}
        onSnapshot={onSnapshot}
      />,
    );

    drawStroke(screen.getByLabelText("Sketchpad"));
    const callsAfterStroke = onSnapshot.mock.calls.length;

    handle.current?.undo();
    handle.current?.clear();

    expect(onSnapshot.mock.calls.length).toBe(callsAfterStroke + 2);
  });
});
