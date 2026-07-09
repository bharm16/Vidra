import React from "react";

import { Button } from "@promptstudio/system/components/ui/button";

import { BRUSH_SIZES, SKETCH_INKS } from "../config/constants";

/**
 * Floating tool pill (design_handoff_live_editor). The brush button is not
 * an icon: a filled circle in the current ink IS the color indicator. The
 * raised solid square is THE active-tool state. Picking inside the popover
 * deliberately keeps it open (adjust color + size in one visit).
 */

export type SketchTool = "select" | "brush" | "eraser";

interface ToolBarProps {
  tool: SketchTool;
  onToolChange: (tool: SketchTool) => void;
  ink: string;
  onInkChange: (ink: string) => void;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  brushPopoverOpen: boolean;
  onToggleBrushPopover: () => void;
  onUndo: () => void;
  onClear: () => void;
}

export function ToolBar({
  tool,
  onToolChange,
  ink,
  onInkChange,
  brushSize,
  onBrushSizeChange,
  brushPopoverOpen,
  onToggleBrushPopover,
  onUndo,
  onClear,
}: ToolBarProps): React.ReactElement {
  const barButtonClass = (active: boolean): string =>
    `le-btn ${active ? "le-btn-active" : ""}`;

  return (
    <div className="le-bar">
      <Button
        type="button"
        variant="ghost"
        aria-label="Select"
        aria-pressed={tool === "select"}
        className={barButtonClass(tool === "select")}
        onClick={() => onToolChange("select")}
      >
        <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor">
          <path d="M5 2.5 18.5 13l-6 .8L9 20z" />
        </svg>
      </Button>

      <div className="relative">
        {brushPopoverOpen ? (
          <div className="le-popover" role="dialog" aria-label="Brush options">
            <div className="le-pop-row">
              {SKETCH_INKS.map((color) => (
                <Button
                  key={color}
                  type="button"
                  variant="ghost"
                  aria-label={`Ink ${color}`}
                  className={`le-pop-item ${
                    ink === color ? "le-pop-item-selected" : ""
                  }`}
                  onClick={() => onInkChange(color)}
                >
                  <span
                    className="le-ink-dot"
                    style={{ backgroundColor: color }}
                  />
                </Button>
              ))}
            </div>
            <div className="le-pop-divider" />
            <div className="le-pop-row">
              {BRUSH_SIZES.map(({ size, dot }) => (
                <Button
                  key={size}
                  type="button"
                  variant="ghost"
                  aria-label={`Brush size ${size}`}
                  className={`le-pop-item ${
                    brushSize === size ? "le-pop-item-selected" : ""
                  }`}
                  onClick={() => onBrushSizeChange(size)}
                >
                  <span
                    className="le-size-dot"
                    style={{ width: dot, height: dot }}
                  />
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          aria-label="Brush"
          aria-pressed={tool === "brush"}
          className={barButtonClass(tool === "brush")}
          onClick={() => {
            onToolChange("brush");
            onToggleBrushPopover();
          }}
        >
          <span className="le-ink-circle" style={{ backgroundColor: ink }}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.2 12.2 18.8 3.6a2 2 0 0 1 2.8 2.8l-8.6 8.6" />
              <path d="M8.6 12.6c-2.1 0-3.9 1.7-3.9 3.8 0 1.3-.9 2.4-2.2 2.7 1.1 1.6 2.9 2.6 4.9 2.6a5.3 5.3 0 0 0 5.3-5.3c0-2.1-1.9-3.8-4.1-3.8z" />
            </svg>
          </span>
        </Button>
      </div>

      <Button
        type="button"
        variant="ghost"
        aria-label="Eraser"
        aria-pressed={tool === "eraser"}
        className={barButtonClass(tool === "eraser")}
        onClick={() => onToolChange("eraser")}
      >
        <svg
          width="21"
          height="21"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7 21h11" />
          <path d="M5.7 13.7 13.3 6a2 2 0 0 1 2.8 0l2.9 2.9a2 2 0 0 1 0 2.8l-7.7 7.7a2 2 0 0 1-2.8 0l-2.8-2.9a2 2 0 0 1 0-2.8z" />
        </svg>
      </Button>
      <Button
        type="button"
        variant="ghost"
        aria-label="Undo"
        className="le-btn"
        onClick={onUndo}
      >
        <svg
          width="21"
          height="21"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
        </svg>
      </Button>
      <Button
        type="button"
        variant="ghost"
        aria-label="Clear"
        className="le-btn"
        onClick={onClear}
      >
        <svg
          width="21"
          height="21"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 6h18" />
          <path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6" />
          <path d="M6 6l1 13.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 6" />
        </svg>
      </Button>
    </div>
  );
}
