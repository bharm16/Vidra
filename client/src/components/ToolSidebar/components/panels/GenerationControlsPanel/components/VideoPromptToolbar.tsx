import React from "react";
import { Copy, Trash2, Wand2 } from "@promptstudio/system/components/ui";

interface VideoPromptToolbarProps {
  canCopy: boolean;
  canClear: boolean;
  canGeneratePreviews: boolean;
  onCopy: () => void;
  onClear: () => void;
  onGenerateSinglePreview: () => void;
  onGenerateFourPreviews: () => void;
  promptLength?: number;
  /** When true, the AI Enhance trigger is hidden. In I2V mode (start image
   *  set) the optimizer pipeline early-exits, so showing the button would
   *  mislead users — see the i2v-pipeline-simplification design spec. */
  isI2VMode?: boolean;
}

/**
 * Prompt card action bar matching v5 mockup:
 * [📋] [🗑] ———— 190  [□|□□□□]  [✨ AI Enhance]
 *
 * The [□|□□□□] is a split-action preview button:
 *   Left  → generate 1 Flux preview (1 cr)
 *   Right → generate 4 Flux previews (~4 cr)
 */
export function VideoPromptToolbar({
  canCopy,
  canClear,
  canGeneratePreviews,
  onCopy,
  onClear,
  onGenerateSinglePreview,
  onGenerateFourPreviews,
  promptLength = 0,
  isI2VMode = false,
}: VideoPromptToolbarProps): React.ReactElement {
  return (
    <div className="border-tool-nav-active flex h-[42px] items-center gap-0.5 border-t px-2">
      {/* ── Left: copy + clear ── */}
      <button
        type="button"
        aria-label="Copy text"
        className="text-tool-text-subdued hover:bg-tool-nav-active hover:text-tool-text-dim flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:opacity-50"
        onClick={onCopy}
        disabled={!canCopy}
      >
        <Copy className="h-[13px] w-[13px]" />
      </button>
      <button
        type="button"
        aria-label="Clear text"
        className="text-tool-text-subdued hover:bg-tool-nav-active hover:text-tool-text-dim flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:opacity-50"
        onClick={onClear}
        disabled={!canClear}
      >
        <Trash2 className="h-[13px] w-[13px]" />
      </button>

      {/* ── Spacer ── */}
      <div className="flex-1" />

      {/* ── Character count ── */}
      <span className="text-tool-text-label mr-2 text-meta tabular-nums">
        {promptLength}
      </span>

      {/* ── Split-action preview button [□ | □□□□] ── */}
      <div className="border-tool-nav-active bg-tool-surface-deep flex h-[26px] overflow-hidden rounded-md border">
        <button
          type="button"
          aria-label="Generate 1 preview · 1 cr"
          title="Generate 1 preview · 1 cr"
          className="text-tool-text-subdued hover:bg-tool-nav-active/50 hover:text-foreground relative flex h-full items-center justify-center px-[7px] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onGenerateSinglePreview}
          disabled={!canGeneratePreviews}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="8" height="8" rx="1.5" />
          </svg>
          <div className="bg-tool-accent-neutral absolute bottom-[1px] left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full" />
        </button>
        <div className="bg-tool-nav-active h-[14px] w-px self-center" />
        <button
          type="button"
          aria-label="Generate 4 previews · ~4 cr"
          title="Generate 4 previews · ~4 cr"
          className="text-tool-text-label hover:bg-tool-nav-active/50 hover:text-foreground flex h-full items-center justify-center px-[7px] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onGenerateFourPreviews}
          disabled={!canGeneratePreviews}
        >
          <svg
            width="22"
            height="13"
            viewBox="0 0 22 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="1" y="3.5" width="4" height="7" rx="0.8" />
            <rect x="6" y="3.5" width="4" height="7" rx="0.8" />
            <rect x="11" y="3.5" width="4" height="7" rx="0.8" />
            <rect x="16" y="3.5" width="4" height="7" rx="0.8" />
          </svg>
        </button>
      </div>

      {!isI2VMode && (
        <>
          <div className="w-1" />

          {/* ── AI Enhance ── */}
          <button
            type="button"
            aria-label="AI Enhance"
            className="border-tool-accent-neutral/25 bg-tool-accent-neutral/5 text-tool-accent-neutral hover:bg-tool-accent-neutral/13 hover:border-tool-accent-neutral/50 inline-flex h-[26px] items-center gap-1 rounded-md border px-2.5 text-meta font-semibold transition-colors"
          >
            <Wand2 className="h-[13px] w-[13px]" />
            AI Enhance
          </button>
        </>
      )}
    </div>
  );
}
