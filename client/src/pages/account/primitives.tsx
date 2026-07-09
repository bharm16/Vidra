import React from "react";

import { cn } from "@/utils/cn";

import { PLACEHOLDER_AXIS_LABELS, usageBarBackground } from "./constants";

/**
 * Shared presentational primitives for the Account page. The canonical glass
 * panel, the mono eyebrow label, a stat tile, and the accent bar chart — the
 * repeated pieces of the design handoff's account surface.
 */

/** The canonical glass panel from the design foundation (ADR-0014). */
export function AccountCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      className={cn(
        "rounded-[16px] border border-white/[0.10] bg-white/[0.045] backdrop-blur-[16px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Mono uppercase overline used for card labels and section eyebrows. */
export function Eyebrow({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      className={cn(
        "text-tool-text-muted font-mono text-[12px] uppercase tracking-[0.08em]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A compact metric tile: a big number over a muted label. */
export function StatCard({
  value,
  label,
}: {
  value: string;
  label: string;
}): React.ReactElement {
  return (
    <AccountCard className="flex-1 rounded-[13px] px-[18px] py-4">
      <div className="text-foreground text-[22px] font-semibold">{value}</div>
      <div className="text-tool-text-muted mt-1 text-[12px]">{label}</div>
    </AccountCard>
  );
}

/**
 * The accent bar chart. Heights are percentages of the container; the peak bar
 * renders solid accent, the rest fade by height. Presentational only.
 */
export function UsageBars({
  heights,
  peakIndex,
  className,
}: {
  heights: readonly number[];
  peakIndex: number;
  className?: string;
}): React.ReactElement {
  return (
    <div aria-hidden className={cn("flex items-end gap-[5px]", className)}>
      {heights.map((height, index) => (
        <div
          key={index}
          className="flex-1 rounded-t-[3px]"
          style={{
            height: `${height}%`,
            background: usageBarBackground(height, index === peakIndex),
          }}
        />
      ))}
    </div>
  );
}

/** The three-tick date axis beneath a usage chart. */
export function ChartAxis({
  className,
}: {
  className?: string;
}): React.ReactElement {
  return (
    <div
      className={cn(
        "text-tool-text-subdued flex justify-between font-mono text-[10px]",
        className,
      )}
    >
      {PLACEHOLDER_AXIS_LABELS.map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  );
}
