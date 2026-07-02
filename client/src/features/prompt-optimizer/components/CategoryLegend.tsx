import { memo } from "react";
import type { CSSProperties } from "react";
import { Icon, Info, X } from "@promptstudio/system/components/ui";
import { Button } from "@promptstudio/system/components/ui/button";
import {
  CATEGORY_CONFIG,
  CATEGORY_ORDER,
} from "../SpanCategoryAccordion/config/categoryConfig";
import type { CategoryLegendProps } from "../types";
import { cn } from "@/utils/cn";

type CategoryKey = keyof typeof CATEGORY_CONFIG;

/**
 * Get example text for each category
 */
function getCategoryExample(category: CategoryKey): string {
  const examples: Record<CategoryKey, string> = {
    shot: "close-up, wide shot, low-angle",
    subject: "young painter, elderly historian",
    action: "gripping paintbrush, walking slowly",
    environment: "cozy studio, rain-soaked alley",
    lighting: "soft diffused light, golden hour",
    camera: "gently pans, dolly in, rack focus",
    style: "35mm film, cyberpunk, noir",
    technical: "4k, 8k, 16:9, shallow DOF",
    audio: "low ambient hum, subtle score",
  };
  return examples[category] ?? "";
}

/**
 * Category Legend Component
 * Displays a legend of all highlight categories with examples
 * Now dynamically generated from categoryConfig for consistency
 */
export const CategoryLegend = memo<CategoryLegendProps>(
  ({
    show,
    onClose,
    hasContext = false,
    isSuggestionsOpen = false,
  }): React.ReactElement | null => {
    if (!show) return null;

    // Generate categories dynamically from actual configuration
    const categories = (CATEGORY_ORDER as CategoryKey[]).map((categoryKey) => {
      const config = CATEGORY_CONFIG[categoryKey];
      return {
        name: config.label,
        color: config.backgroundColor,
        border: config.borderColor,
        example: getCategoryExample(categoryKey),
      };
    });

    // Dynamic positioning based on right-rail visibility (PromptCanvas-scoped vars).
    const gapVar = "var(--pc-gap, 16px)";
    const railVar = "var(--pc-right-rail, 420px)";
    const rightOffset = isSuggestionsOpen
      ? `calc(${gapVar} + ${railVar} + ${gapVar})`
      : gapVar;

    return (
      <div
        className="absolute z-popover w-80 overflow-hidden rounded-lg border border-border bg-surface-2 shadow-md"
        style={{ right: rightOffset }}
        role="dialog"
        aria-label="Highlight categories"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-body-sm font-semibold text-foreground">
              <Icon icon={Info} size="sm" weight="bold" aria-hidden="true" />
              Highlight categories
            </div>
            <div className="mt-1 text-label-12 text-muted">
              {hasContext ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-3 px-2 py-0.5 text-label-sm text-muted">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-success"
                    aria-hidden="true"
                  />
                  Brainstorm context active
                </span>
              ) : (
                "Showing all span labeling categories"
              )}
            </div>
          </div>
          <Button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-md border border-border bg-surface-3 text-muted transition-colors hover:border-border-strong hover:text-foreground"
            aria-label="Close legend"
            variant="ghost"
            size="icon"
          >
            <Icon icon={X} size="sm" weight="bold" aria-hidden="true" />
          </Button>
        </div>

        <div className="max-h-screen overflow-auto p-4">
          <div className="flex flex-col gap-3" role="list">
            {categories.map((cat) => (
              <div
                key={cat.name}
                className="flex items-start gap-3"
                role="listitem"
              >
                <div
                  className={cn(
                    "mt-0.5 h-5 w-14 flex-shrink-0 rounded-md border border-[var(--swatch-border)]",
                    "bg-[var(--swatch-bg)]",
                  )}
                  style={
                    {
                      "--swatch-bg": cat.color,
                      "--swatch-border": cat.border,
                    } as CSSProperties
                  }
                  aria-hidden="true"
                />
                <div style={{ minWidth: 0 }}>
                  <div className="text-label-12 font-semibold text-foreground">
                    {cat.name}
                  </div>
                  <div
                    className="mt-0.5 truncate text-label-12 text-muted"
                    title={cat.example}
                  >
                    {cat.example}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-border pt-4">
            <div className="mb-2 text-label-sm font-semibold uppercase tracking-widest text-faint">
              How it works
            </div>
            <div className="text-label-12 text-muted leading-relaxed">
              {hasContext
                ? "Your Creative Brainstorm selections are prioritized first, followed by additional details detected by analysis."
                : "Categories are automatically detected based on video production standards."}
            </div>
            <ul className="mt-2 grid gap-1 pl-4 text-label-12 text-muted leading-relaxed">
              {hasContext ? (
                <>
                  <li>Your input gets highest priority</li>
                  <li>Semantic matches detected</li>
                  <li>Additional analysis for new details</li>
                  <li>Smart deduplication prevents overlaps</li>
                </>
              ) : (
                <>
                  <li>Intelligent semantic understanding</li>
                  <li>Context-aware categorization</li>
                  <li>Aligned with video generation models</li>
                  <li>Confidence-based highlighting</li>
                </>
              )}
            </ul>
            <div className="mt-3 text-label-12 text-muted leading-relaxed">
              Click any highlight to get AI-powered alternatives.
            </div>
          </div>
        </div>
      </div>
    );
  },
);

CategoryLegend.displayName = "CategoryLegend";
