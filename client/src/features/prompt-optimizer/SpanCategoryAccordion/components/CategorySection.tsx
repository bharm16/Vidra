import { memo, useState } from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import { SpanItem } from "./SpanItem";
import { EMPTY_STATE_MESSAGE } from "../config/categoryConfig";
import type { CategorySectionProps } from "./types";
import { cn } from "@/utils/cn";

/**
 * Category section container with collapse/expand functionality.
 */
export const CategorySection = memo<CategorySectionProps>(
  ({
    category,
    spans,
    config,
    onSpanClick,
    defaultExpanded = false,
    onSpanHoverChange,
  }) => {
    const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);

    const hasSpans = spans.length > 0;
    const IconComponent = config.icon;

    return (
      <section
        className="overflow-hidden rounded-lg border border-border bg-surface-2 shadow-sm"
        data-category={category}
        data-expanded={isExpanded ? "true" : "false"}
      >
        <Button
          type="button"
          className={cn(
            "flex h-10 w-full items-center gap-2 px-3 text-left",
            !isExpanded && "opacity-80 hover:opacity-100",
          )}
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
          variant="ghost"
        >
          <IconComponent size={14} className="text-foreground/80" />
          <span className="flex-1 text-label-12 font-semibold tracking-wide text-foreground">
            {config.label}
          </span>
          <span
            className="rounded-full border border-border bg-raise px-2 py-0.5 text-label-sm text-muted"
            aria-label={`${spans.length} items`}
          >
            {spans.length}
          </span>
        </Button>

        <div
          className={cn(
            "overflow-hidden transition-all duration-200",
            isExpanded
              ? "max-h-96 translate-y-0 opacity-100"
              : "max-h-0 -translate-y-1 opacity-0",
          )}
        >
          <div className="p-3">
            {hasSpans ? (
              <div className="flex flex-wrap gap-2">
                {spans.map((span) => (
                  <SpanItem
                    key={span.id}
                    span={span}
                    onClick={onSpanClick}
                    {...(onSpanHoverChange
                      ? { onHoverChange: onSpanHoverChange }
                      : {})}
                    backgroundColor={config.backgroundColor}
                    borderColor={config.borderColor}
                  />
                ))}
              </div>
            ) : (
              <div className="pt-1.5 text-label-sm text-faint">
                {EMPTY_STATE_MESSAGE}
              </div>
            )}
          </div>
        </div>
      </section>
    );
  },
);

CategorySection.displayName = "CategorySection";
