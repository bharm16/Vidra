import React from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import { cn } from "@utils/cn";

interface LibraryFilterChipProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}

/**
 * Library filter pill — the All / Sessions / Kept clips selector from the
 * design handoff. Selection uses the stronger control fill; all labels remain
 * white and use the same 14px type and 36px height.
 */
export function LibraryFilterChip({
  active,
  onClick,
  children,
  className,
}: LibraryFilterChipProps): React.ReactElement {
  return (
    <Button
      type="button"
      variant="ghost"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-9 min-w-11 rounded-full border-0 px-3 font-sans text-ui font-normal transition-colors",
        active
          ? "bg-white text-app hover:bg-white hover:text-app"
          : "text-foreground bg-fill hover:bg-hover",
        className,
      )}
    >
      {children}
    </Button>
  );
}
