import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LiveEditor from "../LiveEditor";
import { SketchFrameRefused, type SendSketchFrame } from "../api/falI2i";

vi.mock("@hooks/useAuthUser", () => ({
  useAuthUser: () => null,
}));

/**
 * Regression: with the fal account's balance exhausted, every relayed frame
 * came back 403 — and the live editor kept showing the idle invitation
 * ("Draw on the sketchpad…") while 17 frames failed in a row. The failure was
 * captured in state and logged to the console, but never rendered, so the
 * surface was indistinguishable from "nothing drawn yet".
 *
 * The handoff deliberately removed the STATS readout (rate / round-trip /
 * frames) from the product surface — an error is not a stat. A creator whose
 * frames are failing must be told, in the editor, without opening devtools.
 */
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

/** Draw one stroke, which snapshots and hands a frame to the relay. */
function drawStroke(): void {
  const canvas = screen.getByLabelText("Sketchpad");
  fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 40, clientY: 40 });
  fireEvent.pointerUp(canvas, { pointerId: 1 });
}

/** Select the brush — the default select tool never draws (ADR-0017). */
function selectBrush(): void {
  fireEvent.click(screen.getByRole("button", { name: /brush/i }));
}

describe("regression: the live editor surfaces relay failures", () => {
  beforeEach(stubCanvas);

  it("tells the creator when frames are failing instead of showing the idle prompt", async () => {
    const rejectingRelay: SendSketchFrame = () =>
      Promise.reject(
        new Error(
          'frame failed (403): {"detail": "User is locked. Reason: Exhausted balance."}',
        ),
      );

    render(
      <MemoryRouter>
        <LiveEditor sendFrameFn={rejectingRelay} />
      </MemoryRouter>,
    );

    selectBrush();
    drawStroke();

    await waitFor(() => {
      expect(screen.getByTestId("live-editor-error")).toBeInTheDocument();
    });
    // The failure text itself reaches the surface — a creator must be able to
    // read WHY without the console.
    expect(screen.getByTestId("live-editor-error")).toHaveTextContent(
      /Exhausted balance/,
    );
    // …and the idle invitation is gone: it would read as "nothing sent yet".
    expect(screen.queryByText(/Draw on the sketchpad/)).not.toBeInTheDocument();
    // The styling hooks must be real, separate class tokens — a concatenated
    // `le-errorle-error-centered` renders as unstyled text on the panel,
    // which is how this first shipped.
    const surface = screen.getByTestId("live-editor-error");
    expect(surface).toHaveClass("le-error");
    expect(surface).toHaveClass("le-error-centered");
  });

  it("keeps the idle invitation when nothing has failed yet", () => {
    const pendingRelay: SendSketchFrame = () => new Promise(() => {});

    render(
      <MemoryRouter>
        <LiveEditor sendFrameFn={pendingRelay} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Draw on the sketchpad/)).toBeInTheDocument();
    expect(screen.queryByTestId("live-editor-error")).not.toBeInTheDocument();
  });
});

/**
 * The relay caps each creator's daily sketch spend (issue #84). A refusal is
 * not the same product event as a failing relay: the editor must name the
 * allowance and stop sending, rather than reporting frames that "aren't
 * rendering" and retrying into a wall.
 */
describe("the live editor pauses on a spent daily allowance", () => {
  beforeEach(stubCanvas);

  it("names the allowance and stops sending frames", async () => {
    const calls: number[] = [];
    const refusingRelay: SendSketchFrame = () => {
      calls.push(Date.now());
      return Promise.reject(
        new SketchFrameRefused({
          reason: "daily-allowance-reached",
          detail:
            "Daily sketch allowance reached. Sketching resumes at the next UTC midnight.",
          resetAtMs: Date.now() + 60 * 60 * 1000,
        }),
      );
    };

    render(
      <MemoryRouter>
        <LiveEditor sendFrameFn={refusingRelay} />
      </MemoryRouter>,
    );

    selectBrush();
    drawStroke();

    await waitFor(() => {
      expect(screen.getByTestId("live-editor-error")).toHaveTextContent(
        "Daily sketch allowance reached",
      );
    });
    expect(screen.getByTestId("live-editor-error")).toHaveTextContent(
      "next UTC midnight",
    );
    expect(calls).toHaveLength(1);

    // More drawing produces no more frames — the pause is real, not cosmetic.
    drawStroke();
    drawStroke();
    expect(calls).toHaveLength(1);
  });
});
