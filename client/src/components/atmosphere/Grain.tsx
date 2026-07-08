import React from "react";

import { cn } from "@/utils/cn";

import "./atmosphere.css";

export interface GrainProps {
  /**
   * Whether the filmic-grain overlay renders. The handoff exposes grain as a
   * boolean theme knob; off removes the layer entirely (not merely
   * transparent). Defaults to on.
   */
  enabled?: boolean;
  className?: string;
}

/**
 * Full-bleed filmic-grain overlay — a signature layer of the design handoff.
 *
 * A fixed feTurbulence noise tile blended over the stage. Opacity is driven by
 * the global `--ps-grain` knob, so a theme can dial intensity without touching
 * this component; the `enabled` prop gates presence entirely.
 *
 * Absolutely positioned: fills the nearest positioned ancestor, so the screen
 * that mounts it must establish a stacking/position context.
 */
export function Grain({
  enabled = true,
  className,
}: GrainProps): React.ReactElement | null {
  if (!enabled) return null;
  return <div aria-hidden className={cn("ps-grain", className)} />;
}
