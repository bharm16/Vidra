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
import playIcon from "@/assets/design-system/play.svg";

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
    <div className="relative h-[171px] shrink-0 overflow-hidden rounded-card bg-[var(--vidra-stage-placeholder)] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-[0.5px] after:ring-inset after:ring-white after:content-['']">
      <LibraryThumbnail thumbnail={thumbnail} label={title} />

      <div className="text-foreground absolute left-[10px] top-[9px] flex h-5 min-w-[66.41px] items-center rounded-md bg-[var(--vidra-stage-panel)] px-2 font-sans text-meta">
        {isClip ? "clip" : "session"}
      </div>

      {isClip ? (
        <div className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/45 backdrop-blur-[3px]">
          <img src={playIcon} alt="" draggable={false} />
        </div>
      ) : null}
    </div>
  );

  const meta = (
    <>
      <div className="text-foreground h-5 shrink-0 truncate font-sans text-ui font-normal">
        {title}
      </div>
      <div className="text-foreground h-[18px] shrink-0 font-sans text-meta">
        {when}
      </div>
    </>
  );

  const cardClass = "group flex h-[229px] min-w-0 flex-col gap-2 rounded-card";

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
