import React from "react";

import { Button } from "@promptstudio/system/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@promptstudio/system/components/ui/popover";
import resizeIcon from "../assets/prompt-resize.svg";
import strengthIcon from "../assets/strength.svg";
import seedIcon from "../assets/seed.svg";

import { effectiveSteps, snapStrength } from "../config/constants";
import type { LiveOutput } from "../hooks/generationReducer";
import type { SendPictureStatus } from "@/features/project-imports/hooks/useSendPictureToLibrary";
import type { SketchSettings } from "../hooks/useRealtimeSketch";

/**
 * Floating composer (design_handoff_live_editor): prompt row + labeled
 * chips. The mode chip's thumbnail is the latest generated frame, live.
 * Strength opens a popover slider snapped to the 1/steps grid — the only
 * stops the model distinguishes. Step count is fixed (see DEFAULT_STEPS):
 * the one alternative on offer had no working strength at all.
 *
 * It also holds "Use this" (ADR-0022 decision 5) — deliberately the component
 * that DISPLAYS the picture, so what is accepted is provably what is shown.
 * It hands `liveOutput` straight back rather than describing it, because a
 * description assembled here would be assembled from live settings.
 */

interface ComposerProps {
  settings: SketchSettings;
  updateSettings: (patch: Partial<SketchSettings>) => void;
  rerollSeed: () => void;
  /** The picture on screen — the mode chip's thumbnail and what Use this accepts. */
  liveOutput: LiveOutput | null;
  /** Sends the picture on screen to the /app library. */
  onUseThis: (output: LiveOutput) => void;
  sending: SendPictureStatus;
  strengthPopoverOpen: boolean;
  onToggleStrengthPopover: () => void;
}

export function Composer({
  settings,
  updateSettings,
  rerollSeed,
  liveOutput,
  onUseThis,
  sending,
  strengthPopoverOpen,
  onToggleStrengthPopover,
}: ComposerProps): React.ReactElement {
  return (
    <div className="le-composer">
      <div className="le-prompt-row">
        <textarea
          aria-label="Prompt"
          className="le-prompt"
          value={settings.prompt}
          onChange={(event) => updateSettings({ prompt: event.target.value })}
        />
        <img className="le-resize-glyph" src={resizeIcon} alt="" />
      </div>
      <div className="le-chips">
        <Button
          type="button"
          variant="ghost"
          className="le-chip le-chip-mode"
          title="Mode"
        >
          {liveOutput === null ? (
            <span className="le-chip-thumb-empty" />
          ) : (
            <img
              className="le-chip-thumb"
              src={liveOutput.imageUrl}
              alt="Latest frame"
            />
          )}
          Realtime Sketch
        </Button>

        <Popover
          open={strengthPopoverOpen}
          onOpenChange={(open) => {
            if (open !== strengthPopoverOpen) onToggleStrengthPopover();
          }}
        >
          <PopoverContent
            className="le-popover le-popover-strength"
            side="top"
            sideOffset={8}
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
          </PopoverContent>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="le-chip le-chip-strength"
              aria-label={`Strength ${settings.strength}`}
            >
              <img src={strengthIcon} alt="" />
              {String(Number(settings.strength.toFixed(3)))}
            </Button>
          </PopoverTrigger>
        </Popover>

        <Button
          type="button"
          variant="ghost"
          className="le-chip le-chip-seed"
          aria-label="Seed"
          title={`Seed ${settings.seed} — click to re-roll`}
          onClick={rerollSeed}
        >
          <img src={seedIcon} alt="" />
          Seed
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="le-chip le-chip-accept"
          disabled={liveOutput === null || sending.state === "sending"}
          onClick={() => {
            if (liveOutput !== null) onUseThis(liveOutput);
          }}
        >
          {sending.state === "sending" ? "Sending…" : "Use this"}
        </Button>
      </div>
      {sending.state === "failed" ? (
        <div className="le-accept-error" data-testid="live-editor-accept-error">
          {sending.message}
        </div>
      ) : null}
    </div>
  );
}
