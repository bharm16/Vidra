import type { ReactElement } from "react";
import type { IconProps as PhosphorIconProps } from "@phosphor-icons/react";
import type { ComponentType } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@promptstudio/system/components/ui/tooltip";
import { cn } from "@utils/cn";

/** Phosphor icon component (not the wrapped Icon from our design system). */
type PhosphorIcon = ComponentType<PhosphorIconProps>;

interface ToolNavButtonProps {
  icon: PhosphorIcon;
  label: string;
  isActive: boolean;
  onClick: () => void;
  variant?: "header" | "default";
}

/**
 * Rail navigation button — compact 40px square icon button.
 *
 * Visual style mirrors the unified-workspace handoff:
 * - Active: subtle bg tint, regular-weight outlined icon (no fill)
 * - Inactive: muted text, light-weight outlined icon
 * - Label shown via a hover tooltip (Radix, provided by ToolRail's
 *   TooltipProvider)
 *
 * The previous left-edge indicator pill was removed — the screenshot uses
 * a bg-only active state so the rail reads quieter.
 */
export function ToolNavButton({
  icon: IconComponent,
  label,
  isActive,
  onClick,
}: ToolNavButtonProps): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl transition-colors duration-200",
            isActive
              ? "bg-tool-nav-active text-foreground"
              : "text-tool-text-muted hover:bg-tool-nav-hover hover:text-foreground",
          )}
          onClick={onClick}
          aria-label={label}
          aria-pressed={isActive}
        >
          <IconComponent size={20} weight={isActive ? "regular" : "light"} />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        className="text-body-sm text-foreground rounded-lg border border-[rgb(67,70,81)] bg-[rgb(24,25,28)] shadow-[0_4px_12px_rgba(0,0,0,0.4)]"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
