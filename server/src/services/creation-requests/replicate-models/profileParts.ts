import { z } from "zod";
import type { ParameterPresentation } from "@shared/schemas/workflow/capability.schemas";
import type {
  InputRole,
  ModelCall,
  ModelProfile,
  ParameterPolicy,
  ParameterValue,
} from "./types";

/** New native profiles share one revision; a profile change must re-qualify its spend ceiling. */
export const NATIVE_MODEL_REVISION = "native/2026-10-19/1";

export const choice = (
  values: readonly ParameterValue[],
  defaultValue: ParameterValue,
): ParameterPolicy => ({
  policy: "editable",
  domain: { kind: "enum", values: [...values] },
  defaultValue,
});

export const range = (
  min: number,
  max: number,
  step: number,
  defaultValue: number,
): ParameterPolicy => ({
  policy: "editable",
  domain: { kind: "range", min, max, step },
  defaultValue,
});

export const words = (
  maxLength: number,
  defaultValue = "",
): ParameterPolicy => ({
  policy: "editable",
  domain: { kind: "text", maxLength },
  defaultValue,
});

export const toggle = (defaultValue: boolean): ParameterPolicy =>
  choice([true, false], defaultValue);

/** How one setting reads in the composer; see ParameterPresentationSchema. */
export const shown = (
  label: string,
  details: Omit<ParameterPresentation, "label"> = {},
): ParameterPresentation => ({ label, ...details });

/** Seeds stay out of the composer: New variation and Reuse setup decide them. */
export const HIDDEN_SEED: ParameterPresentation = { label: "Seed", hidden: true };

/** -1 lets preparation choose a concrete seed per slot, so retries stay reproducible. */
export const SEED: ParameterPolicy = range(-1, 2147483647, 1, -1);

/** -1 leaves a placement coordinate to the model. */
export const AUTO_COORDINATE: ParameterPolicy = range(-1, 4096, 1, -1);

const MEGABYTE = 1024 * 1024;
export const megabytes = (count: number): number => count * MEGABYTE;

type ProfileFields = Pick<
  ModelProfile,
  | "id"
  | "label"
  | "action"
  | "endpoint"
  | "mode"
  | "inputs"
  | "output"
  | "parameters"
  | "generatedAudio"
> &
  Required<Pick<ModelProfile, "presentation">> &
  Partial<Pick<ModelProfile, "constraints" | "maxContextCharacters">> & {
    deadlineSeconds: number;
  };

export function nativeProfile({
  deadlineSeconds,
  ...fields
}: ProfileFields): ModelProfile {
  return {
    schemaVersion: "vidra-workflow/v2",
    revision: NATIVE_MODEL_REVISION,
    provider: "replicate",
    maxContextCharacters: 32000,
    constraints: [],
    recovery: {
      start: "supported",
      status: "unsupported",
      cancel: "unsupported",
      result: "unsupported",
      deadlineSeconds,
    },
    pricing: { mode: "free", maximumCreditsPerSlot: 0 },
    ...fields,
  };
}

export function text(call: ModelCall, name: string): string {
  return z.string().parse(call.parameters[name]);
}

export function number(call: ModelCall, name: string): number {
  return z.number().finite().parse(call.parameters[name]);
}

export function flag(call: ModelCall, name: string): boolean {
  return z.boolean().parse(call.parameters[name]);
}

export function urls(call: ModelCall, role: InputRole): string[] {
  return (call.inputs[role] ?? []).map((input) => input.url);
}

export function url(call: ModelCall, role: InputRole): string | undefined {
  return call.inputs[role]?.[0]?.url;
}

export function requiredUrl(call: ModelCall, role: InputRole): string {
  const value = url(call, role);
  if (!value) throw new Error(`The ${role} input is missing`);
  return value;
}

/** Adds a key only when the value is set, so the model keeps its own default. */
export function withOptional(
  input: Record<string, unknown>,
  optional: Record<string, unknown>,
): Record<string, unknown> {
  for (const [key, value] of Object.entries(optional)) {
    const unset =
      value === undefined ||
      value === "" ||
      (typeof value === "number" && value < 0) ||
      (Array.isArray(value) && value.length === 0);
    if (!unset) input[key] = value;
  }
  return input;
}
