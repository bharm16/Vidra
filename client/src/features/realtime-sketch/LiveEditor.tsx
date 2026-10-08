import React, { useEffect, useRef, useState } from "react";

import {
  CANVAS_FOCUS_ATTR,
  CanvasViewport,
} from "@/components/canvas/CanvasViewport";
import { cn } from "@/utils/cn";
import { useCompactViewport } from "@/hooks/useCompactViewport";
import { NavRail } from "@components/navigation/NavRail";

import { Composer } from "./components/Composer";
import { Sketchpad, type SketchpadHandle } from "./components/Sketchpad";
import { ToolBar, type SketchTool } from "./components/ToolBar";
import {
  DEFAULT_BRUSH_SIZE,
  DEFAULT_INK,
  SNAPSHOT_SIZE,
} from "./config/constants";
import { useAcceptLiveOutput } from "./hooks/useAcceptLiveOutput";
import { useRealtimeSketch } from "./hooks/useRealtimeSketch";
import type { SendSketchFrame } from "./api/falI2i";
import "./live-editor.css";

/**
 * The Live editor (CONTEXT.md / ADR-0017): the realtime sketch's own page —
 * a rail destination whose editor pair rides the shared infinite-canvas
 * viewport. Page 21 embeds the tools in the sketch panel and keeps the
 * composer outside the camera. Select pans; brush and eraser strokes never do.
 * The generation loop underneath is untouched.
 */

/**
 * The live editor holds exactly one editor object (ADR-0017), so its camera
 * focus key is a constant rather than a take's id. Declared once and used on
 * both sides of the focus contract, so the two cannot drift apart.
 */
const EDITOR_PAIR_ID = "editor-pair";

type OpenPopover = "brush" | "strength" | null;

interface LiveEditorProps {
  sendFrameFn?: SendSketchFrame;
}

export function LiveEditor({
  sendFrameFn,
}: LiveEditorProps): React.ReactElement {
  const sketch = useRealtimeSketch(sendFrameFn ? { sendFrameFn } : undefined);
  const compact = useCompactViewport();
  // The one door out of this plane (ADR-0022 decision 5). It exports; it
  // never makes this editor remember anything — ADR-0017 stands.
  const acceptance = useAcceptLiveOutput();
  const [tool, setTool] = useState<SketchTool>("select");
  const [ink, setInk] = useState<string>(DEFAULT_INK);
  const [brushSize, setBrushSize] = useState<number>(DEFAULT_BRUSH_SIZE);
  const [openPopover, setOpenPopover] = useState<OpenPopover>(null);
  const sketchpadRef = useRef<SketchpadHandle>(null);

  // The HUD left the product surface (per the handoff); the spike's
  // diagnostics live in the console instead. The one exception is the last
  // error — a creator whose frames are failing is told in the editor.
  const stats = sketch.state.stats;
  const lastError = stats.lastError;
  const halted = sketch.state.halted;
  useEffect(() => {
    if (stats.sent === 0 && stats.lastError === null) {
      return;
    }
    console.debug("[realtime-sketch]", {
      sent: stats.sent,
      skipped: stats.skipped,
      lastError: stats.lastError,
    });
  }, [stats]);

  return (
    <div className="flex h-screen min-h-0 overflow-hidden">
      <NavRail active="live-editor" />
      <div className="le-stage min-w-0 flex-1">
        <h1 className="le-title">Live editor</h1>
        <CanvasViewport
          liveNodeId={EDITOR_PAIR_ID}
          focusTop={compact ? 68 : 92}
        >
          <div
            className="le-editor-pair"
            data-live="true"
            data-testid="live-editor-pair"
            {...{ [CANVAS_FOCUS_ATTR]: EDITOR_PAIR_ID }}
            // The page is sized BY the generation frame — one source of
            // truth, so the canvas is never stretched away from its bitmap.
            style={
              { "--le-frame": `${SNAPSHOT_SIZE}px` } as React.CSSProperties
            }
          >
            <div className="le-panel">
              <div className="le-panel-header le-sketch-header">
                <span>Sketch</span>
                <ToolBar
                  tool={tool}
                  onToolChange={setTool}
                  ink={ink}
                  onInkChange={setInk}
                  brushSize={brushSize}
                  onBrushSizeChange={setBrushSize}
                  brushPopoverOpen={openPopover === "brush"}
                  onToggleBrushPopover={() =>
                    setOpenPopover((open) =>
                      open === "brush" ? null : "brush",
                    )
                  }
                  onUndo={() => sketchpadRef.current?.undo()}
                  onClear={() => sketchpadRef.current?.clear()}
                />
              </div>
              <div className="le-panel-sketch">
                <Sketchpad
                  ref={sketchpadRef}
                  tool={tool}
                  ink={ink}
                  brushSize={brushSize}
                  onSnapshot={sketch.captureSnapshot}
                />
              </div>
            </div>
            <div className="le-panel">
              <div className="le-panel-header le-render-header">
                Live render
              </div>
              <div className="le-panel-output">
                {sketch.state.liveOutput === null ? null : (
                  <img
                    className="le-output-img"
                    src={sketch.state.liveOutput.imageUrl}
                    alt="Generated frame"
                  />
                )}
                {/* A failing relay must never look like an untouched sketchpad:
                  the idle invitation yields to the reason frames are dying.
                  (The handoff dropped the STATS readout — not error state.) */}
                {lastError !== null ? (
                  <div
                    className={cn(
                      "le-error",
                      sketch.state.liveOutput === null && "le-error-centered",
                    )}
                    data-testid="live-editor-error"
                  >
                    <span className="le-error-title">
                      {halted !== null
                        ? "Daily sketch allowance reached"
                        : "Frames aren’t rendering"}
                    </span>
                    <span className="le-error-detail">{lastError.message}</span>
                  </div>
                ) : sketch.state.liveOutput === null ? (
                  <div
                    className="le-output-empty"
                    aria-label="No live render yet"
                  />
                ) : null}
              </div>
            </div>
          </div>
        </CanvasViewport>

        <div className="le-float">
          <Composer
            settings={sketch.settings}
            updateSettings={sketch.updateSettings}
            rerollSeed={sketch.rerollSeed}
            liveOutput={sketch.state.liveOutput}
            onUseThis={acceptance.accept}
            acceptance={acceptance.status}
            onRetryAttachment={acceptance.retryAttachment}
            onRetryArming={acceptance.retryArming}
            strengthPopoverOpen={openPopover === "strength"}
            onToggleStrengthPopover={() =>
              setOpenPopover((open) =>
                open === "strength" ? null : "strength",
              )
            }
          />
        </div>
      </div>
    </div>
  );
}

export default LiveEditor;
