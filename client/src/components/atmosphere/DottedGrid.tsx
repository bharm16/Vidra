import React from "react";

import { cn } from "@/utils/cn";

import "./atmosphere.css";

export interface DottedGridProps {
  className?: string;
}

/**
 * Dotted-grid canvas texture — the workspace's spatial backdrop (a faint 24px
 * dot lattice). A transparent full-bleed overlay, so it layers over whatever
 * canvas background sits beneath. Not used on the empty state; part of the
 * shared atmosphere set for the workspace rebuild.
 */
export function DottedGrid({ className }: DottedGridProps): React.ReactElement {
  return <div aria-hidden className={cn("ps-dotgrid", className)} />;
}
