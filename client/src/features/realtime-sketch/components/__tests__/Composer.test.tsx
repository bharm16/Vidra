import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Composer } from "../Composer";

function renderComposer(
  overrides: Partial<Parameters<typeof Composer>[0]> = {},
): Parameters<typeof Composer>[0] {
  const props: Parameters<typeof Composer>[0] = {
    settings: { prompt: "a lamp", strength: 0.625, steps: 8, seed: 42 },
    updateSettings: vi.fn(),
    rerollSeed: vi.fn(),
    modeThumbUrl: null,
    strengthPopoverOpen: false,
    onToggleStrengthPopover: vi.fn(),
    ...overrides,
  };
  render(<Composer {...props} />);
  return props;
}

describe("Composer", () => {
  it("the steps chip toggles 4 ⇄ 8 and re-snaps strength to the new grid", () => {
    const props = renderComposer({
      settings: { prompt: "a lamp", strength: 0.625, steps: 8, seed: 42 },
    });

    fireEvent.click(screen.getByRole("button", { name: /8 steps/i }));

    expect(props.updateSettings).toHaveBeenCalledWith({
      steps: 4,
      strength: 0.75,
    });
  });

  it("the seed chip re-rolls", () => {
    const props = renderComposer();

    fireEvent.click(screen.getByRole("button", { name: "Seed" }));

    expect(props.rerollSeed).toHaveBeenCalled();
  });

  it("the strength chip shows the value and opens its popover", () => {
    const props = renderComposer();

    fireEvent.click(screen.getByRole("button", { name: /0\.625/ }));

    expect(props.onToggleStrengthPopover).toHaveBeenCalled();
  });

  it("the strength popover slider snaps to the 1/steps grid", () => {
    const props = renderComposer({ strengthPopoverOpen: true });

    fireEvent.change(screen.getByRole("slider"), { target: { value: "0.6" } });

    expect(props.updateSettings).toHaveBeenCalledWith({ strength: 0.625 });
  });

  it("prompt edits propagate", () => {
    const props = renderComposer();

    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "a cottage" },
    });

    expect(props.updateSettings).toHaveBeenCalledWith({ prompt: "a cottage" });
  });

  it("the mode chip shows the live frame thumbnail when one exists", () => {
    renderComposer({ modeThumbUrl: "data:image/png;base64,thumb" });

    expect(screen.getByRole("img", { name: "Latest frame" })).toHaveAttribute(
      "src",
      "data:image/png;base64,thumb",
    );
  });
});
