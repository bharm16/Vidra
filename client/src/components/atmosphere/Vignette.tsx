import React from "react";

import { cn } from "@/utils/cn";

import "./atmosphere.css";

export interface VignetteProps {
  /**
   * `anchor` is the deeper double-layer vignette the empty state carries;
   * `default` is the lighter workspace/page vignette. Defaults to `default`.
   */
  intensity?: "default" | "anchor";
  className?: string;
}

/**
 * Inset-shadow vignette that darkens the frame edges. Sits above content
 * (pointer-events: none) so it deepens the stage without intercepting clicks.
 */
export function Vignette({
  intensity = "default",
  className,
}: VignetteProps): React.ReactElement {
  return (
    <div
      aria-hidden
      className={cn(
        "ps-vignette",
        intensity === "anchor" && "ps-vignette--anchor",
        className,
      )}
    />
  );
}
