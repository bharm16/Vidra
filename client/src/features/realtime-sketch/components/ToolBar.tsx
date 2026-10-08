import React from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@promptstudio/system/components/ui/popover";
import { cn } from "@/utils/cn";
import selectIcon from "../assets/select.svg";
import brushIcon from "../assets/brush.svg";
import eraserIcon from "../assets/eraser.svg";
import undoIcon from "../assets/undo.svg";
import clearIcon from "../assets/clear.svg";
import { BRUSH_SIZES, SKETCH_INKS } from "../config/constants";

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

/** Page 21's embedded tool strip, with the existing ink and size controls. */
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
  return (
    <div className="le-bar" role="toolbar" aria-label="Sketch tools">
      <Button
        type="button"
        variant="ghost"
        aria-label="Select"
        aria-pressed={tool === "select"}
        className={cn("le-btn", tool === "select" && "le-btn-active")}
        onClick={() => onToolChange("select")}
      >
        <img src={selectIcon} alt="" />
      </Button>

      <Popover
        open={brushPopoverOpen}
        onOpenChange={(open) => {
          if (open !== brushPopoverOpen) onToggleBrushPopover();
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            aria-label="Brush"
            aria-pressed={tool === "brush"}
            className={cn("le-btn", tool === "brush" && "le-btn-active")}
            onClick={() => onToolChange("brush")}
          >
            <span className="le-ink-circle">
              <img src={brushIcon} alt="" />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="le-popover"
          side="top"
          sideOffset={8}
          aria-label="Brush options"
        >
          <div className="le-pop-row">
            {SKETCH_INKS.map((color) => (
              <Button
                key={color}
                type="button"
                variant="ghost"
                aria-label={"Ink " + color}
                aria-pressed={ink === color}
                className={cn(
                  "le-pop-item",
                  ink === color && "le-pop-item-selected",
                )}
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
                aria-label={"Brush size " + size}
                aria-pressed={brushSize === size}
                className={cn(
                  "le-pop-item",
                  brushSize === size && "le-pop-item-selected",
                )}
                onClick={() => onBrushSizeChange(size)}
              >
                <span
                  className="le-size-dot"
                  style={{ width: dot, height: dot }}
                />
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Button
        type="button"
        variant="ghost"
        aria-label="Eraser"
        aria-pressed={tool === "eraser"}
        className={cn("le-btn", tool === "eraser" && "le-btn-active")}
        onClick={() => onToolChange("eraser")}
      >
        <img src={eraserIcon} alt="" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        aria-label="Undo"
        className="le-btn"
        onClick={onUndo}
      >
        <img src={undoIcon} alt="" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        aria-label="Clear"
        className="le-btn"
        onClick={onClear}
      >
        <img src={clearIcon} alt="" />
      </Button>
    </div>
  );
}
