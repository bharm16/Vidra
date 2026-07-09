import React, { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@promptstudio/system/components/ui/button";

import {
  SNAPSHOT_INTERVAL_MS,
  SNAPSHOT_JPEG_QUALITY,
  SNAPSHOT_SIZE,
} from "../config/constants";

/**
 * The sketchpad (CONTEXT.md): the drawing surface whose state conditions
 * generation. Owns stroke state entirely — it knows nothing about
 * generation; it only emits snapshots upward.
 */

interface SketchpadProps {
  onSnapshot: (dataUri: string, encodeMs: number) => void;
}

interface Stroke {
  color: string;
  size: number;
  points: Array<{ x: number; y: number }>;
}

const BACKGROUND = "#e2e2e2";
const COLORS = ["#1e2430", "#e07a1f", "#f4c542", "#3a6ea5", "#f5f2ec"];
const BRUSH_SIZES = [8, 18, 34];

export function Sketchpad({ onSnapshot }: SketchpadProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const lastSnapshotAtRef = useRef(0);
  const [color, setColor] = useState<string>(COLORS[0] ?? "#1e2430");
  const [size, setSize] = useState<number>(BRUSH_SIZES[1] ?? 18);
  const [erasing, setErasing] = useState(false);

  const redraw = useCallback((): void => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }
    context.fillStyle = BACKGROUND;
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
    // jsdom lacks pointer capture; real browsers keep the stroke while the
    // pointer wanders off the element.
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    activeStrokeRef.current = {
      color: erasing ? BACKGROUND : color,
      size: erasing ? size * 2 : size,
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

  const undo = (): void => {
    strokesRef.current = strokesRef.current.slice(0, -1);
    redraw();
    snapshot();
  };

  const clear = (): void => {
    strokesRef.current = [];
    redraw();
    snapshot();
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        {COLORS.map((swatch) => (
          <Button
            key={swatch}
            type="button"
            variant="ghost"
            aria-label={`Color ${swatch}`}
            className={`!h-6 !w-6 rounded-full border p-0 ${
              !erasing && color === swatch ? "border-white" : "border-white/20"
            }`}
            style={{ backgroundColor: swatch }}
            onClick={() => {
              setColor(swatch);
              setErasing(false);
            }}
          />
        ))}
        <span className="mx-1 h-5 w-px bg-white/10" />
        {BRUSH_SIZES.map((option) => (
          <Button
            key={option}
            type="button"
            variant="ghost"
            aria-label={`Brush ${option}`}
            className={`!h-auto rounded px-2 py-1 text-xs ${
              size === option
                ? "bg-white/20 text-white"
                : "bg-white/5 text-white/60 hover:bg-white/10"
            }`}
            onClick={() => setSize(option)}
          >
            {option}
          </Button>
        ))}
        <span className="mx-1 h-5 w-px bg-white/10" />
        <Button
          type="button"
          variant="ghost"
          className={`!h-auto rounded px-2 py-1 text-xs ${
            erasing
              ? "bg-white/20 text-white"
              : "bg-white/5 text-white/60 hover:bg-white/10"
          }`}
          onClick={() => setErasing((value) => !value)}
        >
          Eraser
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="!h-auto rounded bg-white/5 px-2 py-1 text-xs text-white/60 hover:bg-white/10"
          onClick={undo}
        >
          Undo
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="!h-auto rounded bg-white/5 px-2 py-1 text-xs text-white/60 hover:bg-white/10"
          onClick={clear}
        >
          Clear
        </Button>
      </div>
      <canvas
        ref={canvasRef}
        aria-label="Sketchpad"
        width={SNAPSHOT_SIZE}
        height={SNAPSHOT_SIZE}
        className="aspect-square w-full max-w-[640px] cursor-crosshair touch-none rounded-lg"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
      />
    </div>
  );
}
