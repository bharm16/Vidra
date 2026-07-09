import React from "react";

import { Button } from "@promptstudio/system/components/ui/button";

import { effectiveSteps } from "../config/constants";
import type { SketchSettings } from "../hooks/useRealtimeSketch";

/**
 * Floating composer (design_handoff_live_editor): prompt row + labeled
 * chips. The mode chip's thumbnail is the latest generated frame, live.
 * Strength opens a popover slider snapped to the 1/steps grid; steps click
 * toggles 4 ⇄ 8 (re-snapping strength so it stays on the grid).
 */

interface ComposerProps {
  settings: SketchSettings;
  updateSettings: (patch: Partial<SketchSettings>) => void;
  rerollSeed: () => void;
  modeThumbUrl: string | null;
  strengthPopoverOpen: boolean;
  onToggleStrengthPopover: () => void;
}

function snapStrength(strength: number, steps: number): number {
  return Math.min(1, Math.max(0, Math.round(strength * steps) / steps));
}

export function Composer({
  settings,
  updateSettings,
  rerollSeed,
  modeThumbUrl,
  strengthPopoverOpen,
  onToggleStrengthPopover,
}: ComposerProps): React.ReactElement {
  return (
    <div className="le-composer">
      <div className="le-prompt-row">
        <input
          type="text"
          aria-label="Prompt"
          className="le-prompt"
          value={settings.prompt}
          onChange={(event) => updateSettings({ prompt: event.target.value })}
        />
        <svg
          className="le-resize-glyph"
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#6f7278"
          strokeWidth="2.2"
          strokeLinecap="round"
        >
          <path d="M21 15v6h-6" />
          <path d="M21 21 11 11" />
        </svg>
      </div>
      <div className="le-chips">
        <Button
          type="button"
          variant="ghost"
          className="le-chip le-chip-mode"
          title="Mode"
        >
          {modeThumbUrl === null ? (
            <span className="le-chip-thumb-empty" />
          ) : (
            <img
              className="le-chip-thumb"
              src={modeThumbUrl}
              alt="Latest frame"
            />
          )}
          Realtime Sketch
        </Button>

        <div className="relative">
          {strengthPopoverOpen ? (
            <div
              className="le-popover le-popover-strength"
              role="dialog"
              aria-label="Strength"
            >
              <span className="le-strength-value">
                {settings.strength.toFixed(3)} → {""}
                {effectiveSteps(settings.strength, settings.steps)}/
                {settings.steps} steps
              </span>
              <input
                type="range"
                aria-label="Strength"
                className="le-strength-slider"
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
            </div>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className="le-chip"
            aria-label={`Strength ${settings.strength}`}
            onClick={onToggleStrengthPopover}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <path d="M4 8h10" />
              <circle cx="17" cy="8" r="2.2" />
              <path d="M20 16H10" />
              <circle cx="7" cy="16" r="2.2" />
            </svg>
            {String(Number(settings.strength.toFixed(3)))}
          </Button>
        </div>

        <Button
          type="button"
          variant="ghost"
          className="le-chip"
          aria-label={`${settings.steps} steps`}
          onClick={() =>
            updateSettings({
              steps: settings.steps === 8 ? 4 : 8,
              strength: snapStrength(
                settings.strength,
                settings.steps === 8 ? 4 : 8,
              ),
            })
          }
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M13 3 5 13h6l-1 8 8-10h-6z" />
          </svg>
          {settings.steps} steps
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="le-chip"
          aria-label="Seed"
          title={`Seed ${settings.seed} — click to re-roll`}
          onClick={rerollSeed}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 4v4h4" />
          </svg>
          Seed
        </Button>
      </div>
    </div>
  );
}
