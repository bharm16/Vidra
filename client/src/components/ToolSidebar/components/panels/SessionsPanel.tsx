import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { ArrowLeft, Search } from "@promptstudio/system/components/ui";
import { HistoryEmptyState } from "@components/EmptyState";
import { useToast } from "@components/Toast";
import { modKey } from "@components/KeyboardShortcuts/shortcuts.config";
import { Button } from "@promptstudio/system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@promptstudio/system/components/ui/dialog";
import { Input } from "@promptstudio/system/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@promptstudio/system/components/ui/tooltip";
import type { PromptHistoryEntry } from "@features/prompt-optimizer";
import { cn } from "@utils/cn";
import { HistoryItem } from "@features/history/components/HistoryItem";
import { useSidebarSessionsDomain } from "@/components/ToolSidebar/context";
import { formatRelativeOrDate } from "@features/history/utils/historyDates";
import {
  extractDisambiguator,
  normalizeTitle,
  resolveEntryTitle,
} from "@features/history/utils/historyTitles";
import {
  formatModelLabel,
  normalizeProcessingLabel,
  resolveEntryStage,
} from "@features/history/utils/historyStages";
import {
  hasVideoArtifact,
  isRecentEntry,
  resolveHistoryThumbnail,
} from "@features/history/utils/historyMedia";

const INITIAL_HISTORY_LIMIT = 5;
const EMPTY_HISTORY: PromptHistoryEntry[] = [];

interface SessionsPanelProps {
  history?: PromptHistoryEntry[];
  filteredHistory?: PromptHistoryEntry[];
  isLoading?: boolean;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onBack?: (() => void) | undefined;
  onLoadFromHistory?: (entry: PromptHistoryEntry) => void;
  onCreateNew?: () => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (entry: PromptHistoryEntry) => void;
  onRename?: (entry: PromptHistoryEntry, title: string) => void;
  currentPromptUuid?: string | null;
  currentPromptDocId?: string | null;
  activeStatusLabel?: string;
  activeModelLabel?: string;
}

const noop = (): void => {};
const noopSearch = (_query: string): void => {};
const noopLoad = (_entry: PromptHistoryEntry): void => {};
const noopDelete = (_id: string): void => {};

export function SessionsPanel(props: SessionsPanelProps): ReactElement {
  const domain = useSidebarSessionsDomain();
  const filteredHistory =
    props.filteredHistory ?? domain?.filteredHistory ?? EMPTY_HISTORY;
  const isLoading = props.isLoading ?? domain?.isLoadingHistory ?? false;
  const searchQuery = props.searchQuery ?? domain?.searchQuery ?? "";
  const onSearchChange =
    props.onSearchChange ?? domain?.onSearchChange ?? noopSearch;
  const onBack = props.onBack;
  const onLoadFromHistory =
    props.onLoadFromHistory ?? domain?.onLoadFromHistory ?? noopLoad;
  const onCreateNew = props.onCreateNew ?? domain?.onCreateNew ?? noop;
  const onDelete = props.onDelete ?? domain?.onDelete ?? noopDelete;
  const onDuplicate = props.onDuplicate ?? domain?.onDuplicate;
  const onRename = props.onRename ?? domain?.onRename;
  const currentPromptUuid =
    props.currentPromptUuid ?? domain?.currentPromptUuid;
  const currentPromptDocId =
    props.currentPromptDocId ?? domain?.currentPromptDocId;
  const activeStatusLabel =
    props.activeStatusLabel ?? domain?.activeStatusLabel;
  const activeModelLabel = props.activeModelLabel ?? domain?.activeModelLabel;

  const toast = useToast();
  const [showAllHistory, setShowAllHistory] = useState<boolean>(false);
  const [focusedEntryKey, setFocusedEntryKey] = useState<string | null>(null);
  const [renameEntry, setRenameEntry] = useState<PromptHistoryEntry | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState<string>("");
  const [filterState, setFilterState] = useState<{
    videosOnly: boolean;
    recentOnly: boolean;
  }>({
    videosOnly: false,
    recentOnly: false,
  });
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renameEntry) {
      setRenameValue(resolveEntryTitle(renameEntry));
    }
  }, [renameEntry]);

  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      onSearchChange(event.target.value);
    },
    [onSearchChange],
  );

  const filteredByChips = useMemo(() => {
    return filteredHistory.filter((entry) => {
      if (filterState.videosOnly && !hasVideoArtifact(entry)) {
        return false;
      }
      if (filterState.recentOnly && !isRecentEntry(entry)) {
        return false;
      }
      return true;
    });
  }, [filteredHistory, filterState]);

  const displayedHistory = showAllHistory
    ? filteredByChips
    : filteredByChips.slice(0, INITIAL_HISTORY_LIMIT);
  const hasActiveFilters = filterState.videosOnly || filterState.recentOnly;
  const uniqueDisplayedHistory = useMemo(() => {
    const seenIds = new Set<string>();
    const seenUuids = new Set<string>();

    return displayedHistory.filter((entry) => {
      const normalizedId =
        typeof entry.id === "string" && entry.id.trim()
          ? entry.id.trim()
          : null;
      const normalizedUuid =
        typeof entry.uuid === "string" && entry.uuid.trim()
          ? entry.uuid.trim()
          : null;

      if (
        (normalizedId && seenIds.has(normalizedId)) ||
        (normalizedUuid && seenUuids.has(normalizedUuid))
      ) {
        return false;
      }

      if (normalizedId) {
        seenIds.add(normalizedId);
      }
      if (normalizedUuid) {
        seenUuids.add(normalizedUuid);
      }
      return true;
    });
  }, [displayedHistory]);

  const handleCopyPrompt = useCallback(
    async (entry: PromptHistoryEntry): Promise<void> => {
      const payload = entry.output?.trim() ? entry.output : entry.input;
      if (!payload.trim()) {
        toast.warning("Nothing to copy yet.");
        return;
      }
      if (typeof navigator === "undefined" || !navigator.clipboard) {
        toast.error("Clipboard unavailable.");
        return;
      }
      try {
        await navigator.clipboard.writeText(payload);
        toast.success("Prompt copied to clipboard");
      } catch {
        toast.error("Failed to copy prompt");
      }
    },
    [toast],
  );

  const handleOpenInNewTab = useCallback(
    (entry: PromptHistoryEntry): void => {
      if (!entry.id) {
        toast.warning("This session is not available in a new tab yet.");
        return;
      }
      window.open(`/session/${entry.id}`, "_blank", "noopener,noreferrer");
    },
    [toast],
  );

  const handleRenameRequest = useCallback((entry: PromptHistoryEntry): void => {
    setRenameEntry(entry);
  }, []);

  const handleRenameSubmit = useCallback((): void => {
    if (!renameEntry) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      toast.warning("Title cannot be empty.");
      return;
    }
    onRename?.(renameEntry, trimmed);
    setRenameEntry(null);
  }, [renameEntry, renameValue, onRename, toast]);

  const promptRows = useMemo(() => {
    const baseTitles = uniqueDisplayedHistory.map((entry) =>
      normalizeTitle(resolveEntryTitle(entry)),
    );
    const counts = new Map<string, number>();
    baseTitles.forEach((title) =>
      counts.set(title, (counts.get(title) ?? 0) + 1),
    );
    const seen = new Map<string, number>();

    return uniqueDisplayedHistory.map((entry, index) => {
      const stage = resolveEntryStage(entry);
      const baseTitle = baseTitles[index] ?? "Untitled";
      const hasDupes = (counts.get(baseTitle) ?? 0) > 1;
      const nextSeen = (seen.get(baseTitle) ?? 0) + 1;
      seen.set(baseTitle, nextSeen);

      const isSelected = Boolean(
        (currentPromptUuid && entry.uuid === currentPromptUuid) ||
          (currentPromptDocId && entry.id === currentPromptDocId),
      );

      const dateLabel = formatRelativeOrDate(entry.timestamp);
      const fallbackModelLabel =
        isSelected && typeof activeModelLabel === "string"
          ? formatModelLabel(activeModelLabel)
          : null;
      const modelLabel =
        formatModelLabel(
          typeof entry.targetModel === "string" ? entry.targetModel : null,
        ) ?? fallbackModelLabel;

      const normalizedActiveStatus =
        typeof activeStatusLabel === "string" && activeStatusLabel.trim()
          ? activeStatusLabel
          : "";
      const normalizedProcessingStatus =
        normalizedActiveStatus === "Optimizing"
          ? "Refining"
          : normalizedActiveStatus;
      const processingLabel =
        isSelected && normalizedProcessingStatus
          ? normalizeProcessingLabel(normalizedProcessingStatus)
          : null;
      const effectiveProcessingLabel =
        isSelected &&
        (normalizedActiveStatus === "Refining" ||
          normalizedActiveStatus === "Optimizing")
          ? processingLabel
          : null;

      const meta = dateLabel;

      const disambiguator =
        extractDisambiguator(entry.input, baseTitle) ??
        (() => {
          const model =
            formatModelLabel(
              typeof entry.targetModel === "string" ? entry.targetModel : null,
            ) ?? modelLabel;
          if (!model) return null;
          return nextSeen === 1 ? model : `alt ${nextSeen}`;
        })() ??
        `alt ${nextSeen}`;

      const title = hasDupes ? `${baseTitle} - ${disambiguator}` : baseTitle;
      const key = entry.id ?? entry.uuid ?? `${entry.timestamp ?? ""}-${title}`;

      const thumbnail = resolveHistoryThumbnail(entry);

      return {
        entry,
        stage,
        title,
        meta,
        isSelected,
        processingLabel: effectiveProcessingLabel,
        key,
        thumbnailUrl: thumbnail.url,
        thumbnailStoragePath: thumbnail.storagePath ?? null,
        thumbnailAssetId: thumbnail.assetId ?? null,
      };
    });
  }, [
    uniqueDisplayedHistory,
    currentPromptUuid,
    currentPromptDocId,
    activeStatusLabel,
    activeModelLabel,
  ]);

  const rowByKey = useMemo(() => {
    return new Map(promptRows.map((row) => [row.key, row]));
  }, [promptRows]);

  useEffect(() => {
    setFocusedEntryKey(null);
  }, [filteredByChips.length]);

  useEffect(() => {
    if (renameEntry) return;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (event.key === "/") {
        if (isTypingTarget) return;
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (isTypingTarget) return;

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (promptRows.length === 0) return;

        const selectedKey =
          promptRows.find((row) => row.isSelected)?.key ?? null;
        const currentKey =
          focusedEntryKey ?? selectedKey ?? promptRows[0]?.key ?? null;
        const currentIndex = currentKey
          ? promptRows.findIndex((row) => row.key === currentKey)
          : 0;
        const safeIndex = currentIndex >= 0 ? currentIndex : 0;
        const nextIndex =
          event.key === "ArrowDown"
            ? Math.min(promptRows.length - 1, safeIndex + 1)
            : Math.max(0, safeIndex - 1);
        const nextKey = promptRows[nextIndex]?.key ?? null;

        if (nextKey) {
          setFocusedEntryKey(nextKey);
          const targetNode = document.querySelector(
            `[data-history-index="${nextIndex}"]`,
          );
          if (targetNode instanceof HTMLElement) {
            targetNode.scrollIntoView({ block: "nearest" });
          }
        }
      }

      if (event.key === "Enter") {
        const selectedKey =
          focusedEntryKey ??
          promptRows.find((row) => row.isSelected)?.key ??
          null;
        if (!selectedKey) return;
        const row = rowByKey.get(selectedKey);
        if (row) {
          onLoadFromHistory(row.entry);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [renameEntry, promptRows, focusedEntryKey, rowByKey, onLoadFromHistory]);

  const duplicateProps =
    typeof onDuplicate === "function" ? { onDuplicate } : {};
  const renameProps =
    typeof onRename === "function" ? { onRename: handleRenameRequest } : {};

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="h-12 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="w-7 h-7 -ml-1 rounded-md flex items-center justify-center text-ghost hover:bg-surface-1"
              onClick={onBack}
              aria-label="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h2 className="text-sm font-semibold text-white">Sessions</h2>
          </div>
          <TooltipProvider delayDuration={120}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={onCreateNew}
                  className="h-7 px-2.5 bg-surface-2 rounded-md text-xs font-medium text-ghost"
                  variant="ghost"
                  size="sm"
                >
                  + New
                </Button>
              </TooltipTrigger>
              <TooltipContent
                className={cn(
                  "text-body-sm text-foreground",
                  "rounded-lg border border-[rgb(67,70,81)] bg-[rgb(24,25,28)]",
                  "shadow-[0_4px_12px_rgba(0,0,0,0.4)]",
                )}
              >
                New prompt ({modKey === "Cmd" ? "Cmd+N" : "Ctrl+N"})
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="px-4 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tool-text-placeholder" />
            <Input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search..."
              aria-label="Search sessions"
              className={cn(
                "w-full h-9 pl-9 pr-3 rounded-lg",
                "bg-tool-nav-active border border-tool-border-dark",
                "text-sm text-white placeholder:text-tool-text-placeholder",
              )}
            />
          </div>
        </div>

        <div className="px-4 py-2 flex gap-2">
          <button
            type="button"
            className={cn(
              "h-7 px-2.5 rounded-md border border-tool-border-primary bg-tool-nav-active text-xs font-medium text-ghost",
              "transition-colors hover:bg-surface-2 hover:text-white",
              filterState.videosOnly && "bg-surface-2 text-white",
            )}
            onClick={() =>
              setFilterState((prev) => ({
                ...prev,
                videosOnly: !prev.videosOnly,
              }))
            }
          >
            Videos only
          </button>
          <button
            type="button"
            className={cn(
              "h-7 px-2.5 rounded-md border border-tool-border-primary bg-tool-nav-active text-xs font-medium text-ghost",
              "transition-colors hover:bg-surface-2 hover:text-white",
              filterState.recentOnly && "bg-surface-2 text-white",
            )}
            onClick={() =>
              setFilterState((prev) => ({
                ...prev,
                recentOnly: !prev.recentOnly,
              }))
            }
          >
            Last 7 days
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {isLoading ? (
            <div className="text-label-sm text-tool-text-placeholder flex flex-col items-center gap-2 py-6 text-center">
              <div className="ps-spinner-sm" />
              <p>Loading...</p>
            </div>
          ) : filteredByChips.length === 0 ? (
            searchQuery ? (
              <div className="text-label-sm text-tool-text-placeholder py-6 text-center">
                <p>No results for &quot;{searchQuery}&quot;.</p>
              </div>
            ) : hasActiveFilters ? (
              <div className="text-label-sm text-tool-text-placeholder py-6 text-center">
                <p>No prompts match these filters.</p>
              </div>
            ) : (
              <HistoryEmptyState onCreateNew={onCreateNew} />
            )
          ) : (
            <>
              <nav
                aria-label="Sessions list"
                className="ps-scrollbar-thin flex-1 overflow-y-auto"
              >
                <ul className="flex flex-col gap-2">
                  {promptRows.map(
                    (
                      {
                        entry,
                        title,
                        meta,
                        stage,
                        isSelected,
                        processingLabel,
                        key,
                        thumbnailUrl,
                        thumbnailStoragePath,
                        thumbnailAssetId,
                      },
                      index,
                    ) => {
                      const externalHover =
                        focusedEntryKey !== null &&
                        (entry.id === focusedEntryKey ||
                          entry.uuid === focusedEntryKey ||
                          key === focusedEntryKey);
                      return (
                        <HistoryItem
                          key={key}
                          entry={entry}
                          onLoad={onLoadFromHistory}
                          onDelete={onDelete}
                          isSelected={isSelected}
                          isExternallyHovered={externalHover}
                          title={title}
                          meta={meta}
                          stage={stage}
                          processingLabel={processingLabel}
                          thumbnailUrl={thumbnailUrl}
                          thumbnailStoragePath={thumbnailStoragePath}
                          thumbnailAssetId={thumbnailAssetId}
                          onCopyPrompt={handleCopyPrompt}
                          onOpenInNewTab={handleOpenInNewTab}
                          dataIndex={index}
                          {...duplicateProps}
                          {...renameProps}
                        />
                      );
                    },
                  )}
                </ul>
              </nav>
              {filteredByChips.length > INITIAL_HISTORY_LIMIT && (
                <Button
                  onClick={() => setShowAllHistory(!showAllHistory)}
                  variant="ghost"
                  size="sm"
                  className="text-label-sm text-tool-text-placeholder w-full justify-start"
                >
                  {showAllHistory ? "See less" : "See more..."}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <Dialog
        open={Boolean(renameEntry)}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setRenameEntry(null);
          }
        }}
      >
        <DialogContent className="ps-card-glass p-ps-5 max-w-sm rounded-xl shadow-lg">
          <DialogHeader>
            <DialogTitle className="text-body-lg text-foreground">
              Rename prompt
            </DialogTitle>
            <DialogDescription className="text-body-sm text-muted">
              Give this prompt a short, memorable title.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setRenameValue(event.target.value)
            }
            placeholder="Prompt title"
            className="mt-ps-2"
            onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleRenameSubmit();
              }
            }}
          />
          <DialogFooter className="mt-ps-4 gap-ps-2 flex sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRenameEntry(null)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleRenameSubmit}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
