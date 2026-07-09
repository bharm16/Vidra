import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ToolBar } from "../ToolBar";

function renderBar(
  overrides: Partial<Parameters<typeof ToolBar>[0]> = {},
): Parameters<typeof ToolBar>[0] {
  const props: Parameters<typeof ToolBar>[0] = {
    tool: "select",
    onToolChange: vi.fn(),
    ink: "#1e2c47",
    onInkChange: vi.fn(),
    brushSize: 18,
    onBrushSizeChange: vi.fn(),
    brushPopoverOpen: false,
    onToggleBrushPopover: vi.fn(),
    onUndo: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };
  render(<ToolBar {...props} />);
  return props;
}

describe("ToolBar", () => {
  it("marks the active tool with the raised state (select active by default)", () => {
    renderBar();

    expect(screen.getByRole("button", { name: "Select" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Eraser" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("choosing the brush selects the tool and toggles its popover", () => {
    const props = renderBar();

    fireEvent.click(screen.getByRole("button", { name: "Brush" }));

    expect(props.onToolChange).toHaveBeenCalledWith("brush");
    expect(props.onToggleBrushPopover).toHaveBeenCalled();
  });

  it("picking an ink and a size keeps the popover open (both callbacks fire, no close)", () => {
    const props = renderBar({ brushPopoverOpen: true });

    fireEvent.click(screen.getByRole("button", { name: "Ink #e8862e" }));
    fireEvent.click(screen.getByRole("button", { name: "Brush size 34" }));

    expect(props.onInkChange).toHaveBeenCalledWith("#e8862e");
    expect(props.onBrushSizeChange).toHaveBeenCalledWith(34);
    expect(props.onToggleBrushPopover).not.toHaveBeenCalled();
  });

  it("undo and clear fire their handlers", () => {
    const props = renderBar();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(props.onUndo).toHaveBeenCalled();
    expect(props.onClear).toHaveBeenCalled();
  });
});
