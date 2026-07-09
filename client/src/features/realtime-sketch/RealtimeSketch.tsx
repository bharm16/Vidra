import React, { useEffect, useRef, useState } from "react";

import { Composer } from "./components/Composer";
import { Sketchpad, type SketchpadHandle } from "./components/Sketchpad";
import { ToolBar, type SketchTool } from "./components/ToolBar";
import { DEFAULT_BRUSH_SIZE, DEFAULT_INK } from "./config/constants";
import { median, updatesPerSecond } from "./hooks/hudMath";
import { useRealtimeSketch } from "./hooks/useRealtimeSketch";
import type { SendSketchFrame } from "./api/falI2i";
import "./live-editor.css";

/**
 * The realtime sketch surface (/sketch — outside the page's anatomy).
 * Visual spec: design_handoff_live_editor — a dark canvas-first stage with
 * all controls in a floating icon bar + composer; no header, no on-screen
 * stats (diagnostics go to the console). The generation loop underneath is
 * untouched.
 */

type OpenPopover = "brush" | "strength" | null;

interface RealtimeSketchProps {
  sendFrameFn?: SendSketchFrame;
}

export function RealtimeSketch({
  sendFrameFn,
}: RealtimeSketchProps): React.ReactElement {
  const sketch = useRealtimeSketch(sendFrameFn ? { sendFrameFn } : undefined);
  const [tool, setTool] = useState<SketchTool>("select");
  const [ink, setInk] = useState<string>(DEFAULT_INK);
  const [brushSize, setBrushSize] = useState<number>(DEFAULT_BRUSH_SIZE);
  const [openPopover, setOpenPopover] = useState<OpenPopover>(null);
  const sketchpadRef = useRef<SketchpadHandle>(null);
  const floatRef = useRef<HTMLDivElement | null>(null);

  // Popovers close on outside click or Esc (picking inside stays open).
  useEffect(() => {
    if (openPopover === null) {
      return;
    }
    const onPointerDown = (event: PointerEvent): void => {
      const float = floatRef.current;
      if (
        float &&
        event.target instanceof Node &&
        !float.contains(event.target)
      ) {
        setOpenPopover(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpenPopover(null);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openPopover]);

  // The HUD left the product surface (per the handoff); the spike's
  // diagnostics live in the console instead.
  const stats = sketch.state.stats;
  useEffect(() => {
    if (stats.sent === 0 && stats.lastError === null) {
      return;
    }
    console.debug("[realtime-sketch]", {
      sent: stats.sent,
      skipped: stats.skipped,
      lastRttMs: stats.rttMs.at(-1) ?? null,
      medianRttMs: median(stats.rttMs),
      medianModelMs: median(stats.modelMs),
      updatesPerSecond: updatesPerSecond(stats.resultTimes),
      lastError: stats.lastError,
    });
  }, [stats]);

  return (
    <div className="le-stage">
      <div className="le-panels">
        <div className="le-panel-sketch">
          <Sketchpad
            ref={sketchpadRef}
            tool={tool}
            ink={ink}
            brushSize={brushSize}
            onSnapshot={sketch.captureSnapshot}
          />
        </div>
        <div className="le-panel-output">
          {sketch.state.liveOutput === null ? (
            <div className="le-output-empty">
              Draw on the sketchpad — the render tracks your strokes.
            </div>
          ) : (
            <img
              className="le-output-img"
              src={sketch.state.liveOutput.imageUrl}
              alt="Generated frame"
            />
          )}
        </div>
      </div>

      <div ref={floatRef} className="le-float">
        <ToolBar
          tool={tool}
          onToolChange={setTool}
          ink={ink}
          onInkChange={setInk}
          brushSize={brushSize}
          onBrushSizeChange={setBrushSize}
          brushPopoverOpen={openPopover === "brush"}
          onToggleBrushPopover={() =>
            setOpenPopover((open) => (open === "brush" ? null : "brush"))
          }
          onUndo={() => sketchpadRef.current?.undo()}
          onClear={() => sketchpadRef.current?.clear()}
        />
        <Composer
          settings={sketch.settings}
          updateSettings={sketch.updateSettings}
          rerollSeed={sketch.rerollSeed}
          modeThumbUrl={sketch.state.liveOutput?.imageUrl ?? null}
          strengthPopoverOpen={openPopover === "strength"}
          onToggleStrengthPopover={() =>
            setOpenPopover((open) => (open === "strength" ? null : "strength"))
          }
        />
      </div>
    </div>
  );
}

export default RealtimeSketch;
