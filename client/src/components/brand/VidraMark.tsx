/**
 * The Vidra brand mark — the app icon, shared by every surface that signs
 * itself (nav rail, workspace top bar, docs rail, auth stage, shared clip).
 *
 * Served as an <img> from the single asset at `/vidra-mark.svg` rather than
 * inlined: the artwork carries three <linearGradient> defs whose ids would
 * collide the moment the mark renders twice on one page.
 */

import type { ReactElement } from "react";
import { cn } from "@utils/cn";

/** Canonical brand asset — `client/public/vidra-mark.svg`. */
export const VIDRA_MARK_SRC = "/vidra-mark.svg";

export interface VidraMarkProps {
  /**
   * Size and corner radius for this surface's tile, e.g.
   * `"h-[30px] w-[30px] rounded-md"`.
   */
  className?: string;
}

export function VidraMark({ className }: VidraMarkProps): ReactElement {
  return (
    <img
      src={VIDRA_MARK_SRC}
      alt=""
      /* The mark sits inside labeled links, and drag-to-copy would fight the
         canvas surfaces it renders over. */
      draggable={false}
      className={cn("flex-none select-none", className)}
    />
  );
}
