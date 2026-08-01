import { memo } from "react";
import type { CSSProperties } from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import type { SpanItemProps } from "./types";
import { cn } from "@/utils/cn";

/**
 * Individual span display with confidence badge
 * Clickable button that triggers scroll-to-highlight and suggestions
 */
export const SpanItem = memo<SpanItemProps>(
  ({ span, onClick, onHoverChange, backgroundColor, borderColor }) => {
    const handleClick = (): void => {
      onClick?.(span);
    };

    return (
      <Button
        type="button"
        className={cn(
          "inline-flex rounded-full border px-3 py-1 text-label-sm font-medium text-foreground shadow-inset transition-all duration-150 hover:brightness-95",
          "border-[var(--span-border)] bg-[var(--span-bg)]",
        )}
        style={
          {
            "--span-bg": backgroundColor,
            "--span-border": borderColor ?? backgroundColor,
          } as CSSProperties
        }
        onMouseEnter={() => onHoverChange?.(span.id)}
        onMouseLeave={() => onHoverChange?.(null)}
        onClick={handleClick}
        title={span.quote}
        variant="ghost"
      >
        {span.quote}
      </Button>
    );
  },
);

SpanItem.displayName = "SpanItem";
