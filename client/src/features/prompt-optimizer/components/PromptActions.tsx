import { memo, useRef, useEffect } from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowSquareOut,
  Check,
  Copy,
  Download,
  FileText,
  Icon,
  Share,
} from "@promptstudio/system/components/ui";
import type { FloatingToolbarProps } from "../types";
import { usePromptConfig } from "../context/PromptStateContext";
import { AI_MODEL_IDS, AI_MODEL_LABELS, AI_MODEL_URLS } from "./constants";
import { cn } from "@/utils/cn";

/**
 * Prompt Actions Component
 * Displays action buttons below the prompt content, aligned to the right
 * Similar to Claude and other chat apps
 */
export const PromptActions = memo<FloatingToolbarProps>(
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
    primaryVisible = true,
  }): React.ReactElement => {
    const exportMenuRef = useRef<HTMLDivElement>(null);
    const { selectedModel } = usePromptConfig();
    const selectedModelId =
      AI_MODEL_IDS.find((modelId) => modelId === selectedModel) ?? null;

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent): void => {
        if (
          exportMenuRef.current &&
          !exportMenuRef.current.contains(event.target as Node)
        ) {
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

    const handleGenerateWithSelectedModel = (): void => {
      if (!selectedModelId) {
        return;
      }

      onCopy();
      window.open(
        AI_MODEL_URLS[selectedModelId],
        "_blank",
        "noopener,noreferrer",
      );
      onToggleExportMenu(false);
    };

    const generateButtonLabel = selectedModelId
      ? `Generate with ${AI_MODEL_LABELS[selectedModelId]}`
      : "Generate with model";
    const generateButtonTitle = selectedModelId
      ? `Generate with ${AI_MODEL_LABELS[selectedModelId]}`
      : "Select a model to generate";

    return (
      <div className="flex flex-nowrap items-center justify-end overflow-x-auto max-w-full gap-2">
        {/* Primary action(s) - only when hovering editor or when there is an active selection */}
        {primaryVisible && (
          <>
            <Button
              onClick={onCopy}
              variant="ghost"
              className={cn(
                "gap-2 bg-surface-2 text-muted transition-colors hover:bg-surface-3",
                copied && "bg-info-50 text-accent hover:bg-info-100",
              )}
              aria-label={copied ? "Prompt copied" : "Copy prompt"}
              title="Copy"
            >
              {copied ? (
                <Icon icon={Check} size="sm" weight="bold" aria-hidden="true" />
              ) : (
                <Icon icon={Copy} size="sm" weight="bold" aria-hidden="true" />
              )}
              <span className="text-body-sm font-medium">
                {copied ? "Copied" : "Copy"}
              </span>
            </Button>

            <Button
              onClick={handleGenerateWithSelectedModel}
              variant="ghost"
              className="gap-2 bg-surface-2 text-muted transition-colors hover:bg-surface-3"
              aria-label={generateButtonLabel}
              title={generateButtonTitle}
              disabled={!selectedModelId}
            >
              <Icon
                icon={ArrowSquareOut}
                size="sm"
                weight="bold"
                aria-hidden="true"
              />
              <span className="text-body-sm font-medium">
                {generateButtonLabel}
              </span>
            </Button>
          </>
        )}

        <Button
          onClick={onShare}
          size="icon"
          variant="ghost"
          className={cn(
            "bg-surface-2 text-muted transition-colors hover:bg-surface-3",
            shared && "bg-info-50 text-accent hover:bg-info-100",
          )}
          aria-label={shared ? "Link copied" : "Share prompt"}
          title="Share"
        >
          {shared ? (
            <Icon icon={Check} size="xs" weight="bold" aria-hidden="true" />
          ) : (
            <Icon icon={Share} size="xs" weight="bold" aria-hidden="true" />
          )}
        </Button>

        <div className="relative" ref={exportMenuRef}>
          <Button
            onClick={() => onToggleExportMenu(!showExportMenu)}
            size="icon"
            variant="ghost"
            className="bg-surface-2 text-muted transition-colors hover:bg-surface-3"
            aria-expanded={showExportMenu}
            title="Export"
          >
            <Icon icon={Download} size="xs" weight="bold" aria-hidden="true" />
          </Button>
          {showExportMenu && (
            <div className="absolute bottom-full right-0 mb-2 w-36 bg-app border border-border rounded-lg shadow-md py-1 z-dropdown">
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

        <div className="mx-1 h-5 w-px bg-border" />

        <Button
          onClick={onUndo}
          disabled={!canUndo}
          size="icon"
          variant="ghost"
          className="bg-surface-2 text-muted transition-colors hover:bg-surface-3"
          title="Undo"
        >
          <Icon
            icon={ArrowCounterClockwise}
            size="xs"
            weight="bold"
            aria-hidden="true"
          />
        </Button>
        <Button
          onClick={onRedo}
          disabled={!canRedo}
          size="icon"
          variant="ghost"
          className="bg-surface-2 text-muted transition-colors hover:bg-surface-3"
          title="Redo"
        >
          <Icon
            icon={ArrowClockwise}
            size="xs"
            weight="bold"
            aria-hidden="true"
          />
        </Button>
      </div>
    );
  },
);

PromptActions.displayName = "PromptActions";
