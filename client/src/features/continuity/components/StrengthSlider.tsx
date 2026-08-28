import React from "react";

const PRESETS = [
  { label: "Loose", value: 0.4 },
  { label: "Balanced", value: 0.6 },
  { label: "Strict", value: 0.8 },
  { label: "Exact", value: 0.95 },
];

export interface StrengthSliderProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  label?: string;
}

export function StrengthSlider({
  value,
  onChange,
  disabled = false,
  label = "Style strength",
}: StrengthSliderProps): React.ReactElement {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        <span>{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={disabled}
        className="w-full accent-accent"
      />
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            disabled={disabled}
            onClick={() => onChange(preset.value)}
            className={`rounded-full border px-2 py-1 text-xs transition-colors ${
              Math.abs(value - preset.value) < 0.01
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-muted hover:text-foreground"
            } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default StrengthSlider;
