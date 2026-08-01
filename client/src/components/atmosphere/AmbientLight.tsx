import React from "react";

import { cn } from "@/utils/cn";

import "./atmosphere.css";

export interface AmbientLightProps {
  className?: string;
}

/**
 * Ambient light — a single static radial bloom behind the stage. Intensity is
 * gated by the global `--glow` knob; the stops derive from `--accent` via
 * color-mix so a theme swap recolors it.
 *
 * One blob, one hue, no motion: this is a tool surface, and the generated
 * video that fills it is the only thing that should carry color or movement.
 *
 * Sits behind content (z-index -2, pointer-events: none).
 */
export function AmbientLight({
  className,
}: AmbientLightProps): React.ReactElement {
  return (
    <div aria-hidden className={cn("ps-ambient", className)}>
      <div className="ps-ambient__blob ps-ambient__blob--accent" />
    </div>
  );
}
