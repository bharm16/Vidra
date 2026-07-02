import { type ReactElement } from "react";
import { cn } from "@utils/cn";
import type { ClipAspect, GalleryClip } from "./clipManifest";

const ASPECT_CLASS: Record<ClipAspect, string> = {
  "16:9": "aspect-video",
  "9:16": "aspect-[9/16]",
  "1:1": "aspect-square",
};

interface ClipGridProps {
  readonly clips: readonly GalleryClip[];
}

/**
 * The gallery landing's populated state: muted looping clip tiles in the
 * monochrome frame treatment — chrome stays neutral (ADR-0008).
 */
export function ClipGrid({ clips }: ClipGridProps): ReactElement {
  return (
    <ul
      data-testid="clip-grid"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {clips.map((clip) => (
        <li key={clip.src}>
          <figure className="border-border bg-surface-1 overflow-hidden rounded-lg border">
            <video
              className={cn("w-full object-cover", ASPECT_CLASS[clip.aspect])}
              src={clip.src}
              poster={clip.poster}
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
            />
            <figcaption className="border-border text-body-sm text-muted border-t px-3 py-2 text-left">
              {clip.caption}
            </figcaption>
          </figure>
        </li>
      ))}
    </ul>
  );
}
