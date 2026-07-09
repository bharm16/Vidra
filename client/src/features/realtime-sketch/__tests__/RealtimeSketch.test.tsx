import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RealtimeSketch from "../RealtimeSketch";
import type { SendSketchFrame } from "../api/falI2i";

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

const fakeSendFrame: SendSketchFrame = () => new Promise(() => {});

describe("RealtimeSketch", () => {
  beforeEach(stubCanvas);

  it("renders the sketchpad, controls, and live output with HUD placeholders", () => {
    render(<RealtimeSketch sendFrameFn={fakeSendFrame} />);

    expect(screen.getByLabelText("Sketchpad")).toBeInTheDocument();
    expect(screen.getByLabelText("Prompt")).toBeInTheDocument();
    expect(
      screen.getByText(/Draw on the sketchpad — the render tracks/),
    ).toBeInTheDocument();
    expect(screen.getByText(/frames/)).toBeInTheDocument();
  });
});
