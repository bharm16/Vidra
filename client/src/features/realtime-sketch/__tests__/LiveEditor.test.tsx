import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LiveEditor from "../LiveEditor";
import type { SendSketchFrame } from "../api/falI2i";

vi.mock("@hooks/useAuthUser", () => ({
  useAuthUser: () => null,
}));

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

describe("LiveEditor (its own plane under the rail — ADR-0017)", () => {
  beforeEach(stubCanvas);

  it("renders the rail, the infinite plane, and the editor pair with floating chrome", () => {
    render(
      <MemoryRouter>
        <LiveEditor sendFrameFn={fakeSendFrame} />
      </MemoryRouter>,
    );

    // Rail present with the live editor as the active destination.
    expect(
      screen.getByRole("link", { name: /Live editor/ }),
    ).toBeInTheDocument();

    // The editor pair rides the shared canvas viewport (the plane).
    expect(screen.getByTestId("space-canvas")).toBeInTheDocument();
    const pair = screen.getByTestId("live-editor-pair");
    expect(screen.getByTestId("space-viewport-content")).toContainElement(pair);

    // Floating chrome stays OUTSIDE the camera transform.
    const composerPrompt = screen.getByLabelText("Prompt");
    expect(screen.getByTestId("space-viewport-content")).not.toContainElement(
      composerPrompt,
    );
    expect(screen.getByLabelText("Sketchpad")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Brush" })).toBeInTheDocument();
  });
});
