import React, { memo } from "react";
import {
  Copy,
  CopyPlus,
  ExternalLink,
  Pencil,
  RotateCcw,
  Trash2,
} from "@promptstudio/system/components/ui";
import { Button } from "@promptstudio/system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@promptstudio/system/components/ui/dropdown-menu";
import type { PromptHistoryEntry } from "@features/prompt-optimizer";
import { cn } from "@/utils/cn";
import type { PromptRowStage } from "../types";
import { HistoryThumbnail } from "./HistoryThumbnail";

export interface HistoryItemProps {
  entry: PromptHistoryEntry;
  onLoad: (entry: PromptHistoryEntry) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (entry: PromptHistoryEntry) => void;
  onRename?: (entry: PromptHistoryEntry) => void;
  onCopyPrompt?: (entry: PromptHistoryEntry) => void;
  onOpenInNewTab?: (entry: PromptHistoryEntry) => void;
  isSelected?: boolean;
  isExternallyHovered?: boolean;
  title: string;
  meta: string;
  stage: PromptRowStage;
  processingLabel?: string | null;
  thumbnailUrl?: string | null;
  thumbnailStoragePath?: string | null;
  thumbnailAssetId?: string | null;
  versionLabel?: string;
  dataIndex?: number;
}

/**
 * Memoized history item component with delete functionality
 */
export const HistoryItem = memo<HistoryItemProps>(
  ({
    entry,
    onLoad,
    onDelete,
    onDuplicate,
    onRename,
    onCopyPrompt,
    onOpenInNewTab,
    isSelected = false,
    isExternallyHovered = false,
    title,
    meta,
    stage,
    processingLabel = null,
    thumbnailUrl = null,
    thumbnailStoragePath = null,
    thumbnailAssetId = null,
    versionLabel,
    dataIndex,
  }) => {
    const [showDeleteConfirm, setShowDeleteConfirm] =
      React.useState<boolean>(false);
    const [contextOpen, setContextOpen] = React.useState<boolean>(false);
    const contextMenuRef = React.useRef<boolean>(false);

    const statusLabel =
      processingLabel ??
      (stage === "error" ? "Failed" : stage === "draft" ? "Draft" : null);
    const statusTone = processingLabel
      ? "warning"
      : stage === "error"
        ? "error"
        : stage === "draft"
          ? "muted"
          : null;

    const handleDelete = (e: React.MouseEvent): void => {
      e.stopPropagation();
      if (showDeleteConfirm) {
        // Confirmed - actually delete
        if (entry.id) {
          onDelete(entry.id);
        }
        setShowDeleteConfirm(false);
      } else {
        // Show confirmation
        setShowDeleteConfirm(true);
      }
    };

    const handleCancel = (e: React.MouseEvent): void => {
      e.stopPropagation();
      setShowDeleteConfirm(false);
    };

    const handleLoad = (): void => {
      if (!showDeleteConfirm) {
        onLoad(entry);
      }
    };

    const handleRetry = (e: React.MouseEvent): void => {
      e.stopPropagation();
      onLoad(entry);
    };

    const handleContextMenu = (e: React.MouseEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      contextMenuRef.current = true;
      setContextOpen(true);
    };

    const handleMenuOpenChange = (nextOpen: boolean): void => {
      if (nextOpen && !contextMenuRef.current) return;
      setContextOpen(nextOpen);
      if (!nextOpen) {
        contextMenuRef.current = false;
      }
    };

    const handleMenuAction =
      (action?: (entry: PromptHistoryEntry) => void) => (event: Event) => {
        event.preventDefault();
        action?.(entry);
        setContextOpen(false);
      };

    const handleDeleteFromMenu = (): void => {
      setShowDeleteConfirm(true);
    };

    const isHovering = isExternallyHovered;

    return (
      <DropdownMenu open={contextOpen} onOpenChange={handleMenuOpenChange}>
        <li data-history-index={dataIndex}>
          <div
            className="grid gap-2 transition-[grid-template-rows] duration-[180ms] [transition-timing-function:var(--motion-ease-emphasized)]"
            style={{
              gridTemplateRows: showDeleteConfirm ? "0fr 1fr" : "1fr 0fr",
            }}
          >
            <div className="overflow-hidden">
              <div
                className={cn(
                  "transition-[opacity,transform] duration-[180ms] [transition-timing-function:var(--motion-ease-emphasized)]",
                  showDeleteConfirm
                    ? "pointer-events-none -translate-y-1 opacity-0"
                    : "translate-y-0 opacity-100",
                )}
              >
                <div
                  className={cn(
                    "group relative flex h-12 items-center rounded-lg transition-colors",
                    isSelected
                      ? [
                          "bg-[rgb(44,48,55)]",
                          "before:content-[''] before:absolute before:left-0 before:top-1/2 before:h-6 before:w-[3px] before:-translate-y-1/2 before:bg-[rgb(59,130,246)] before:rounded-r-[2px]",
                        ].join(" ")
                      : isHovering
                        ? "bg-[rgb(39,42,55)]"
                        : "bg-transparent",
                  )}
                  data-stage={stage}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      onClick={handleLoad}
                      onContextMenu={handleContextMenu}
                      variant="ghost"
                      className={cn(
                        "flex h-12 w-full min-w-0 items-center text-left",
                        "gap-[10px] px-2 py-[6px] pr-12",
                      )}
                      aria-label={`Load prompt: ${title}`}
                      title={title}
                    >
                      <div>
                        <HistoryThumbnail
                          src={thumbnailUrl}
                          storagePath={thumbnailStoragePath}
                          assetId={thumbnailAssetId}
                          label={title}
                          size="md"
                          variant="muted"
                          isActive={false}
                          className="h-9 w-9 rounded-[6px] border border-[rgb(44,48,55)] bg-[rgb(44,48,55)]"
                        />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        {versionLabel ? (
                          <span className="text-label-10 font-semibold uppercase tracking-widest text-faint">
                            {versionLabel}
                          </span>
                        ) : null}
                        <div className="flex items-start justify-between gap-ps-3">
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                            {title}
                          </span>
                          {statusLabel && statusTone ? (
                            <span
                              className={cn(
                                "rounded-full border px-ps-2 py-0.5 text-label-sm",
                                statusTone === "warning" &&
                                  "border-warning/40 bg-warning/10 text-warning",
                                statusTone === "error" &&
                                  "border-error/40 bg-error/10 text-error",
                                statusTone === "muted" &&
                                  "border-border bg-surface-2 text-muted",
                              )}
                            >
                              {statusLabel}
                            </span>
                          ) : null}
                        </div>
                        <div className="truncate text-[11px] text-[rgb(107,114,128)]">
                          {meta}
                        </div>
                      </div>
                    </Button>
                  </DropdownMenuTrigger>

                  <div
                    className={cn(
                      "absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-2",
                      "transition-[opacity,transform] duration-150 group-hover:opacity-100",
                      "pointer-events-none opacity-0 group-hover:pointer-events-auto",
                    )}
                  >
                    {stage === "error" && (
                      <Button
                        type="button"
                        onClick={handleRetry}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-md border border-border bg-transparent text-faint hover:bg-[rgba(255,255,255,0.06)]"
                        aria-label="Retry"
                        title="Retry"
                      >
                        <RotateCcw className="h-3.5 w-3.5 text-warning" />
                      </Button>
                    )}

                    <Button
                      type="button"
                      onClick={handleDelete}
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-md border border-border bg-transparent text-faint hover:border-error/60 hover:bg-[rgba(255,255,255,0.06)] hover:text-error"
                      aria-label="Delete prompt"
                      title="Delete prompt"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-hidden">
              {showDeleteConfirm ? (
                <div
                  className="motion-presence-panel rounded-lg border border-error/40 bg-error/10 p-ps-4 opacity-100"
                  data-motion-state="entered"
                >
                  <p className="mb-ps-3 text-body text-foreground">
                    Delete this session?
                  </p>
                  <div className="flex gap-ps-3">
                    <Button
                      onClick={handleDelete}
                      size="sm"
                      variant="destructive"
                      className="flex-1"
                    >
                      Delete
                    </Button>
                    <Button
                      onClick={handleCancel}
                      size="sm"
                      variant="secondary"
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </li>

        <DropdownMenuContent
          align="end"
          sideOffset={6}
          className="ps-glass-card border-border/60 text-foreground"
        >
          <DropdownMenuItem
            onSelect={handleMenuAction(onDuplicate)}
            disabled={!onDuplicate}
          >
            <CopyPlus className="h-4 w-4" aria-hidden="true" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={handleMenuAction(onRename)}
            disabled={!onRename}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={handleMenuAction(onCopyPrompt)}
            disabled={!onCopyPrompt}
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copy prompt
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={handleMenuAction(onOpenInNewTab)}
            disabled={!onOpenInNewTab || !entry.uuid}
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Open in new tab
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={handleMenuAction(handleDeleteFromMenu)}
            disabled={!entry.id}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.entry.id === nextProps.entry.id &&
      prevProps.entry.input === nextProps.entry.input &&
      prevProps.entry.score === nextProps.entry.score &&
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.isExternallyHovered === nextProps.isExternallyHovered &&
      prevProps.title === nextProps.title &&
      prevProps.meta === nextProps.meta &&
      prevProps.stage === nextProps.stage &&
      prevProps.processingLabel === nextProps.processingLabel &&
      prevProps.thumbnailUrl === nextProps.thumbnailUrl &&
      prevProps.versionLabel === nextProps.versionLabel
    );
  },
);

HistoryItem.displayName = "HistoryItem";
