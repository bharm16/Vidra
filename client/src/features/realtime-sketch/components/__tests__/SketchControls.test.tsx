import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SketchControls } from "../SketchControls";

const settings = { prompt: "a lamp", strength: 0.75, steps: 4, seed: 42 };

describe("SketchControls", () => {
  it("labels strength with its effective denoise steps", () => {
    render(
      <SketchControls
        settings={settings}
        updateSettings={vi.fn()}
        rerollSeed={vi.fn()}
      />,
    );

    expect(screen.getByText(/3\/4 steps/)).toBeInTheDocument();
  });

  it("snaps strength changes to the 1/steps grid", () => {
    const updateSettings = vi.fn();
    render(
      <SketchControls
        settings={settings}
        updateSettings={updateSettings}
        rerollSeed={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole("slider"), { target: { value: "0.6" } });

    expect(updateSettings).toHaveBeenCalledWith({ strength: 0.5 });
  });

  it("re-snaps strength when the step count changes so it stays on the grid", () => {
    const updateSettings = vi.fn();
    render(
      <SketchControls
        settings={{ ...settings, strength: 0.625, steps: 8 }}
        updateSettings={updateSettings}
        rerollSeed={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /4 steps/i }));

    expect(updateSettings).toHaveBeenCalledWith({ steps: 4, strength: 0.75 });
  });
});
