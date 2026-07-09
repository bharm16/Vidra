import React from "react";

import { median, updatesPerSecond } from "../hooks/hudMath";
import type { GenerationStats } from "../hooks/generationReducer";

interface LatencyHudProps {
  stats: GenerationStats;
}

function lastOf(values: number[]): number | null {
  const value = values[values.length - 1];
  return value === undefined ? null : value;
}

function ms(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}ms`;
}

function lastAndMedian(values: number[]): string {
  const last = lastOf(values);
  if (last === null) {
    return "—";
  }
  return `${ms(last)} · med ${ms(median(values))}`;
}

/**
 * The spike's verdict instrument: every quantity here is honestly measurable
 * (spec HUD table). Transport is derived: round-trip − model time.
 */
export function LatencyHud({ stats }: LatencyHudProps): React.ReactElement {
  const rate = updatesPerSecond(stats.resultTimes);
  const lastRtt = lastOf(stats.rttMs);
  const lastModel = lastOf(stats.modelMs);
  const transport =
    lastRtt === null || lastModel === null ? null : lastRtt - lastModel;

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px] leading-4 text-white/60">
      <dt>rate</dt>
      <dd>{rate === null ? "—" : `${rate.toFixed(1)}/s`}</dd>
      <dt>round-trip</dt>
      <dd>{lastAndMedian(stats.rttMs)}</dd>
      <dt>model</dt>
      <dd>{lastAndMedian(stats.modelMs)}</dd>
      <dt>transport</dt>
      <dd>{ms(transport)}</dd>
      <dt>encode</dt>
      <dd>{ms(stats.lastEncodeMs)}</dd>
      <dt>frames</dt>
      <dd>
        {stats.sent} sent · {stats.skipped} skipped
      </dd>
      {stats.lastError === null ? null : (
        <>
          <dt className="text-danger">error</dt>
          <dd className="text-danger">{stats.lastError.message}</dd>
        </>
      )}
    </dl>
  );
}
