import React from "react";

import { Button } from "@promptstudio/system/components/ui/button";

import { STEP_OPTIONS, effectiveSteps } from "../config/constants";
import type { SketchSettings } from "../hooks/useRealtimeSketch";

interface SketchControlsProps {
  settings: SketchSettings;
  updateSettings: (patch: Partial<SketchSettings>) => void;
  rerollSeed: () => void;
}

function snapStrength(strength: number, steps: number): number {
  return Math.min(1, Math.max(0, Math.round(strength * steps) / steps));
}

export function SketchControls({
  settings,
  updateSettings,
  rerollSeed,
}: SketchControlsProps): React.ReactElement {
  const denoise = effectiveSteps(settings.strength, settings.steps);

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-white/70">
      <input
        type="text"
        aria-label="Prompt"
        className="min-w-[280px] flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 outline-none focus:border-white/30"
        value={settings.prompt}
        onChange={(event) => updateSettings({ prompt: event.target.value })}
      />

      <label className="flex items-center gap-2">
        <span>strength</span>
        <input
          type="range"
          min={0}
          max={1}
          step={1 / settings.steps}
          value={settings.strength}
          onChange={(event) =>
            updateSettings({
              strength: snapStrength(
                Number(event.target.value),
                settings.steps,
              ),
            })
          }
        />
        <span className="font-mono">
          {settings.strength.toFixed(3)} → {denoise}/{settings.steps} steps
        </span>
      </label>

      <div className="flex items-center gap-1">
        {STEP_OPTIONS.map((option) => (
          <Button
            key={option}
            type="button"
            variant="ghost"
            className={`!h-auto rounded px-2 py-1 text-xs ${
              settings.steps === option
                ? "bg-white/20 text-white"
                : "bg-white/5 hover:bg-white/10"
            }`}
            onClick={() =>
              updateSettings({
                steps: option,
                strength: snapStrength(settings.strength, option),
              })
            }
          >
            {option} steps
          </Button>
        ))}
      </div>

      <Button
        type="button"
        variant="ghost"
        className="!h-auto rounded bg-white/5 px-2 py-1 font-mono text-xs hover:bg-white/10"
        onClick={rerollSeed}
        title="Pinned seed keeps the output stable while you draw; reroll for a different interpretation"
      >
        seed {settings.seed} ↻
      </Button>
    </div>
  );
}
