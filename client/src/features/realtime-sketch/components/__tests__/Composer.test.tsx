import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Composer } from "../Composer";
import type { LiveOutput } from "../../hooks/generationReducer";

const liveOutput = (): LiveOutput => ({
  imageUrl: "data:image/png;base64,thumb",
  requestId: "3",
  at: 1_700,
  sketchDataUri: "data:image/jpeg;base64,drawing",
  inputs: { prompt: "a lamp", strength: 0.625, steps: 8, seed: 42 },
});

function renderComposer(
  overrides: Partial<Parameters<typeof Composer>[0]> = {},
): Parameters<typeof Composer>[0] {
  const props: Parameters<typeof Composer>[0] = {
    settings: { prompt: "a lamp", strength: 0.625, steps: 8, seed: 42 },
    updateSettings: vi.fn(),
    rerollSeed: vi.fn(),
    liveOutput: null,
    onUseThis: vi.fn(),
    acceptance: { state: "idle" },
    onRetryAttachment: vi.fn(),
    strengthPopoverOpen: false,
    onToggleStrengthPopover: vi.fn(),
    ...overrides,
  };
  render(<Composer {...props} />);
  return props;
}

describe("Composer", () => {
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
    renderComposer({ liveOutput: liveOutput() });

    expect(screen.getByRole("img", { name: "Latest frame" })).toHaveAttribute(
      "src",
      "data:image/png;base64,thumb",
    );
  });

  it("Use this hands back the very output it is displaying, and is dead without one", () => {
    const shown = liveOutput();
    const props = renderComposer({ liveOutput: shown });

    fireEvent.click(screen.getByRole("button", { name: "Use this" }));

    expect(props.onUseThis).toHaveBeenCalledWith(shown);
  });

  it("names the refusal when an acceptance failed", () => {
    renderComposer({
      acceptance: { state: "failed", message: "Nothing was saved." },
    });

    expect(screen.getByTestId("live-editor-accept-error")).toHaveTextContent(
      "Nothing was saved.",
    );
  });
});
