import React, { useEffect, useMemo, useRef } from "react";
import { cn } from "@/utils/cn";
import { DrawerToggle } from "./components/DrawerToggle";
import { DrawerOverlay } from "./components/DrawerOverlay";
import type { DrawerDisplayMode, DrawerPosition } from "./hooks/useDrawerState";

interface CollapsibleDrawerProps {
  isOpen: boolean;
  onToggle: () => void;
  /** Width for left/right drawers */
  width?: string;
  /** Height for bottom drawer */
  height?: string;
  position?: DrawerPosition;
  /** Collapsed width for left/right drawers */
  collapsedWidth?: string;
  /** Collapsed height for bottom drawer */
  collapsedHeight?: string;
  children: React.ReactNode;
  displayMode?: DrawerDisplayMode;
  showToggle?: boolean;
  toggleLabel?: string;
  className?: string;
}

export function CollapsibleDrawer({
  isOpen,
  onToggle,
  width = "280px",
  height = "200px",
  position = "left",
  collapsedWidth = "48px",
  collapsedHeight = "44px",
  children,
  displayMode = "push",
  showToggle = true,
  toggleLabel,
  className,
}: CollapsibleDrawerProps): React.ReactElement {
  const panelRef = useRef<HTMLDivElement>(null);
  const isOverlay = displayMode !== "push";
  const isFullscreen = displayMode === "fullscreen";
  const isHorizontal = position === "left" || position === "right";
  const isBottom = position === "bottom";

  // Dimensions based on position
  const drawerWidth = isHorizontal ? (isFullscreen ? "100vw" : width) : "100%";
  const drawerHeight = isBottom ? (isFullscreen ? "85vh" : height) : "100%";

  const closedTranslate = useMemo(() => {
    if (isBottom) {
      // For bottom: we no longer "peek" via transform; we actually collapse height.
      // Keep transform neutral so the collapsed bar is fully visible inline.
      return "translate(0, 0)";
    }
    // For left/right: translate horizontally.
    const delta = `(${drawerWidth} - ${collapsedWidth})`;
    return position === "left"
      ? `translateX(calc(-1 * ${delta}))`
      : `translateX(calc(${delta}))`;
  }, [collapsedWidth, drawerWidth, isBottom, position]);

  const wrapperStyle = useMemo(() => {
    if (isBottom) {
      return { height: isOpen ? drawerHeight : collapsedHeight };
    }
    if (isOverlay) {
      return { width: collapsedWidth };
    }
    return { width: isOpen ? drawerWidth : collapsedWidth };
  }, [
    collapsedHeight,
    collapsedWidth,
    drawerHeight,
    drawerWidth,
    isBottom,
    isOpen,
    isOverlay,
  ]);

  useEffect(() => {
    if (!isOpen || !isOverlay) return;
    const panel = panelRef.current;
    if (!panel) return;

    const focusable = panel.querySelectorAll<HTMLElement>(
      'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0] ?? panel;
    const last = focusable[focusable.length - 1] ?? panel;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Tab") return;
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener("keydown", handleKeyDown);
    if (typeof first.focus === "function") {
      first.focus();
    }
    return () => panel.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isOverlay]);

  return (
    <>
      {isOverlay ? <DrawerOverlay isOpen={isOpen} onClick={onToggle} /> : null}
      <div
        className={cn(
          "flex flex-shrink-0",
          isBottom
            ? "w-full min-w-0 overflow-hidden"
            : "h-full min-h-0 overflow-visible",
          isBottom && !isOverlay && "transition-[height] duration-200 ease-out",
          isOverlay && !isBottom && "absolute inset-y-0 z-drawer",
          isOverlay && isBottom && "absolute inset-x-0 bottom-0 z-drawer",
          !isBottom && (position === "left" ? "left-0" : "right-0"),
          className,
        )}
        style={wrapperStyle}
        data-state={isOpen ? "open" : "closed"}
        data-position={position}
      >
        <div
          ref={panelRef}
          className={cn(
            "relative flex overflow-hidden transition-transform duration-200 ease-out",
            // Bottom drawers own their chrome inside children; avoid an extra boxed wrapper.
            isBottom
              ? "bg-transparent border-0"
              : "bg-surface-2 border border-border",
            isBottom ? "h-full w-full flex-row" : "h-full flex-col",
            isOpen && !isBottom && "shadow-lg",
          )}
          style={{
            width: isBottom ? "100%" : drawerWidth,
            height: isBottom ? "100%" : "100%",
            transform: isBottom
              ? "translate(0, 0)"
              : isOpen
                ? "translate(0, 0)"
                : closedTranslate,
          }}
          role={isOverlay ? "dialog" : undefined}
          aria-modal={isOverlay ? true : undefined}
          tabIndex={isOverlay ? -1 : undefined}
        >
          {showToggle && !isBottom ? (
            <div
              className={cn(
                "flex items-center px-2 py-2",
                position === "left" ? "justify-end" : "justify-start",
              )}
            >
              <DrawerToggle
                isOpen={isOpen}
                onToggle={onToggle}
                position={position}
                label={toggleLabel ?? "Toggle drawer"}
              />
            </div>
          ) : null}
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1 overflow-hidden",
              isBottom ? "flex-row" : "flex-col",
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
