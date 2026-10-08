import React, { useCallback, useEffect, useRef, useState } from "react";
import zoomPlusIcon from "@/assets/design-system/zoom-plus.svg";
import zoomFitIcon from "@/assets/design-system/zoom-fit.svg";
import zoomMinusIcon from "@/assets/design-system/zoom-minus.svg";
import { Button } from "@promptstudio/system/components/ui/button";
import {
  cameraToCenter,
  clampScale,
  panBy,
  unionRect,
  zoomAtPoint,
  type CanvasCamera,
  type ScreenRect,
} from "./canvasCamera";

const ZOOM_STEP = 0.1;

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * The camera's focus contract, published so consumers name it instead of
 * repeating a string. Tag every element the camera may center on with its own
 * id; the viewport centers the union of those whose value equals `liveNodeId`.
 *
 * Keying the mark by the same id the prop carries means the two halves cannot
 * disagree about *which* object is live — a mismatch centers nothing rather
 * than silently centering the wrong thing.
 */
export const CANVAS_FOCUS_ATTR = "data-canvas-focus";

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
  interactionMode = "select",
  focusTop,
}: {
  children: React.ReactNode;
  /**
   * The current take. When it changes the camera recenters on every descendant
   * marked `CANVAS_FOCUS_ATTR={liveNodeId}` — one element or a whole batch.
   */
  liveNodeId?: string | null;
  /**
   * A clean click on empty canvas (not a node, not a pan-drag's trailing
   * click). ADR-0015 uses this to return focus to the media — collapsing
   * the composer.
   */
  onBackgroundClick?: () => void;
  /** Studio Pan mode suppresses image selection while moving the camera. */
  interactionMode?: "select" | "pan";
  /** Optional screen-space top inset for a focused editor; default centers it. */
  focusTop?: number;
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
    const target = event.target as HTMLElement;
    const panSelection =
      interactionMode === "pan" &&
      Boolean(target.closest("[" + CANVAS_FOCUS_ATTR + "]"));
    if (!panSelection && travelledRef.current <= CLICK_DRAG_THRESHOLD) return;
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

  // The camera the DOM currently renders — the frame of reference every
  // getBoundingClientRect() belongs to. Tracked so recentering can be
  // computed against the rects' real camera instead of the updater queue's
  // in-flight value (which may be ahead of the un-repainted DOM). Declared
  // before the recenter effect so it is current when that effect runs.
  const committedCameraRef = useRef(camera);
  useEffect(() => {
    committedCameraRef.current = camera;
  });

  /**
   * The camera value auto-centering last wrote. While the live camera still
   * equals it, the creator has not taken the camera — so the viewport may keep
   * the live node centered as the stage resizes. Their first pan or zoom makes
   * the two diverge, and auto-centering stands down for good.
   */
  const autoCameraRef = useRef<CanvasCamera | null>(null);
  const focusedNodeRef = useRef<string | null>(null);

  // Rects are read post-transform, so the delta is pure screen-space. The
  // target is set as an absolute value: re-runs against the same layout
  // (StrictMode's double mount, Fast Refresh) converge instead of stacking
  // the pan — the regression that left the live editor cut off-center.
  const centerOnLiveNode = useCallback((): void => {
    const canvas = canvasRef.current;
    if (!canvas || !liveNodeId) return;
    // Matched in JS rather than through a built selector: the id is caller
    // data, and a value carrying quotes would otherwise be parsed as syntax.
    const marked = canvas.querySelectorAll<HTMLElement>(
      `[${CANVAS_FOCUS_ATTR}]`,
    );
    const rects: ScreenRect[] = [];
    for (const element of marked) {
      if (element.getAttribute(CANVAS_FOCUS_ATTR) !== liveNodeId) continue;
      rects.push(element.getBoundingClientRect());
    }
    const focus = unionRect(rects);
    if (!focus) return;
    const viewport = canvas.getBoundingClientRect();
    const centered = cameraToCenter(
      committedCameraRef.current,
      viewport,
      focus,
    );
    const next =
      focusTop === undefined
        ? centered
        : {
            ...centered,
            y:
              committedCameraRef.current.y +
              viewport.top +
              focusTop -
              focus.top,
          };
    autoCameraRef.current = next;
    setCamera(next);
  }, [liveNodeId, focusTop]);

  // Camera: recenter on the live node when it changes. Ephemeral by design.
  useEffect(() => {
    if (!liveNodeId) return;
    const changedNode = focusedNodeRef.current !== liveNodeId;
    focusedNodeRef.current = liveNodeId;
    const auto = autoCameraRef.current;
    const live = committedCameraRef.current;
    if (
      changedNode ||
      auto === null ||
      (auto.x === live.x && auto.y === live.y && auto.scale === live.scale)
    )
      centerOnLiveNode();
  }, [liveNodeId, centerOnLiveNode]);

  // A stage that resizes after mount (collapsing the rail, resizing the
  // window, opening devtools) would otherwise strand the node off-center —
  // it was centered for a viewport that no longer exists. Re-center only
  // while the camera is still exactly where auto-centering put it.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !liveNodeId) return;
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const auto = autoCameraRef.current;
      const live = committedCameraRef.current;
      if (
        auto === null ||
        auto.x !== live.x ||
        auto.y !== live.y ||
        auto.scale !== live.scale
      ) {
        return;
      }
      centerOnLiveNode();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [liveNodeId, centerOnLiveNode]);

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

      {/* A floating panel is the same material as the chrome it belongs to,
          just smaller: one surface step above the canvas, 10px radius, 4px
          padding, and children on the one control size. */}
      <div className="vidra-canvas-controls absolute bottom-3 right-3 z-20 flex h-10 w-[154px] items-center rounded-md border-[0.5px] p-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="bg-fill"
          aria-label="Zoom out"
          onClick={() => zoomStep(-1)}
        >
          <img src={zoomMinusIcon} alt="" width={16} height={16} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="bg-fill"
          aria-label="Fit to view"
          title="Fit to view"
          onClick={centerOnLiveNode}
        >
          <img src={zoomFitIcon} alt="" width={16} height={16} />
        </Button>
        <span
          data-testid="space-zoom-level"
          className="text-foreground text-meta h-4 w-11 flex-none cursor-default text-center font-normal tabular-nums"
        >
          {Math.round(camera.scale * 100)}%
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="bg-fill"
          aria-label="Zoom in"
          onClick={() => zoomStep(1)}
        >
          <img src={zoomPlusIcon} alt="" width={16} height={16} />
        </Button>
      </div>
    </div>
  );
}
