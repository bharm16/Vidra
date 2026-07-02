import React from "react";
import { Link } from "react-router-dom";
import { Badge, Search, X } from "@promptstudio/system/components/ui";
import { Button } from "@promptstudio/system/components/ui/button";
import { Input } from "@promptstudio/system/components/ui/input";
import { useAuthUser } from "@hooks/useAuthUser";
import { usePromptHistory } from "@hooks/usePromptHistory";
import type { PromptHistoryEntry } from "@features/prompt-optimizer";
import { HistoryThumbnail } from "@features/history/components/HistoryThumbnail";
import { formatRelativeOrDate } from "@features/history/utils/historyDates";
import { resolveEntryTitle } from "@features/history/utils/historyTitles";
import { resolveEntryStage } from "@features/history/utils/historyStages";
import {
  hasVideoArtifact,
  isRecentEntry,
  resolveHistoryThumbnail,
} from "@features/history/utils/historyMedia";
import { cn } from "@utils/cn";

/**
 * Session library — the full-archive presentation of Sessions on its own
 * page. Same entity, titles, thumbnails, and vocabulary as the rail Sessions
 * panel (the quick switcher): entries come from the same usePromptHistory
 * source and the same derivation utils, so the two surfaces cannot drift.
 */

const CHIP_CLASS =
  "h-7 rounded-md border border-border bg-surface-1 px-2.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground";

interface FilterChipProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function FilterChip({
  active,
  onClick,
  children,
}: FilterChipProps): React.ReactElement {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-pressed={active}
      onClick={onClick}
      className={cn(CHIP_CLASS, active && "bg-surface-2 text-foreground")}
    >
      {children}
    </Button>
  );
}

function SessionRow({
  entry,
}: {
  entry: PromptHistoryEntry;
}): React.ReactElement {
  const title = resolveEntryTitle(entry);
  const stage = resolveEntryStage(entry);
  const thumbnail = resolveHistoryThumbnail(entry);
  const when = formatRelativeOrDate(entry.timestamp);
  const sessionId =
    typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : null;

  const body = (
    <>
      <HistoryThumbnail
        src={thumbnail.url}
        storagePath={thumbnail.storagePath ?? null}
        assetId={thumbnail.assetId ?? null}
        label={title}
        size="lg"
        variant="muted"
        className="border-border rounded-md border"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-foreground min-w-0 truncate text-[13px] font-medium">
            {title}
          </span>
          {stage === "draft" ? (
            <Badge variant="subtle" size="sm">
              Draft
            </Badge>
          ) : stage === "error" ? (
            <Badge variant="danger" size="sm">
              Failed
            </Badge>
          ) : null}
        </div>
        <span className="text-faint text-[11px]">{when}</span>
      </div>
    </>
  );

  const rowClass =
    "flex items-center gap-3 rounded-lg border border-border bg-surface-1 p-3 transition-colors";

  if (!sessionId) {
    return <div className={rowClass}>{body}</div>;
  }

  return (
    <Link
      to={`/session/${sessionId}`}
      className={cn(rowClass, "hover:bg-surface-2")}
      aria-label={`Open session: ${title}`}
    >
      {body}
    </Link>
  );
}

export function HistoryPage(): React.ReactElement {
  const user = useAuthUser();
  const promptHistory = usePromptHistory(user);
  const [videosOnly, setVideosOnly] = React.useState<boolean>(false);
  const [recentOnly, setRecentOnly] = React.useState<boolean>(false);

  const searchQuery = promptHistory.searchQuery;

  const sessions = React.useMemo(() => {
    return promptHistory.filteredHistory.filter((entry) => {
      if (videosOnly && !hasVideoArtifact(entry)) return false;
      if (recentOnly && !isRecentEntry(entry)) return false;
      return true;
    });
  }, [promptHistory.filteredHistory, videosOnly, recentOnly]);

  const hasActiveFilters = videosOnly || recentOnly;
  const countNoun = searchQuery
    ? sessions.length === 1
      ? "result"
      : "results"
    : sessions.length === 1
      ? "session"
      : "sessions";

  return (
    <div className="bg-app h-full overflow-y-auto">
      {/* Toolbar — compact, functional */}
      <div className="z-sticky border-border bg-app sticky top-0 border-b px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-foreground text-[15px] font-semibold tracking-tight">
              Sessions
            </h1>
            <div className="flex items-center gap-3">
              <span className="text-muted text-[12px] tabular-nums">
                {sessions.length} {countNoun}
              </span>
              {user ? (
                <Badge variant="success" size="sm">
                  Synced
                </Badge>
              ) : (
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className={CHIP_CLASS}
                >
                  <Link to="/signin?redirect=/history">Sign in to sync</Link>
                </Button>
              )}
              <Link
                to="/"
                className="text-muted hover:text-foreground text-[12px] font-medium transition-colors"
              >
                Back to app
              </Link>
            </div>
          </div>

          <div className="relative">
            <Search
              className="text-faint absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              className="border-border bg-surface-1 text-foreground h-9 w-full rounded-lg pl-9 pr-10 text-sm"
              type="search"
              value={searchQuery}
              onChange={(e) => promptHistory.setSearchQuery(e.target.value)}
              placeholder="Search sessions..."
              aria-label="Search sessions"
            />
            {searchQuery ? (
              <Button
                type="button"
                onClick={() => promptHistory.setSearchQuery("")}
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2 rounded-md p-0"
                aria-label="Clear search"
                title="Clear"
              >
                <X className="text-muted h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            ) : null}
          </div>

          <div className="flex gap-2">
            <FilterChip
              active={videosOnly}
              onClick={() => setVideosOnly((prev) => !prev)}
            >
              Videos only
            </FilterChip>
            <FilterChip
              active={recentOnly}
              onClick={() => setRecentOnly((prev) => !prev)}
            >
              Last 7 days
            </FilterChip>
          </div>
        </div>
      </div>

      {/* Session archive */}
      <div className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        {promptHistory.isLoadingHistory ? (
          <div className="py-12 text-center">
            <div className="ps-spinner-sm mx-auto mb-3" />
            <p className="text-muted text-[13px]">Loading sessions...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <p className="text-muted text-[13px]">
              {searchQuery
                ? `No results for "${searchQuery}".`
                : hasActiveFilters
                  ? "No sessions match these filters."
                  : "No sessions yet."}
            </p>
            {!searchQuery && !hasActiveFilters ? (
              <Button asChild variant="secondary" size="sm">
                <Link to="/">Start creating</Link>
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="flex flex-col gap-2 pt-4">
            {sessions.map((entry, index) => (
              <li
                key={
                  entry.id ??
                  entry.uuid ??
                  `${entry.timestamp ?? "no-ts"}-${index}`
                }
              >
                <SessionRow entry={entry} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
