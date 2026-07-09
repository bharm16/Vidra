import React from "react";
import { Link } from "react-router-dom";
import type { PromptHistoryEntry } from "@features/prompt-optimizer";
import { formatRelativeOrDate } from "@features/history/utils/historyDates";
import { resolveEntryTitle } from "@features/history/utils/historyTitles";
import {
  hasVideoArtifact,
  resolveHistoryThumbnail,
} from "@features/history/utils/historyMedia";
import { cn } from "@utils/cn";
import { LibraryThumbnail } from "./LibraryThumbnail";

interface LibraryCardProps {
  entry: PromptHistoryEntry;
}

/**
 * A single Library tile — a cinematic cover with a clip/session badge, the
 * derived title, and a relative timestamp. Same derivation utils as the rail
 * Sessions panel, so the two surfaces cannot drift. Clips (entries carrying a
 * video artifact) get a centered play affordance; sessions do not.
 */
export function LibraryCard({ entry }: LibraryCardProps): React.ReactElement {
  const title = resolveEntryTitle(entry);
  const when = formatRelativeOrDate(entry.timestamp);
  const thumbnail = resolveHistoryThumbnail(entry);
  const isClip = hasVideoArtifact(entry);
  const sessionId =
    typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : null;

  const cover = (
    <div className="relative h-[172px] overflow-hidden rounded-[13px] border border-white/10 shadow-[0_16px_36px_-20px_rgba(0,0,0,0.7)] transition-all duration-200 group-hover:-translate-y-[3px] group-hover:border-white/30 group-hover:shadow-[0_22px_46px_-20px_rgba(0,0,0,0.8)]">
      <LibraryThumbnail thumbnail={thumbnail} label={title} />

      {/* Top scrim so the badge reads over bright frames. */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(10,11,14,0.5),rgba(10,11,14,0)_34%)]" />

      <div
        className={cn(
          "text-foreground absolute left-[10px] top-[9px] flex items-center rounded-md px-2 py-[3px] font-mono text-[10px] backdrop-blur-[4px]",
          isClip ? "bg-black/60" : "bg-white/[0.14]",
        )}
      >
        {isClip ? "clip" : "session"}
      </div>

      {isClip ? (
        <div className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/45 backdrop-blur-[3px]">
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            className="ml-[2px] h-4 w-4 text-white"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      ) : null}
    </div>
  );

  const meta = (
    <>
      <div className="text-foreground mt-2.5 truncate font-sans text-[14px] font-medium">
        {title}
      </div>
      <div className="text-tool-text-muted mt-0.5 font-mono text-[11.5px]">
        {when}
      </div>
    </>
  );

  const cardClass = "group flex flex-col";

  if (!sessionId) {
    return (
      <div className={cardClass}>
        {cover}
        {meta}
      </div>
    );
  }

  return (
    <Link
      to={`/session/${sessionId}`}
      className={cn(cardClass, "cursor-pointer")}
      aria-label={`Open ${isClip ? "clip" : "session"}: ${title}`}
    >
      {cover}
      {meta}
    </Link>
  );
}
