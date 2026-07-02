import React, { useEffect, useRef } from "react";
import { MagicWand, X } from "@promptstudio/system/components/ui";
import { cn } from "@/utils/cn";
import { TUNE_CHIPS, type TuneChip, type TuneChipId } from "../utils/tuneChips";

// ISSUE-42: rapid Enhance double-clicks fire `onEnhance` (and therefore
// POST /api/optimize) multiple times because the upstream `isOptimizing`
// guard in PromptCanvas.handleEnhance doesn't flip until React commits a
// `startTransition`-wrapped state update inside `usePromptOptimizer.optimize`.
// By the time the user's second click lands, the button is still visibly
// enabled and another request goes out. The cooldown ref drops repeats
// within ~2s so concurrent /api/optimize requests can't fire.
const ENHANCE_CLICK_COOLDOWN_MS = 2000;

export interface TuneDrawerProps {
  selectedChipIds: ReadonlyArray<TuneChipId>;
  onToggleChip: (id: TuneChipId) => void;
  onClose: () => void;
  /** Optional Enhance action — surfaced inside the drawer rather than the
   *  chip row. Omit to hide the row entirely (e.g. when the prompt is empty
   *  or the parent has no enhance capability wired). */
  onEnhance?: () => void;
  /** Disables and spinner-ifies the Enhance button while a request is in
   *  flight. Mirrors the legacy chip-row enhance button's loading state. */
  isEnhancing?: boolean;
  /** Disables the Enhance button when there is no prompt to enhance. The
   *  upstream handler is a no-op for empty prompts; the visual disable here
   *  is feedback so users don't click into nothing. */
  enhanceDisabled?: boolean;
  /** When true, the Enhance row is hidden entirely. In I2V mode (start image
   *  set) the optimizer pipeline early-exits anyway — see
   *  docs/superpowers/specs/2026-05-09-i2v-pipeline-simplification-design.md.
   *  Hiding the trigger keeps the UX honest about what's actually wired. */
  isI2VMode?: boolean;
}

const SECTIONS: ReadonlyArray<{ id: TuneChip["section"]; label: string }> = [
  { id: "motion", label: "Motion" },
  { id: "mood", label: "Mood" },
  { id: "style", label: "Style" },
];

export function TuneDrawer({
  selectedChipIds,
  onToggleChip,
  onClose,
  onEnhance,
  isEnhancing = false,
  enhanceDisabled = false,
  isI2VMode = false,
}: TuneDrawerProps): React.ReactElement {
  const selected = new Set(selectedChipIds);
  const showEnhance = Boolean(onEnhance) && !isI2VMode;

  const enhanceCooldownRef = useRef(false);
  const enhanceCooldownTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (enhanceCooldownTimerRef.current !== null) {
        window.clearTimeout(enhanceCooldownTimerRef.current);
        enhanceCooldownTimerRef.current = null;
      }
    };
  }, []);

  const handleEnhanceClick = (): void => {
    if (!onEnhance) return;
    if (isEnhancing || enhanceDisabled) return;
    if (enhanceCooldownRef.current) return;
    enhanceCooldownRef.current = true;
    onEnhance();
    if (enhanceCooldownTimerRef.current !== null) {
      window.clearTimeout(enhanceCooldownTimerRef.current);
    }
    enhanceCooldownTimerRef.current = window.setTimeout(() => {
      enhanceCooldownRef.current = false;
      enhanceCooldownTimerRef.current = null;
    }, ENHANCE_CLICK_COOLDOWN_MS);
  };

  return (
    <div
      className="border-tool-rail-border border-b px-4 pb-3 pt-3"
      role="region"
      aria-label="Tune render settings"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-tool-text-subdued text-overline m-0">Tune</h3>
        <button
          type="button"
          aria-label="Close"
          className="text-tool-text-subdued hover:bg-tool-rail-border hover:text-foreground inline-flex items-center justify-center rounded-md p-1"
          onClick={onClose}
        >
          <X size={12} weight="bold" aria-hidden="true" />
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {SECTIONS.map((section) => {
          const chipsForSection = TUNE_CHIPS.filter(
            (c) => c.section === section.id,
          );
          return (
            <fieldset
              key={section.id}
              className="m-0 flex items-center gap-2 border-0 p-0"
            >
              <legend className="contents">
                <span className="text-tool-text-subdued text-overline mr-1 inline-block w-[44px]">
                  {section.label}
                </span>
              </legend>
              {chipsForSection.map((chip) => {
                const isPressed = selected.has(chip.id);
                return (
                  <button
                    key={chip.id}
                    type="button"
                    aria-pressed={isPressed}
                    onClick={() => onToggleChip(chip.id)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                      isPressed
                        ? "border-tool-accent-neutral/50 bg-tool-accent-neutral/10 text-foreground"
                        : "border-tool-rail-border text-tool-text-dim hover:border-tool-text-label hover:text-foreground bg-transparent",
                    )}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </fieldset>
          );
        })}
      </div>
      {showEnhance ? (
        <div className="border-tool-rail-border mt-3 flex items-center justify-between border-t pt-3">
          <span className="text-tool-text-subdued text-overline">Prompt</span>
          <button
            type="button"
            data-testid="tune-drawer-enhance"
            aria-label={isEnhancing ? "Enhancing prompt…" : "Enhance prompt"}
            title={isEnhancing ? "Enhancing…" : "Enhance"}
            disabled={isEnhancing || enhanceDisabled}
            onClick={handleEnhanceClick}
            className={cn(
              "border-tool-rail-border inline-flex items-center gap-1.5 rounded-full border bg-transparent px-3 py-1 text-[11px] font-medium transition-colors",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "hover:border-tool-text-label hover:text-foreground",
              isEnhancing ? "text-foreground" : "text-tool-text-dim",
            )}
          >
            {isEnhancing ? (
              <svg
                className="animate-spin"
                width={12}
                height={12}
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  cx="6"
                  cy="6"
                  r="4.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeDasharray="20 8"
                />
              </svg>
            ) : (
              <MagicWand size={12} aria-hidden="true" />
            )}
            {isEnhancing ? "Enhancing…" : "Enhance prompt"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
