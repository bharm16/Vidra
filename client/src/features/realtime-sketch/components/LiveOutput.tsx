import React from "react";

import { Button } from "@promptstudio/system/components/ui/button";

import { LatencyHud } from "./LatencyHud";
import type {
  ConnectionStatus,
  GenerationStats,
  LiveOutput as LiveOutputState,
} from "../hooks/generationReducer";

/**
 * The live output (CONTEXT.md): the continuously updating generated image.
 * Ephemeral by definition — errors and reconnects never blank it; it only
 * changes when a newer frame succeeds.
 */

interface LiveOutputProps {
  liveOutput: LiveOutputState | null;
  stats: GenerationStats;
  connection: ConnectionStatus;
  onReconnect: () => void;
}

export function LiveOutput({
  liveOutput,
  stats,
  connection,
  onReconnect,
}: LiveOutputProps): React.ReactElement {
  const pill =
    stats.lastError !== null
      ? "error"
      : stats.resultTimes.length > 0
        ? "live"
        : connection;

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2 text-xs">
        <span
          className={`rounded-full px-2 py-0.5 font-mono ${
            pill === "error"
              ? "bg-danger/20 text-danger"
              : pill === "live"
                ? "bg-success/20 text-success"
                : "bg-white/10 text-white/60"
          }`}
        >
          {pill}
        </span>
        {stats.lastError !== null ? (
          <Button
            type="button"
            variant="secondary"
            className="!h-auto rounded px-2 py-1 text-xs"
            onClick={onReconnect}
          >
            Reconnect
          </Button>
        ) : null}
      </div>
      <div className="flex aspect-square w-full max-w-[640px] items-center justify-center overflow-hidden rounded-lg bg-black/40">
        {liveOutput === null ? (
          <p className="px-6 text-center text-sm text-white/40">
            Draw on the sketchpad — the render tracks your strokes.
          </p>
        ) : (
          <img
            src={liveOutput.imageDataUri}
            alt="Live output"
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <LatencyHud stats={stats} />
    </div>
  );
}
