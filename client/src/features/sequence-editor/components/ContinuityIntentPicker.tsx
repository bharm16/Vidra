import React, { useMemo } from "react";
import type { SessionContinuityMode } from "@shared/types/session";
import { cn } from "@/utils/cn";
import { StrengthSlider } from "@/features/continuity/components/StyleReferencePanel/StrengthSlider";

interface ContinuityIntentPickerProps {
  mode: SessionContinuityMode;
  onModeChange: (mode: SessionContinuityMode) => void;
  strength: number;
  onStrengthChange: (strength: number) => void;
}

type IntentMode = "frame-bridge" | "style-match" | "none";

function BridgeIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M1 8c0-3 2-5 5-5s5 2 5 5" />
      <path d="M3 8V6M6 8V3M9 8V6" />
    </svg>
  );
}

function PaintbrushIcon({
  className,
}: {
  className?: string;
}): React.ReactElement {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M7.5 1.5l3 3-5 5H2.5V7.5z" />
      <path d="M6.5 2.5l3 3" />
    </svg>
  );
}

const normalizeMode = (mode: SessionContinuityMode): IntentMode => {
  if (mode === "frame-bridge" || mode === "style-match") return mode;
  return "none";
};

const resolveStrengthLabel = (mode: IntentMode): string => {
  if (mode === "frame-bridge") return "Temporal match";
  if (mode === "style-match") return "Style fidelity";
  return "Continuity strength";
};

export function ContinuityIntentPicker({
  mode,
  onModeChange,
  strength,
  onStrengthChange,
}: ContinuityIntentPickerProps): React.ReactElement {
  const activeMode = normalizeMode(mode);

  const options = useMemo(
    () => [
      {
        id: "frame-bridge" as const,
        label: "Continue scene",
        description: "Next shot starts where this one ended",
        baseClass: "text-cyan-400",
        activeClass: "border-cyan-400/40 bg-cyan-400/7 text-cyan-400",
        icon: <BridgeIcon className="h-3 w-3" />,
      },
      {
        id: "style-match" as const,
        label: "New angle, same look",
        description: "Different framing, consistent colors & style",
        baseClass: "text-accent",
        activeClass: "border-accent/50 bg-accent/10 text-accent",
        icon: <PaintbrushIcon className="h-3 w-3" />,
      },
      {
        id: "none" as const,
        label: "Independent",
        description: "Treat this as a standalone shot",
        baseClass: "text-muted",
        activeClass: "border-border-strong bg-surface-1 text-foreground",
        icon: (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
        ),
      },
    ],
    [],
  );

  const sliderLabel = resolveStrengthLabel(activeMode);
  const sliderDisabled = activeMode === "none";

  return (
    <section className="rounded-lg border border-border bg-surface-2 p-3">
      <header className="mb-2 text-meta font-semibold uppercase tracking-wide text-muted">
        Continuity intent
      </header>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {options.map((option) => {
          const isActive = activeMode === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onModeChange(option.id)}
              className={cn(
                "rounded-md border p-2 text-left transition-colors",
                isActive
                  ? option.activeClass
                  : "border-border bg-surface-1 text-muted hover:border-border-strong hover:text-foreground",
              )}
            >
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
                <span className={isActive ? option.baseClass : "text-muted"}>
                  {option.icon}
                </span>
                <span>{option.label}</span>
              </div>
              <p className="text-meta leading-4 text-muted">
                {option.description}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        <StrengthSlider
          value={strength}
          onChange={onStrengthChange}
          disabled={sliderDisabled}
          label={sliderLabel}
        />
      </div>
    </section>
  );
}

export default ContinuityIntentPicker;
