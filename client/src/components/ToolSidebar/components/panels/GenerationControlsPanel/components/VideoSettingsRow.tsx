import React from "react";
import { Settings2 } from "@promptstudio/system/components/ui";

interface VideoSettingsRowProps {
  aspectRatio: string;
  duration: number;
  aspectRatioOptions: string[];
  durationOptions: number[];
  onAspectRatioChange: (value: string) => void;
  onDurationChange: (value: number) => void;
  isAspectRatioDisabled?: boolean | undefined;
  isDurationDisabled?: boolean | undefined;
  onOpenMotion?: (() => void) | undefined;
  isMotionDisabled?: boolean | undefined;
}

/**
 * Compact settings row matching v5 mockup (44px tall):
 * [📈 Motion] ——————— [16:9] [5s] [⚙]
 */
export function VideoSettingsRow({
  aspectRatio,
  duration,
  aspectRatioOptions,
  durationOptions,
  onAspectRatioChange,
  onDurationChange,
  isAspectRatioDisabled,
  isDurationDisabled,
  onOpenMotion,
  isMotionDisabled,
}: VideoSettingsRowProps): React.ReactElement {
  return (
    <div className="h-11 px-3.5 border-t border-tool-rail-border flex items-center gap-1.5">
      {/* Motion pill — left-aligned with icon */}
      <button
        type="button"
        className="h-7 px-2.5 rounded-full border border-tool-nav-active text-tool-text-dim text-meta font-medium bg-transparent hover:bg-tool-surface-card disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
        onClick={onOpenMotion}
        disabled={isMotionDisabled}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          className="shrink-0"
        >
          <rect x="1" y="1" width="12" height="12" rx="2" />
          <path d="M4 10l3-3 2 1.5L12 5" />
        </svg>
        Motion
      </button>

      <div className="flex-1" />

      {/* Right-aligned compact pills */}
      <select
        className="h-7 px-2 rounded-md bg-transparent border border-tool-nav-active text-tool-text-subdued text-meta font-medium appearance-none cursor-pointer hover:text-tool-text-dim transition-colors"
        value={aspectRatio}
        onChange={(event) => onAspectRatioChange(event.target.value)}
        disabled={isAspectRatioDisabled}
        aria-label="Aspect ratio"
      >
        {aspectRatioOptions.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>

      <select
        className="h-7 px-2 rounded-md bg-transparent border border-tool-nav-active text-tool-text-subdued text-meta font-medium appearance-none cursor-pointer hover:text-tool-text-dim transition-colors"
        value={duration}
        onChange={(event) => onDurationChange(Number(event.target.value))}
        disabled={isDurationDisabled}
        aria-label="Duration"
      >
        {durationOptions.map((value) => (
          <option key={value} value={value}>
            {value}s
          </option>
        ))}
      </select>

      <button
        type="button"
        className="w-7 h-7 rounded-md border border-tool-nav-active flex items-center justify-center text-tool-text-subdued hover:text-tool-text-dim transition-colors"
        aria-label="Advanced settings"
      >
        <Settings2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
