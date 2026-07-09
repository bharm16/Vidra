import React, { useEffect, useRef, useState } from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import {
  cameraToCenter,
  clampScale,
  panBy,
  zoomAtPoint,
  type CanvasCamera,
} from "./canvasCamera";

const ZOOM_STEP = 0.1;

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * The shared infinite-canvas viewport (born as the space's, ADR-0012 / M5;
 * promoted for the live editor, ADR-0017). Content floats on an open plane
 * under a single camera — drag/wheel pans, pinch or the −/%/+ control zooms —
 * exactly like a design canvas. Both the camera and the zoom are ephemeral:
 * nothing spatial is stored, so they reset on reload.
 */
export function CanvasViewport({
  children,
  liveNodeId,
  onBackgroundClick,
}: {
  children: React.ReactNode;
  /** The current take; when it changes the camera recenters on it. */
  liveNodeId?: string | null;
  /**
   * A clean click on empty canvas (not a node, not a pan-drag's trailing
   * click). ADR-0015 uses this to return focus to the media — collapsing
   * the composer.
   */
  onBackgroundClick?: () => void;
}): React.ReactElement {
  const [camera, setCamera] = useState<CanvasCamera>({ x: 0, y: 0, scale: 1 });
  const canvasRef = useRef<HTMLDivElement>(null);

  // Drag-to-pan bookkeeping. `travelled` outlives the gesture so the click
  // browsers fire on release can be told apart from a deliberate selection.
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    captured: boolean;
  } | null>(null);
  const travelledRef = useRef(0);

  /** Past this many pixels of pointer travel, the gesture is a pan — the
   *  trailing click must not select a node (browsing is read-only). */
  const CLICK_DRAG_THRESHOLD = 4;

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 && event.button !== 1) return;
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      captured: false,
    };
    travelledRef.current = 0;
    // Deliberately NO pointer capture here: capturing on pointerdown makes
    // the browser retarget the trailing click to the canvas, killing real
    // mouse clicks on nodes. Capture engages in onPointerMove only once the
    // gesture is genuinely a drag.
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    travelledRef.current += Math.abs(dx) + Math.abs(dy);
    // Now a real drag: claim the pointer so the pan follows beyond the
    // canvas bounds (jsdom lacks pointer capture, hence the guard).
    if (travelledRef.current > CLICK_DRAG_THRESHOLD && !drag.captured) {
      drag.captured = true;
      canvasRef.current?.setPointerCapture?.(event.pointerId);
    }
    setCamera((cam) => panBy(cam, dx, dy));
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
  };

  const onClickCapture = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (travelledRef.current <= CLICK_DRAG_THRESHOLD) return;
    travelledRef.current = 0;
    event.preventDefault();
    event.stopPropagation();
  };

  const onClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    // Only clean clicks reach here (the capture gate above kills drag
    // clicks). Anything inside a button is a node/menu click, not canvas.
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;
    onBackgroundClick?.();
  };

  // Wheel: two-finger scroll pans the plane. Attached natively (non-passive)
  // because React 18 registers wheel listeners as passive, which would ignore
  // preventDefault and let the page scroll behind the canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        // Pinch (delivered as ctrl+wheel) / cmd+wheel: zoom anchored on the
        // cursor. Multiplicative so it feels uniform at every scale.
        const rect = canvas.getBoundingClientRect();
        const point = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
        setCamera((cam) =>
          zoomAtPoint(cam, point, cam.scale * Math.exp(-event.deltaY * 0.01)),
        );
        return;
      }
      setCamera((cam) => panBy(cam, -event.deltaX, -event.deltaY));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  // Camera: recenter on the live node when it changes. Rects are read
  // post-transform, so the delta is pure screen-space. Ephemeral by design.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !liveNodeId) return;
    const node = canvas.querySelector<HTMLElement>('[data-live="true"]');
    if (!node) return;
    setCamera((cam) =>
      cameraToCenter(
        cam,
        canvas.getBoundingClientRect(),
        node.getBoundingClientRect(),
      ),
    );
  }, [liveNodeId]);

  /** Button zoom steps about the viewport's center, like a design canvas. */
  const zoomStep = (direction: 1 | -1): void => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const center = {
      x: (rect?.width ?? 0) / 2,
      y: (rect?.height ?? 0) / 2,
    };
    setCamera((cam) =>
      zoomAtPoint(
        cam,
        center,
        clampScale(round1(cam.scale + direction * ZOOM_STEP)),
      ),
    );
  };

  return (
    <div
      ref={canvasRef}
      data-testid="space-canvas"
      className="relative h-full w-full cursor-grab select-none overflow-hidden active:cursor-grabbing"
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onClickCapture={onClickCapture}
      onClick={onClick}
    >
      <div
        data-testid="space-viewport-content"
        className="absolute left-0 top-0 w-max origin-top-left"
        style={{
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
        }}
      >
        {children}
      </div>

      <div className="border-tool-rail-border bg-tool-surface-card absolute bottom-4 right-4 z-20 flex items-center gap-1 rounded-lg border px-1 py-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Zoom out"
          onClick={() => zoomStep(-1)}
        >
          −
        </Button>
        <span
          data-testid="space-zoom-level"
          className="text-tool-text-subdued min-w-[3.5ch] text-center text-[11px] tabular-nums"
        >
          {Math.round(camera.scale * 100)}%
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Zoom in"
          onClick={() => zoomStep(1)}
        >
          +
        </Button>
      </div>
    </div>
  );
}
