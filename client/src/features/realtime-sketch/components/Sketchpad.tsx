import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

import {
  SKETCHPAD_BACKGROUND,
  SNAPSHOT_INTERVAL_MS,
  SNAPSHOT_JPEG_QUALITY,
  SNAPSHOT_SIZE,
} from "../config/constants";
import type { SketchTool } from "./ToolBar";

/**
 * The sketchpad (CONTEXT.md): the drawing surface whose state conditions
 * generation. Owns stroke state; tools/ink/size arrive from the floating
 * bar (design_handoff_live_editor), and undo/clear are driven through the
 * imperative handle. The select tool never draws.
 */

interface SketchpadProps {
  tool: SketchTool;
  ink: string;
  brushSize: number;
  onSnapshot: (dataUri: string, encodeMs: number) => void;
}

export interface SketchpadHandle {
  undo: () => void;
  clear: () => void;
}

interface Stroke {
  color: string;
  size: number;
  points: Array<{ x: number; y: number }>;
}

export const Sketchpad = forwardRef<SketchpadHandle, SketchpadProps>(
  function Sketchpad(
    { tool, ink, brushSize, onSnapshot },
    handleRef,
  ): React.ReactElement {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const strokesRef = useRef<Stroke[]>([]);
    const activeStrokeRef = useRef<Stroke | null>(null);
    const lastSnapshotAtRef = useRef(0);

    const redraw = useCallback((): void => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) {
        return;
      }
      context.fillStyle = SKETCHPAD_BACKGROUND;
      context.fillRect(0, 0, canvas.width, canvas.height);
      for (const stroke of strokesRef.current) {
        context.strokeStyle = stroke.color;
        context.lineWidth = stroke.size;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.beginPath();
        stroke.points.forEach((point, index) => {
          if (index === 0) {
            context.moveTo(point.x, point.y);
          } else {
            context.lineTo(point.x, point.y);
          }
        });
        context.stroke();
      }
    }, []);

    const snapshot = useCallback((): void => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const startedAt = performance.now();
      const dataUri = canvas.toDataURL("image/jpeg", SNAPSHOT_JPEG_QUALITY);
      onSnapshot(dataUri, Math.round(performance.now() - startedAt));
    }, [onSnapshot]);

    useEffect(() => {
      redraw();
    }, [redraw]);

    useImperativeHandle(
      handleRef,
      () => ({
        undo: (): void => {
          strokesRef.current = strokesRef.current.slice(0, -1);
          redraw();
          snapshot();
        },
        clear: (): void => {
          strokesRef.current = [];
          redraw();
          snapshot();
        },
      }),
      [redraw, snapshot],
    );

    const toCanvasPoint = (
      event: React.PointerEvent<HTMLCanvasElement>,
    ): { x: number; y: number } => {
      const canvas = event.currentTarget;
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
      const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
      return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY,
      };
    };

    const handlePointerDown = (
      event: React.PointerEvent<HTMLCanvasElement>,
    ): void => {
      if (tool === "select") {
        return;
      }
      // jsdom lacks pointer capture; real browsers keep the stroke while the
      // pointer wanders off the element.
      if (typeof event.currentTarget.setPointerCapture === "function") {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      activeStrokeRef.current = {
        color: tool === "eraser" ? SKETCHPAD_BACKGROUND : ink,
        size: tool === "eraser" ? brushSize * 2 : brushSize,
        points: [toCanvasPoint(event)],
      };
      strokesRef.current = [...strokesRef.current, activeStrokeRef.current];
      redraw();
    };

    const handlePointerMove = (
      event: React.PointerEvent<HTMLCanvasElement>,
    ): void => {
      const active = activeStrokeRef.current;
      if (!active) {
        return;
      }
      active.points.push(toCanvasPoint(event));
      redraw();
      const now = Date.now();
      if (now - lastSnapshotAtRef.current >= SNAPSHOT_INTERVAL_MS) {
        lastSnapshotAtRef.current = now;
        snapshot();
      }
    };

    const endStroke = (): void => {
      if (!activeStrokeRef.current) {
        return;
      }
      activeStrokeRef.current = null;
      lastSnapshotAtRef.current = Date.now();
      snapshot();
    };

    return (
      <canvas
        ref={canvasRef}
        aria-label="Sketchpad"
        width={SNAPSHOT_SIZE}
        height={SNAPSHOT_SIZE}
        className={`le-canvas ${tool === "select" ? "" : "le-canvas-drawable"}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
      />
    );
  },
);
