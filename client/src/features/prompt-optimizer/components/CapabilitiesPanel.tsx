import React, { useMemo } from "react";
import {
  getDefaultValue,
  resolveFieldState,
  type CapabilitiesSchema,
  type CapabilityField,
  type CapabilityValue,
  type CapabilityValues,
} from "@shared/capabilities";
import { Button } from "@promptstudio/system/components/ui/button";
import { Input } from "@promptstudio/system/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@promptstudio/system/components/ui/select";
import { Switch } from "@promptstudio/system/components/ui/switch";
import { useCapabilities } from "../hooks/useCapabilities";
import { useNormalizedCapabilityValues } from "../hooks/useNormalizedCapabilityValues";

interface CapabilitiesPanelProps {
  selectedModel?: string;
  generationParams: CapabilityValues;
  onChange: (params: CapabilityValues) => void;
  // If provided, uses this schema/state instead of internal fetching
  schema?: CapabilitiesSchema | null;
  isLoading?: boolean;
  error?: string | null;
  targetLabel?: string;
  // Fields to hide (e.g. if moved elsewhere in UI)
  excludeFields?: string[];
}

interface FieldEntry {
  id: string;
  field: CapabilityField;
  state: ReturnType<typeof resolveFieldState>;
}

const getFieldLabel = (fieldId: string, field: CapabilityField): string =>
  field.ui?.label || fieldId.replace(/_/g, " ");

const valueToLabel = (value: CapabilityValue): string => {
  if (typeof value === "number") {
    return Number.isInteger(value) ? `${value}` : value.toString();
  }
  if (typeof value === "boolean") {
    return value ? "On" : "Off";
  }
  return value;
};

export const CapabilitiesPanel = ({
  selectedModel,
  generationParams,
  onChange,
  schema: propSchema,
  isLoading: propIsLoading,
  error: propError,
  targetLabel,
  excludeFields = [],
}: CapabilitiesPanelProps): React.ReactElement | null => {
  const capabilities = useCapabilities(selectedModel, {
    enabled: propSchema === undefined,
  });

  // Use props if provided, otherwise internal state
  const schema = propSchema !== undefined ? propSchema : capabilities.schema;
  const isLoading =
    propIsLoading !== undefined ? propIsLoading : capabilities.isLoading;
  const error = propError !== undefined ? propError : capabilities.error;
  const label =
    targetLabel !== undefined ? targetLabel : capabilities.target.label;
  const { provider, model } = capabilities.target;

  const normalizedValues = useNormalizedCapabilityValues({
    schema,
    generationParams,
    onChange,
  });

  const groupedFields = useMemo(() => {
    if (!schema) return [];

    // Filter out excluded fields
    const visibleFields = Object.entries(schema.fields).filter(
      ([id]) => !excludeFields.includes(id),
    );

    const entries: FieldEntry[] = visibleFields.map(([id, field]) => ({
      id,
      field,
      state: resolveFieldState(field, normalizedValues),
    }));

    const visible = entries.filter((entry) => entry.state.available);
    const grouped = new Map<string, FieldEntry[]>();

    for (const entry of visible) {
      const group = entry.field.ui?.group || "Options";
      const bucket = grouped.get(group) ?? [];
      bucket.push(entry);
      grouped.set(group, bucket);
    }

    const groupEntries = Array.from(grouped.entries()).map(
      ([group, fields]) => {
        const ordered = fields.sort(
          (a, b) => (a.field.ui?.order ?? 999) - (b.field.ui?.order ?? 999),
        );
        const minOrder = ordered[0]?.field.ui?.order ?? 999;
        return { group, fields: ordered, order: minOrder };
      },
    );

    return groupEntries.sort((a, b) => a.order - b.order);
  }, [schema, normalizedValues, excludeFields]);

  const handleValueChange = (fieldId: string, value: CapabilityValue): void => {
    onChange({ ...normalizedValues, [fieldId]: value });
  };

  if (!schema && isLoading) {
    return <div className="text-xs text-muted">Loading model settings...</div>;
  }

  if (!schema) {
    return (
      <div className="text-xs text-muted">
        {error
          ? `Settings unavailable: ${error}`
          : "Model settings unavailable."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Model settings
        </span>
        <span className="text-xs text-muted">
          {label} - {provider}/{model}
        </span>
      </div>

      {groupedFields.map((group) => (
        <div key={group.group} className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            {group.group}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {group.fields.map(({ id, field, state }) => {
              const value = normalizedValues[id];
              const labelText = getFieldLabel(id, field);
              const description = field.ui?.description;
              const isDisabled = state.disabled;
              const allowedValues =
                field.type === "enum"
                  ? (state.allowedValues ?? field.values ?? [])
                  : [];

              return (
                <div
                  key={id}
                  className={`rounded-md border border-border bg-app px-3 py-2.5 ${
                    isDisabled ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor={`cap-${id}`}
                      className="text-xs font-medium text-foreground"
                    >
                      {labelText}
                    </label>
                    {field.type === "bool" && (
                      <Switch
                        id={`cap-${id}`}
                        checked={Boolean(value)}
                        onCheckedChange={(checked) =>
                          handleValueChange(id, checked)
                        }
                        disabled={isDisabled}
                      />
                    )}
                  </div>

                  {field.type === "enum" &&
                    field.ui?.control === "segmented" && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {allowedValues.map((option) => {
                          const isSelected = Object.is(option, value);
                          return (
                            <Button
                              key={`${id}-${String(option)}`}
                              type="button"
                              disabled={isDisabled}
                              onClick={() => handleValueChange(id, option)}
                              aria-pressed={isSelected}
                              variant="ghost"
                              className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
                                isSelected
                                  ? "bg-foreground text-app border-foreground"
                                  : "bg-app text-muted border-border hover:bg-surface-1"
                              }`}
                            >
                              {valueToLabel(option)}
                            </Button>
                          );
                        })}
                      </div>
                    )}

                  {field.type === "enum" &&
                    field.ui?.control !== "segmented" && (
                      <Select
                        value={value !== undefined ? String(value) : ""}
                        onValueChange={(selectedValue) => {
                          const selected = allowedValues.find(
                            (option) => String(option) === selectedValue,
                          );
                          if (typeof selected !== "undefined") {
                            handleValueChange(id, selected);
                          }
                        }}
                        disabled={isDisabled}
                      >
                        <SelectTrigger
                          id={`cap-${id}`}
                          className="mt-2 w-full rounded-md border border-border bg-app px-2 py-1.5 text-xs text-foreground"
                        >
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          {allowedValues.map((option) => (
                            <SelectItem
                              key={`${id}-${String(option)}`}
                              value={String(option)}
                            >
                              {valueToLabel(option)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                  {field.type === "int" && (
                    <Input
                      id={`cap-${id}`}
                      type="number"
                      value={typeof value === "number" ? value : ""}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        if (nextValue === "") {
                          const fallback = getDefaultValue(field);
                          if (typeof fallback !== "undefined") {
                            handleValueChange(id, fallback);
                          }
                          return;
                        }
                        const parsed = Number(nextValue);
                        if (!Number.isNaN(parsed)) {
                          handleValueChange(id, parsed);
                        }
                      }}
                      disabled={isDisabled}
                      min={field.constraints?.min}
                      max={field.constraints?.max}
                      step={field.constraints?.step}
                      className="mt-2 w-full rounded-md border border-border bg-app px-2 py-1.5 text-xs text-foreground"
                    />
                  )}

                  {field.type === "string" && (
                    <Input
                      id={`cap-${id}`}
                      type="text"
                      value={typeof value === "string" ? value : ""}
                      onChange={(event) =>
                        handleValueChange(id, event.target.value)
                      }
                      disabled={isDisabled}
                      placeholder={field.ui?.placeholder}
                      className="mt-2 w-full rounded-md border border-border bg-app px-2 py-1.5 text-xs text-foreground"
                    />
                  )}

                  {description && (
                    <p className="mt-2 text-[11px] text-muted">{description}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
