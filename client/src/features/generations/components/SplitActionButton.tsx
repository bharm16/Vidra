import React, { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@promptstudio/system/components/ui/select";
import { CaretDown, Icon, Play } from "@promptstudio/system/components/ui";
import { cn } from "@/utils/cn";
import { formatCredits } from "../config/generationConfig";

type ModelOption = {
  label: string;
  credits?: number | null;
};

type SplitActionButtonVariant = "default" | "accent";

export interface SplitActionButtonProps {
  label: string;
  selectedModel: string | null;
  models: Record<string, ModelOption>;
  onRun: () => void;
  onModelChange: (model: string) => void;
  disabled?: boolean;
  variant?: SplitActionButtonVariant;
  renderItemSuffix?: (id: string, config: ModelOption) => React.ReactNode;
}

const MODEL_SEPARATOR = "\u00b7";
const CREDIT_SEPARATOR = "\u2022";

const VARIANT_STYLES: Record<
  SplitActionButtonVariant,
  {
    wrapper: string;
    action: string;
    trigger: string;
    icon: string;
    separator: string;
  }
> = {
  default: {
    wrapper: "border-border bg-surface-2 text-foreground",
    action: "font-medium hover:bg-surface-3",
    trigger: "text-muted hover:bg-surface-3",
    icon: "text-muted",
    separator: "text-muted",
  },
  accent: {
    wrapper: "border-border bg-white text-black shadow-sm",
    action: "font-semibold hover:bg-surface-2",
    trigger: "text-black/70 hover:bg-surface-2",
    icon: "text-black",
    separator: "text-black/60",
  },
};

export function SplitActionButton({
  label,
  selectedModel,
  models,
  onRun,
  onModelChange,
  disabled = false,
  variant = "default",
  renderItemSuffix,
}: SplitActionButtonProps): React.ReactElement {
  const options = useMemo(() => Object.entries(models), [models]);
  const modelLabel = selectedModel
    ? (models[selectedModel]?.label ?? selectedModel)
    : "Select model";
  const isRunDisabled = disabled || !selectedModel;
  const styles = VARIANT_STYLES[variant];

  // Build Select props conditionally to satisfy exactOptionalPropertyTypes
  // When selectedModel is null, we omit the value prop entirely
  const selectProps =
    selectedModel !== null
      ? { value: selectedModel, onValueChange: onModelChange, disabled }
      : { onValueChange: onModelChange, disabled };

  return (
    <Select {...selectProps}>
      <div
        className={cn(
          "inline-flex min-w-36 items-stretch overflow-hidden rounded-lg border transition-colors",
          styles.wrapper,
        )}
      >
        <button
          type="button"
          className={cn(
            "flex h-ps-9 min-w-0 flex-1 items-center gap-ps-2 px-ps-3 text-label-sm text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            styles.action,
          )}
          onClick={onRun}
          disabled={isRunDisabled}
          aria-label={`Run ${label} with ${modelLabel}`}
        >
          <Icon
            icon={Play}
            size="sm"
            className={styles.icon}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate">
            <span>{label}</span>
            <span className={cn("px-1", styles.separator)}>
              {MODEL_SEPARATOR}
            </span>
            <span>{modelLabel}</span>
          </span>
        </button>

        <div className="h-full w-px bg-border/30" aria-hidden="true" />

        <SelectTrigger
          size="xs"
          variant="ghost"
          className={cn(
            "h-ps-9 w-ps-8 rounded-none border-0 bg-transparent px-0 justify-center transition-colors hover:border-0 [&>svg:last-child]:hidden",
            styles.trigger,
          )}
          aria-label={`${label} model selection`}
        >
          <Icon icon={CaretDown} size="sm" aria-hidden="true" />
        </SelectTrigger>
      </div>

      <SelectContent>
        {options.map(([id, config]) => (
          <SelectItem
            key={id}
            value={id}
            title={`${config.label} ${CREDIT_SEPARATOR} ${formatCredits(
              config.credits,
            )}`}
          >
            <div className="flex w-full items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{config.label}</span>
              {renderItemSuffix?.(id, config)}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
