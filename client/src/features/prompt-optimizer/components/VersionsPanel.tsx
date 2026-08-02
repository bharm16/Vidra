import React, { memo } from "react";
import {
  CaretDown,
  CaretLeft,
  Icon,
  List,
  Plus,
} from "@promptstudio/system/components/ui";
import { Button } from "@promptstudio/system/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@promptstudio/system/components/ui/tooltip";
import { cn } from "@/utils/cn";
import { VersionRow, type VersionEntry } from "./VersionRow";

interface VersionsPanelProps {
  versions: VersionEntry[];
  selectedVersionId: string;
  onSelectVersion: (id: string) => void;
  onCreateVersion: () => void;
  isCompact?: boolean;
  onExpandDrawer?: () => void;
  onCollapseDrawer?: () => void;
  /** Layout direction - 'vertical' for left drawer, 'horizontal' for bottom drawer */
  layout?: "vertical" | "horizontal";
}

const resolveEntryId = (entry: VersionEntry): string | null => {
  if (typeof entry.versionId === "string" && entry.versionId.trim()) {
    return entry.versionId.trim();
  }
  if (typeof entry.id === "string" && entry.id.trim()) {
    return entry.id.trim();
  }
  return null;
};

export const VersionsPanel = memo(function VersionsPanel({
  versions,
  selectedVersionId,
  onSelectVersion,
  onCreateVersion,
  isCompact = false,
  onExpandDrawer,
  onCollapseDrawer,
  layout = "vertical",
}: VersionsPanelProps): React.ReactElement {
  const orderedVersions = versions ?? [];
  const fallbackId = orderedVersions[0]
    ? resolveEntryId(orderedVersions[0])
    : null;
  const resolvedSelectedId = selectedVersionId || fallbackId || "";
  const currentVersion =
    orderedVersions.find((entry) => {
      const entryId = resolveEntryId(entry);
      return entryId && entryId === resolvedSelectedId;
    }) ??
    orderedVersions[0] ??
    null;
  const versionCount = orderedVersions.length;
  const horizontalScrollerRef = React.useRef<HTMLDivElement>(null);
  const [horizontalFadeState, setHorizontalFadeState] = React.useState<{
    showLeft: boolean;
    showRight: boolean;
    isScrollable: boolean;
  }>({ showLeft: false, showRight: false, isScrollable: false });

  React.useEffect(() => {
    if (layout !== "horizontal" || isCompact) return;
    const scroller = horizontalScrollerRef.current;
    if (!scroller) return;

    const updateFadeState = (): void => {
      const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
      const isScrollable = maxScrollLeft > 1;
      const showLeft = isScrollable && scroller.scrollLeft > 1;
      const showRight = isScrollable && scroller.scrollLeft < maxScrollLeft - 1;
      setHorizontalFadeState({ showLeft, showRight, isScrollable });
    };

    updateFadeState();
    scroller.addEventListener("scroll", updateFadeState, { passive: true });
    window.addEventListener("resize", updateFadeState);

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => updateFadeState())
        : null;
    resizeObserver?.observe(scroller);

    return () => {
      scroller.removeEventListener("scroll", updateFadeState);
      window.removeEventListener("resize", updateFadeState);
      resizeObserver?.disconnect();
    };
  }, [isCompact, layout, orderedVersions.length]);

  // Horizontal layout (bottom drawer)
  if (layout === "horizontal") {
    const compactLabel = `${versionCount} version${versionCount === 1 ? "" : "s"}`;

    // ── Compact: 36px bar with mini preview pills ──
    if (isCompact) {
      return (
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center gap-1.5",
            "rounded-lg border border-border bg-surface-1",
            "px-3 text-left",
            "transition-colors hover:bg-surface-2",
            "cursor-pointer",
          )}
          onClick={onExpandDrawer}
          aria-label={`Expand ${compactLabel}`}
          title={`Expand ${compactLabel}`}
        >
          <span className="text-meta font-semibold text-muted">Versions</span>
          <span className="text-meta font-medium text-faint">
            {versionCount}
          </span>

          {/* Mini preview pills */}
          <div className="ml-1.5 flex items-center gap-1">
            {orderedVersions.slice(0, 4).map((entry) => {
              const entryId = resolveEntryId(entry);
              const isEntrySelected = entryId
                ? entryId === resolvedSelectedId
                : false;
              return (
                <div
                  key={entryId ?? entry.label}
                  className={cn(
                    "h-4 w-7 overflow-hidden rounded-xs bg-surface-2 transition-all duration-150",
                    isEntrySelected
                      ? "ring-1 ring-accent/50"
                      : "border border-border",
                  )}
                />
              );
            })}
            {orderedVersions.length > 4 ? (
              <span className="ml-0.5 text-meta text-faint">
                +{orderedVersions.length - 4}
              </span>
            ) : null}
          </div>

          <div className="flex-1" />
          <Icon
            icon={CaretDown}
            size="xs"
            weight="bold"
            aria-hidden="true"
            className="rotate-180 text-muted"
          />
        </button>
      );
    }

    // ── Expanded: 36px header + filmstrip ──
    return (
      <div className="flex h-full w-full flex-col overflow-hidden">
        {/* 36px header — no hamburger, no badge pill */}
        <div className="flex h-9 flex-shrink-0 items-center px-3">
          <span className="text-meta font-semibold text-muted">Versions</span>
          <span className="ml-1.5 text-meta font-medium text-faint">
            {versionCount}
          </span>

          <div className="flex-1" />

          <TooltipProvider delayDuration={120}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="canvas"
                  size="icon-sm"
                  className="h-6 w-6 [&_svg]:size-3"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateVersion();
                  }}
                  aria-label="Create snapshot"
                >
                  <Icon
                    icon={Plus}
                    size="xs"
                    weight="bold"
                    aria-hidden="true"
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="ps-glass-subtle border-border/60 text-body-sm text-foreground"
              >
                <span>Create snapshot</span>
              </TooltipContent>
            </Tooltip>

            {onCollapseDrawer ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="canvas"
                    size="icon-sm"
                    className="ml-1 h-6 w-6 [&_svg]:size-[10px]"
                    onClick={onCollapseDrawer}
                    aria-label="Collapse versions panel"
                  >
                    <Icon
                      icon={CaretDown}
                      size="xs"
                      weight="bold"
                      aria-hidden="true"
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="ps-glass-subtle border-border/60 text-body-sm text-foreground"
                >
                  <span>Toggle versions (`)</span>
                </TooltipContent>
              </Tooltip>
            ) : null}
          </TooltipProvider>
        </div>

        {/* Filmstrip */}
        {orderedVersions.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-meta text-muted">
            No versions yet
          </div>
        ) : (
          <div className="relative flex-1 overflow-hidden">
            {/* Left fade */}
            <div
              className={cn(
                "pointer-events-none absolute left-0 top-0 z-10 h-full w-5",
                "bg-gradient-to-r from-surface-2 to-transparent transition-opacity",
                horizontalFadeState.showLeft ? "opacity-100" : "opacity-0",
              )}
              aria-hidden="true"
            />

            <div
              ref={horizontalScrollerRef}
              className={cn(
                "ps-scrollbar-thin",
                "flex h-full items-start overflow-x-auto",
                "gap-3 px-3 pb-3",
                "snap-x snap-mandatory scroll-px-3",
              )}
            >
              {orderedVersions.map((entry, index) => {
                const versionId = resolveEntryId(entry);
                const isSelected = versionId
                  ? versionId === resolvedSelectedId
                  : index === 0;
                const key = versionId ?? `${entry.label ?? "v"}-${index}`;

                return (
                  <VersionRow
                    key={key}
                    entry={entry}
                    index={index}
                    total={orderedVersions.length}
                    isSelected={isSelected}
                    onSelect={() => {
                      if (!versionId) return;
                      onSelectVersion(versionId);
                    }}
                    layout="horizontal"
                  />
                );
              })}
            </div>

            {/* Right fade */}
            <div
              className={cn(
                "pointer-events-none absolute right-0 top-0 z-10 h-full w-5",
                "bg-gradient-to-l from-surface-2 to-transparent transition-opacity",
                horizontalFadeState.showRight ? "opacity-100" : "opacity-0",
              )}
              aria-hidden="true"
            />
          </div>
        )}
      </div>
    );
  }

  // Original vertical layout (left drawer)
  const compactLabel = `${versionCount} version${versionCount === 1 ? "" : "s"} - Click to expand`;

  if (isCompact) {
    return (
      <button
        type="button"
        className="border-border bg-surface-2 group flex h-full w-ps-9 flex-col items-center gap-ps-4 rounded-xl border py-ps-4 text-left shadow-sm"
        onClick={onExpandDrawer}
        title={compactLabel}
        aria-label={compactLabel}
      >
        <span
          className="border-border bg-raise text-muted group-hover:text-foreground inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors"
          title="Toggle versions ([)"
        >
          <Icon
            icon={CaretLeft}
            size="sm"
            weight="bold"
            aria-hidden="true"
            className="rotate-180"
          />
        </span>
        <div className="relative flex items-center justify-center">
          <Icon
            icon={List}
            size="md"
            weight="bold"
            aria-hidden="true"
            className="text-muted"
          />
          <span className="bg-accent text-app absolute -right-ps-3 -top-ps-2 flex h-ps-4 min-w-ps-4 items-center justify-center rounded-full px-ps-1 text-meta font-semibold">
            {versionCount}
          </span>
        </div>
        {currentVersion ? (
          <span
            className="bg-accent ring-accent/30 h-2 w-2 rounded-full ring-2"
            title={currentVersion.label ?? "Current version"}
          />
        ) : null}
      </button>
    );
  }

  return (
    <aside className="border-border bg-surface-2 flex h-full flex-col overflow-hidden rounded-xl border">
      <div className="px-ps-6 pb-ps-3 pt-ps-4">
        <TooltipProvider delayDuration={120}>
          <div className="flex items-start justify-between gap-ps-3">
            <div>
              <div className="text-body-lg text-foreground font-semibold">
                Versions
              </div>
              <div className="text-label-12 text-muted mt-ps-1">
                Prompt snapshots
              </div>
            </div>
            <div className="flex items-center gap-ps-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="canvas"
                    size="icon-sm"
                    onClick={onCreateVersion}
                    aria-label="Create snapshot"
                  >
                    <Icon
                      icon={Plus}
                      size="sm"
                      weight="bold"
                      aria-hidden="true"
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="ps-glass-subtle border-border/60 text-body-sm text-foreground"
                >
                  <span>Create snapshot</span>
                </TooltipContent>
              </Tooltip>
              {onCollapseDrawer ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="canvas"
                      size="icon-sm"
                      onClick={onCollapseDrawer}
                      aria-label="Collapse versions panel"
                    >
                      <Icon
                        icon={CaretLeft}
                        size="sm"
                        weight="bold"
                        aria-hidden="true"
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="ps-glass-subtle border-border/60 text-body-sm text-foreground"
                  >
                    <span>Toggle versions ([)</span>
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          </div>
        </TooltipProvider>
      </div>
      {orderedVersions.length === 0 ? (
        <div className="text-label-12 text-muted flex flex-1 items-center justify-center">
          No versions yet
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-ps-2 overflow-y-auto px-ps-3 pb-ps-3">
          {orderedVersions.map((entry, index) => {
            const versionId = resolveEntryId(entry);
            const isSelected = versionId
              ? versionId === resolvedSelectedId
              : index === 0;
            const key = versionId ?? `${entry.label ?? "v"}-${index}`;

            return (
              <VersionRow
                key={key}
                entry={entry}
                index={index}
                total={orderedVersions.length}
                isSelected={isSelected}
                onSelect={() => {
                  if (!versionId) return;
                  onSelectVersion(versionId);
                }}
              />
            );
          })}
        </div>
      )}
    </aside>
  );
});

VersionsPanel.displayName = "VersionsPanel";
