import React, { useState } from "react";
import { Button } from "@promptstudio/system/components/ui/button";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;

const round1 = (n: number): number => Math.round(n * 10) / 10;
const clampZoom = (n: number): number =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, round1(n)));

/**
 * The space's camera/zoom viewport (ADR-0012 / M5). Scales the lineage network
 * in place; the zoom level is ephemeral — nothing spatial is stored, so it
 * resets on reload. A −/%/+ control floats over the space.
 */
export function SpaceViewport({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [zoom, setZoom] = useState(1);

  return (
    <div className="relative h-full w-full overflow-auto">
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
