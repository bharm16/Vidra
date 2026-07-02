import { memo, useRef, useEffect } from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Check,
  Copy,
  Download,
  FileText,
  Icon,
  Info,
  Plus,
  Share,
} from "@promptstudio/system/components/ui";
import type { FloatingToolbarProps } from "../types";

/**
 * Toolbar Component (Fixed Header)
 * Provides actions for copy, export, share, undo/redo, and create new
 * Now displayed as a fixed header at the top of the canvas
 */
export const FloatingToolbar = memo<FloatingToolbarProps>(
  ({
    onCopy,
    onExport,
    onCreateNew,
    onShare,
    copied,
    shared,
    showExportMenu,
    onToggleExportMenu,
    showLegend,
    onToggleLegend,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
  }): React.ReactElement => {
    const exportMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent): void => {
        const target = event.target;
        if (!target || !(target instanceof Node)) return;
        if (exportMenuRef.current && !exportMenuRef.current.contains(target)) {
          onToggleExportMenu(false);
        }
      };

      if (showExportMenu) {
        document.addEventListener("mousedown", handleClickOutside);
        return () =>
          document.removeEventListener("mousedown", handleClickOutside);
      }
      return undefined;
    }, [showExportMenu, onToggleExportMenu]);

    return (
      <div className="w-full flex items-center justify-between px-4 py-2 ps-glass-card rounded-lg">
        <div className="flex items-center gap-1">
          <Button
            onClick={onCopy}
            variant="ghost"
            className={`gap-2 px-3 py-1 text-button-12 rounded-md transition-colors ${
              copied
                ? "text-green-700 bg-green-50"
                : "text-foreground hover:bg-surface-1"
            }`}
            aria-label={copied ? "Prompt copied" : "Copy prompt"}
            title="Copy"
          >
            {copied ? (
              <Icon icon={Check} size="sm" weight="bold" aria-hidden="true" />
            ) : (
              <Icon icon={Copy} size="sm" weight="bold" aria-hidden="true" />
            )}
            {copied && <span className="text-label-12">Copied</span>}
          </Button>

          <Button
            onClick={onShare}
            variant="ghost"
            className={`gap-2 px-3 py-1 text-button-12 rounded-md transition-colors ${
              shared
                ? "text-green-700 bg-green-50"
                : "text-foreground hover:bg-surface-1"
            }`}
            aria-label={shared ? "Link copied" : "Share prompt"}
            title="Share"
          >
            {shared ? (
              <Icon icon={Check} size="sm" weight="bold" aria-hidden="true" />
            ) : (
              <Icon icon={Share} size="sm" weight="bold" aria-hidden="true" />
            )}
            {shared && <span className="text-label-12">Shared!</span>}
          </Button>

          <Button
            onClick={() => onToggleLegend(!showLegend)}
            variant="ghost"
            className={`gap-2 px-3 py-1 text-button-12 rounded-md transition-colors ${
              showLegend
                ? "text-blue-700 bg-blue-50"
                : "text-foreground hover:bg-surface-1"
            }`}
            aria-label="Toggle highlight legend"
            title="Highlight Legend"
          >
            <Icon icon={Info} size="sm" weight="bold" aria-hidden="true" />
          </Button>

          <div className="relative" ref={exportMenuRef}>
            <Button
              onClick={() => onToggleExportMenu(!showExportMenu)}
              variant="ghost"
              className="gap-2 px-3 py-1 text-button-12 text-foreground rounded-md transition-colors hover:bg-surface-1"
              aria-expanded={showExportMenu}
              title="Export"
            >
              <Icon
                icon={Download}
                size="sm"
                weight="bold"
                aria-hidden="true"
              />
            </Button>
            {showExportMenu && (
              <div className="absolute top-full left-0 mt-2 w-36 ps-glass-card rounded-lg py-1 z-dropdown">
                <Button
                  onClick={() => onExport("text")}
                  variant="ghost"
                  className="w-full justify-start gap-2 px-3 py-2 text-label-12 text-foreground transition-colors hover:bg-surface-1"
                >
                  <Icon
                    icon={FileText}
                    size="sm"
                    weight="bold"
                    aria-hidden="true"
                  />
                  Text (.txt)
                </Button>
                <Button
                  onClick={() => onExport("markdown")}
                  variant="ghost"
                  className="w-full justify-start gap-2 px-3 py-2 text-label-12 text-foreground transition-colors hover:bg-surface-1"
                >
                  <Icon
                    icon={FileText}
                    size="sm"
                    weight="bold"
                    aria-hidden="true"
                  />
                  Markdown (.md)
                </Button>
                <Button
                  onClick={() => onExport("json")}
                  variant="ghost"
                  className="w-full justify-start gap-2 px-3 py-2 text-label-12 text-foreground transition-colors hover:bg-surface-1"
                >
                  <Icon
                    icon={FileText}
                    size="sm"
                    weight="bold"
                    aria-hidden="true"
                  />
                  JSON (.json)
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            onClick={onUndo}
            disabled={!canUndo}
            variant="ghost"
            size="icon"
            className={`border border-border p-1 rounded-md transition ${
              canUndo
                ? "hover:bg-surface-1 text-foreground"
                : "text-faint cursor-not-allowed"
            }`}
            title="Undo"
          >
            <Icon
              icon={ArrowCounterClockwise}
              size="sm"
              weight="bold"
              aria-hidden="true"
            />
          </Button>
          <Button
            onClick={onRedo}
            disabled={!canRedo}
            variant="ghost"
            size="icon"
            className={`border border-border p-1 rounded-md transition ${
              canRedo
                ? "hover:bg-surface-1 text-foreground"
                : "text-faint cursor-not-allowed"
            }`}
            title="Redo"
          >
            <Icon
              icon={ArrowClockwise}
              size="sm"
              weight="bold"
              aria-hidden="true"
            />
          </Button>
          <Button
            onClick={onCreateNew}
            variant="ghost"
            className="gap-2 px-3 py-1 text-button-12 text-foreground border border-border bg-transparent rounded-md transition-colors hover:bg-surface-1"
            title="New prompt"
          >
            <Icon icon={Plus} size="sm" weight="bold" aria-hidden="true" />
            <span className="text-label-12">New</span>
          </Button>
        </div>
      </div>
    );
  },
);

FloatingToolbar.displayName = "FloatingToolbar";
