import React from "react";

import { LiveOutput } from "./components/LiveOutput";
import { SketchControls } from "./components/SketchControls";
import { Sketchpad } from "./components/Sketchpad";
import { useRealtimeSketch } from "./hooks/useRealtimeSketch";
import type { ConnectRealtimeSketch } from "./api/falRealtime";

/**
 * The realtime sketch spike surface (/sketch — outside the page's anatomy,
 * spec: docs/superpowers/specs/2026-07-09-realtime-sketch-spike-design.md).
 * Two panes: the sketchpad and the live output, with the latency HUD as the
 * verdict instrument.
 */

interface RealtimeSketchProps {
  connectFn?: ConnectRealtimeSketch;
}

export function RealtimeSketch({
  connectFn,
}: RealtimeSketchProps): React.ReactElement {
  const sketch = useRealtimeSketch(connectFn ? { connectFn } : undefined);

  return (
    <div className="bg-app text-foreground flex min-h-screen flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-medium tracking-wide text-white/90">
          Realtime sketch
        </h1>
        <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white/50">
          spike
        </span>
        <SketchControls
          settings={sketch.settings}
          updateSettings={sketch.updateSettings}
          rerollSeed={sketch.rerollSeed}
        />
      </header>
      <main className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-2">
        <Sketchpad onSnapshot={sketch.captureSnapshot} />
        <LiveOutput
          liveOutput={sketch.state.liveOutput}
          stats={sketch.state.stats}
          connection={sketch.state.connection}
          onReconnect={sketch.reconnect}
        />
      </main>
    </div>
  );
}

export default RealtimeSketch;
