import React from "react";
import { cn } from "@/utils/cn";
import type { GenerationTier } from "../types";

interface GenerationBadgeProps {
  tier: GenerationTier;
  className?: string;
}

export function GenerationBadge({
  tier,
  className,
}: GenerationBadgeProps): React.ReactElement {
  const isDraft = tier === "draft";
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-meta font-semibold backdrop-blur-md",
        "bg-black/40",
        isDraft ? "text-success-400/80" : "text-accent-2/80",
        className,
      )}
    >
      {isDraft ? "Draft" : "Render"}
    </span>
  );
}
