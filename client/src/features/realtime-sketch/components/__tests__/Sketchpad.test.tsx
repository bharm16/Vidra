import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Sketchpad } from "../Sketchpad";

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

describe("Sketchpad", () => {
  beforeEach(() => {
    stubCanvas();
  });

  it("emits a snapshot when a stroke ends", () => {
    const onSnapshot = vi.fn();
    render(<Sketchpad onSnapshot={onSnapshot} />);
    const surface = screen.getByLabelText("Sketchpad");

    fireEvent.pointerDown(surface, { clientX: 40, clientY: 40, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 80, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 80, clientY: 90, pointerId: 1 });

    expect(onSnapshot).toHaveBeenCalled();
    const [dataUri, encodeMs] = onSnapshot.mock.calls.at(-1) as [
      string,
      number,
    ];
    expect(dataUri).toBe("data:image/jpeg;base64,sketchpad-mock");
    expect(typeof encodeMs).toBe("number");
  });

  it("clear and undo re-render the drawing and emit fresh snapshots", () => {
    const onSnapshot = vi.fn();
    render(<Sketchpad onSnapshot={onSnapshot} />);
    const surface = screen.getByLabelText("Sketchpad");

    fireEvent.pointerDown(surface, { clientX: 40, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 42, clientY: 42, pointerId: 1 });
    const callsAfterStroke = onSnapshot.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));

    expect(onSnapshot.mock.calls.length).toBe(callsAfterStroke + 2);
  });
});
