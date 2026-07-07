import React, { useEffect, useRef, useState } from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import { computeCenteredScroll } from "./spaceCamera";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;

const round1 = (n: number): number => Math.round(n * 10) / 10;
const clampZoom = (n: number): number =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, round1(n)));

/**
 * The space's camera/zoom viewport (ADR-0012 / M5). Scales the lineage network
 * in place and, on a live-node change, pans so the live node lands dead-center.
 * Both the zoom level and the camera are ephemeral — nothing spatial is stored,
 * so they reset on reload. A −/%/+ control floats over the space.
 */
export function SpaceViewport({
  children,
  liveNodeId,
}: {
  children: React.ReactNode;
  /** The current take; when it changes the camera recenters on it. */
  liveNodeId?: string | null;
}): React.ReactElement {
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Camera: center the live node when it changes. Read the rendered rects
  // (post-transform, so zoom is already baked in) and scroll the container so
  // the node's center meets the viewport's. Ephemeral by design.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !liveNodeId) return;
    if (typeof container.scrollTo !== "function") return;
    const node = container.querySelector<HTMLElement>('[data-live="true"]');
    if (!node) return;
    const containerRect = container.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const { scrollLeft, scrollTop } = computeCenteredScroll(
      {
        scrollLeft: container.scrollLeft,
        scrollTop: container.scrollTop,
        left: containerRect.left,
        top: containerRect.top,
        width: containerRect.width,
        height: containerRect.height,
      },
      {
        left: nodeRect.left,
        top: nodeRect.top,
        width: nodeRect.width,
        height: nodeRect.height,
      },
    );
    container.scrollTo({
      left: scrollLeft,
      top: scrollTop,
      behavior: "smooth",
    });
  }, [liveNodeId]);

  return (
    <div ref={scrollRef} className="relative h-full w-full overflow-auto">
      <div
        data-testid="space-viewport-content"
        className="origin-top"
        style={{ transform: `scale(${zoom})` }}
      >
        {children}
      </div>

      <div className="border-tool-rail-border bg-tool-surface-card absolute bottom-4 right-4 z-20 flex items-center gap-1 rounded-lg border px-1 py-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Zoom out"
          onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
        >
          −
        </Button>
        <span
          data-testid="space-zoom-level"
          className="text-tool-text-subdued min-w-[3.5ch] text-center text-[11px] tabular-nums"
        >
          {Math.round(zoom * 100)}%
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Zoom in"
          onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
        >
          +
        </Button>
      </div>
    </div>
  );
}
