import React from "react";

import { cn } from "@/utils/cn";

import "./atmosphere.css";

export interface AmbientLightProps {
  className?: string;
}

/**
 * Drifting ambient light blobs — the cinematic glow behind the stage. Three
 * large blurred radial gradients (a themeable accent bloom, a warm counter-
 * light, and a cool core) drift slowly on independent loops. Overall intensity
 * is gated by the global `--ps-glow` knob; the accent stops derive from
 * `--accent` via color-mix so a theme swap recolors the bloom.
 *
 * Sits behind content (z-index 0, pointer-events: none). The app-wide
 * prefers-reduced-motion rule freezes the drift.
 */
export function AmbientLight({
  className,
}: AmbientLightProps): React.ReactElement {
  return (
    <div aria-hidden className={cn("ps-ambient", className)}>
      <div className="ps-ambient__blob ps-ambient__blob--accent" />
      <div className="ps-ambient__blob ps-ambient__blob--warm" />
      <div className="ps-ambient__blob ps-ambient__blob--core" />
    </div>
  );
}
