import React from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import { cn } from "@utils/cn";

interface LibraryFilterChipProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

/**
 * Library filter pill — the All / Sessions / Kept clips selector from the
 * design handoff. Active reads as a solid light fill on dark text; idle is a
 * transparent pill with a hairline border. Space Grotesk, full pill radius.
 */
export function LibraryFilterChip({
  active,
  onClick,
  children,
}: LibraryFilterChipProps): React.ReactElement {
  return (
    <Button
      type="button"
      variant="ghost"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-auto rounded-full border px-4 py-[7px] font-sans text-[12.5px] font-medium transition-all",
        active
          ? "border-foreground bg-foreground text-app hover:bg-foreground hover:text-app"
          : "text-tool-text-dim hover:text-foreground border-white/[0.14] bg-transparent hover:border-white/30 hover:bg-white/[0.04]",
      )}
    >
      {children}
    </Button>
  );
}
