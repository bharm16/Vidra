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

describe("RealtimeSketch (floating-chrome design)", () => {
  beforeEach(stubCanvas);

  it("renders the stage: sketchpad, tool bar, composer — and no HUD or header", () => {
    render(<RealtimeSketch sendFrameFn={fakeSendFrame} />);

    expect(screen.getByLabelText("Sketchpad")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Brush" })).toBeInTheDocument();
    expect(screen.getByLabelText("Prompt")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Seed" })).toBeInTheDocument();

    // Deleted per the handoff: header badge, live pill, stats readout.
    expect(screen.queryByText("spike")).not.toBeInTheDocument();
    expect(screen.queryByText(/round-trip/)).not.toBeInTheDocument();
    expect(screen.queryByText(/frames/)).not.toBeInTheDocument();
  });
});
