/**
 * EstimatedCostBadge Component
 *
 * Displays the estimated total credit cost - styled to be very subtle.
 *
 * @requirement 15.1 - Display estimated total credit cost for completion
 */

import React from "react";
import { Coins, Info } from "@promptstudio/system/components/ui";

import { cn } from "@/utils/cn";

export interface EstimatedCostBadgeProps {
  estimatedCost?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
  showTooltip?: boolean;
  variant?: "default" | "subtle" | "prominent";
}

const ESTIMATED_TOTAL_COST = 24;

type BadgeSize = NonNullable<EstimatedCostBadgeProps["size"]>;

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: "text-[12px] gap-1.5",
  md: "text-[13px] gap-1.5",
  lg: "text-[14px] gap-2",
};

const ICON_SIZES: Record<BadgeSize, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

export const EstimatedCostBadge: React.FC<EstimatedCostBadgeProps> = ({
  estimatedCost = ESTIMATED_TOTAL_COST,
  size = "md",
  className,
  showTooltip = true,
  variant = "default",
}) => {
  // Subtle variant - just floating text, no container
  if (variant === "subtle") {
    return (
      <div
        className={cn(
          "inline-flex items-center",
          SIZE_CLASSES[size],
          "text-zinc-700",
          className,
        )}
        role="status"
        aria-label={`Estimated cost: approximately ${estimatedCost} credits`}
      >
        <Coins
          className={cn(ICON_SIZES[size], "text-zinc-700")}
          aria-hidden="true"
        />
        <span className="text-zinc-600">~{estimatedCost}</span>
        <span className="text-zinc-700">credits</span>
        {showTooltip && (
          <div className="group relative ml-0.5">
            <Info
              className={cn(
                ICON_SIZES[size],
                "cursor-help text-zinc-700 hover:text-zinc-600 transition-colors",
              )}
              aria-hidden="true"
            />
            <div
              className={cn(
                "absolute bottom-full left-1/2 -translate-x-1/2 mb-2",
                "invisible group-hover:visible opacity-0 group-hover:opacity-100",
                "transition-all duration-200",
                "w-48 p-2.5 rounded-lg",
                "bg-zinc-900 border border-white/[0.06] text-[12px]",
                "z-tooltip",
              )}
              role="tooltip"
            >
              <p className="font-medium text-zinc-400 mb-1">
                Estimated Total Cost
              </p>
              <p className="text-zinc-500 leading-relaxed">
                Includes direction, mood, framing, lighting, final frame, camera
                motion, and subject motion preview.
              </p>
              <div
                className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-zinc-900"
                aria-hidden="true"
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Default/prominent variants
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        SIZE_CLASSES[size],
        variant === "default"
          ? "px-3 py-1 bg-white/[0.03] text-zinc-400 border border-white/[0.06]"
          : "px-3 py-1 bg-violet-600/10 text-violet-400 border border-violet-600/20",
        className,
      )}
      role="status"
      aria-label={`Estimated cost: approximately ${estimatedCost} credits`}
    >
      <Coins
        className={cn(
          ICON_SIZES[size],
          variant === "prominent" ? "text-violet-400" : "text-zinc-500",
        )}
        aria-hidden="true"
      />
      <span>~{estimatedCost}</span>
      <span className="opacity-60">credits</span>
    </div>
  );
};

EstimatedCostBadge.displayName = "EstimatedCostBadge";

export default EstimatedCostBadge;
