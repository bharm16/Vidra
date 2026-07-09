import React from "react";
import { Link } from "react-router-dom";
import { Image, Search } from "@promptstudio/system/components/ui";
import { Button } from "@promptstudio/system/components/ui/button";
import { AmbientLight, Grain } from "@/components/atmosphere";
import { useAuthUser } from "@hooks/useAuthUser";
import { usePromptHistory } from "@hooks/usePromptHistory";
import { hasVideoArtifact } from "@features/history/utils/historyMedia";
import { LibraryCard } from "./library/LibraryCard";
import { LibraryFilterChip } from "./library/LibraryFilterChip";

/**
 * Library — the full archive of the user's Sessions and Kept clips, presented
 * as cinematic cards on the design-handoff atmosphere (ADR-0014). Entries come
 * from the same usePromptHistory source and derivation utils as the rail
 * Sessions panel, so the two surfaces cannot drift; this screen restyles that
 * data to the handoff and keeps the real wiring (search, links, load states).
 *
 * The persistent nav rail is built separately and will wrap this page — this
 * component owns the page content (header, filters, grid), not app-level nav.
 */

type LibraryFilter = "all" | "sessions" | "clips";

const GRID_CLASS =
  "grid grid-cols-2 gap-x-5 gap-y-[22px] sm:grid-cols-3 lg:grid-cols-4";

export function HistoryPage(): React.ReactElement {
  const user = useAuthUser();
  const promptHistory = usePromptHistory(user);
  const [filter, setFilter] = React.useState<LibraryFilter>("all");

  const searchQuery = promptHistory.searchQuery;

  const entries = React.useMemo(() => {
    return promptHistory.filteredHistory.filter((entry) => {
      if (filter === "all") return true;
      const isClip = hasVideoArtifact(entry);
      return filter === "clips" ? isClip : !isClip;
    });
  }, [promptHistory.filteredHistory, filter]);

  const emptyMessage = searchQuery
    ? `No results for "${searchQuery}".`
    : filter === "clips"
      ? "No kept clips yet."
      : filter === "sessions"
        ? "No sessions yet."
        : "Your library is empty.";
  const showStartCta = !searchQuery && filter === "all";

  return (
    <div className="text-foreground relative isolate flex h-full flex-col overflow-hidden [background:var(--ps-bg)]">
      {/* Design-handoff atmosphere — ambient bloom + filmic grain sit behind the
          content (negative z, inside this isolated root). */}
      <AmbientLight />
      <Grain />

      {/* Header — title, search pill, filter chips. */}
      <header className="flex-none px-9 pb-[18px] pt-[30px]">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-foreground font-sans text-[27px] font-semibold tracking-[-0.015em]">
            Library
          </h1>
          <div className="flex w-[264px] items-center gap-[9px] rounded-full border border-white/[0.12] bg-white/[0.04] px-[15px] py-[9px]">
            <Search
              className="text-tool-text-muted h-[15px] w-[15px] shrink-0"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) =>
                promptHistory.setSearchQuery(event.target.value)
              }
              placeholder="Search your work"
              aria-label="Search your library"
              className="placeholder:text-tool-text-muted text-foreground w-full bg-transparent font-sans text-[13px] leading-none outline-none"
            />
          </div>
        </div>

        <div className="mt-[18px] flex gap-[9px]">
          <LibraryFilterChip
            active={filter === "all"}
            onClick={() => setFilter("all")}
          >
            All
          </LibraryFilterChip>
          <LibraryFilterChip
            active={filter === "sessions"}
            onClick={() => setFilter("sessions")}
          >
            Sessions
          </LibraryFilterChip>
          <LibraryFilterChip
            active={filter === "clips"}
            onClick={() => setFilter("clips")}
          >
            Kept clips
          </LibraryFilterChip>
        </div>
      </header>

      {/* Grid — the scrolling archive. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-9 pb-[34px] pt-[6px]">
        {promptHistory.isLoadingHistory ? (
          <div className={GRID_CLASS} aria-hidden="true">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="flex flex-col">
                <div className="h-[172px] animate-pulse rounded-[13px] border border-white/10 bg-white/[0.04]" />
                <div className="mt-2.5 h-3 w-3/4 animate-pulse rounded bg-white/[0.06]" />
                <div className="mt-2 h-2.5 w-1/3 animate-pulse rounded bg-white/[0.04]" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
              <Image
                className="text-tool-text-label h-6 w-6"
                aria-hidden="true"
              />
            </div>
            <p className="text-tool-text-muted font-sans text-[13px]">
              {emptyMessage}
            </p>
            {showStartCta ? (
              <Button asChild variant="secondary" size="sm">
                <Link to="/">Start creating</Link>
              </Button>
            ) : null}
          </div>
        ) : (
          <div className={GRID_CLASS}>
            {entries.map((entry, index) => (
              <LibraryCard
                key={
                  entry.id ??
                  entry.uuid ??
                  `${entry.timestamp ?? "no-ts"}-${index}`
                }
                entry={entry}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
