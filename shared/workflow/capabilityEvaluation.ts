import {
  isParameterValueInDomain,
  type CapabilityProfile,
  type ParameterDomain,
  type ParameterValue,
} from "../schemas/workflow/capability.schemas";
import type { DraftContent } from "../schemas/workflow/draft.schemas";
import type { MediaVersion } from "../schemas/workflow/media.schemas";
import type { PreparationReason } from "../schemas/workflow/preparation.schemas";

export type SettingRole = "shape" | "duration" | "resolution" | "sound";

/** Models name the same creation choice differently; the role is what the composer shows. */
export function settingRole(name: string): SettingRole | undefined {
  if (/aspect|shape/i.test(name)) return "shape";
  if (/duration/i.test(name)) return "duration";
  if (/resolution/i.test(name)) return "resolution";
  if (/audio|sound/i.test(name)) return "sound";
  return undefined;
}

/** Seconds and resolutions compare by size; other values only match exactly. */
function magnitude(value: ParameterValue): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return undefined;
  const lines = /^(\d+)p$/i.exec(value);
  if (lines) return Number(lines[1]);
  const k = /^(\d+)k$/i.exec(value);
  return k ? Number(k[1]) * 540 : undefined;
}

function nearest(
  value: ParameterValue | undefined,
  values: ParameterValue[],
  fallback: ParameterValue,
): ParameterValue {
  if (value !== undefined && values.includes(value)) return value;
  const size = value === undefined ? undefined : magnitude(value);
  const sized =
    size === undefined
      ? []
      : values.flatMap(candidate => {
          const candidateSize = magnitude(candidate);
          return candidateSize === undefined
            ? []
            : [{ candidate, distance: Math.abs(candidateSize - size) }];
        });
  if (sized.length) {
    return sized.reduce((best, next) => (next.distance < best.distance ? next : best)).candidate;
  }
  return values.includes(fallback) ? fallback : (values[0] ?? fallback);
}

function fit(
  value: ParameterValue | undefined,
  domain: ParameterDomain,
  fallback: ParameterValue,
): ParameterValue {
  if (domain.kind === "enum") return nearest(value, domain.values, fallback);
  if (domain.kind === "text") {
    return typeof value === "string" && value.length <= domain.maxLength ? value : fallback;
  }
  if (typeof value !== "number") return fallback;
  const steps = Math.round(
    (Math.min(domain.max, Math.max(domain.min, value)) - domain.min) / domain.step,
  );
  return Math.min(domain.max, domain.min + steps * domain.step);
}

/** A chosen value moves the settings it constrains to their nearest allowed value. */
export function withConstraints(
  profile: CapabilityProfile,
  parameters: DraftContent["settings"]["parameters"],
): DraftContent["settings"]["parameters"] {
  const next = { ...parameters };
  for (const constraint of profile.constraints) {
    if (next[constraint.parameter] !== constraint.equals) continue;
    for (const [name, allowed] of Object.entries(constraint.requires)) {
      if (name in next) {
        next[name] = nearest(next[name], allowed, allowed[0] ?? constraint.equals);
      }
    }
  }
  return next;
}

/** Choosing a model keeps the values it can use and moves the rest to its nearest offer. */
export function settingsForProfile(
  profile: CapabilityProfile,
  content: DraftContent,
): DraftContent["settings"] {
  const previous = content.settings.parameters;
  const retained = (name: string): ParameterValue | undefined => {
    if (previous[name] !== undefined) return previous[name];
    const role = settingRole(name);
    return role ? Object.entries(previous).find(([key]) => settingRole(key) === role)?.[1] : undefined;
  };
  const parameters: DraftContent["settings"]["parameters"] = {};
  for (const [name, policy] of Object.entries(profile.parameters)) {
    if (policy.policy === "fixed") parameters[name] = policy.value;
    else if (policy.policy === "editable") {
      parameters[name] = fit(retained(name), policy.domain, policy.defaultValue);
    }
  }
  return {
    profileId: profile.id,
    profileRevision: profile.revision,
    parameters: withConstraints(profile, parameters),
    outputCount: content.settings.outputCount,
  };
}

/** A new action has not chosen a model for itself yet. */
export function settingsForAction(content: DraftContent): DraftContent["settings"] {
  return { ...content.settings, profileId: "unselected", profileRevision: "unresolved" };
}

/** Intersect declared constraints without altering the retained selection. */
export function allowedParameterValues(
  profile: CapabilityProfile,
  content: DraftContent,
  name: string,
): ParameterValue[] | undefined {
  const policy = profile.parameters[name];
  if (policy?.policy !== "editable" || policy.domain.kind !== "enum") return undefined;
  let values = [...policy.domain.values];
  for (const constraint of profile.constraints) {
    const allowed = constraint.requires[name];
    if (content.settings.parameters[constraint.parameter] === constraint.equals && allowed) {
      values = values.filter(value => allowed.includes(value));
    }
  }
  return values;
}

export interface ProfileParameterValidationResult {
  parameters: Record<string, ParameterValue>;
  reasons: PreparationReason[];
}

/** Preparation's authoritative parameter and constraint checks, kept pure in shared code. */
export function validateProfileParameters(
  profile: CapabilityProfile | undefined,
  settings: DraftContent["settings"],
  resolvedInputs: ReadonlyArray<{ role: string }>,
  resolvedMedia: readonly MediaVersion[],
): ProfileParameterValidationResult {
  const parameters: Record<string, ParameterValue> = {};
  const reasons: PreparationReason[] = [];
  const block = (code: PreparationReason["code"], message: string, field?: string): void => {
    reasons.push({ code, message, ...(field ? { field } : {}) });
  };
  for (const key of Object.keys(settings.parameters)) {
    if (profile && !Object.hasOwn(profile.parameters, key)) {
      block("settings_invalid", `The ${key} setting is not mapped by this exact operation.`, key);
    }
  }
  for (const [key, policy] of Object.entries(profile?.parameters ?? {})) {
    const retained = settings.parameters[key];
    if (policy.policy === "derived") continue;
    if (policy.policy === "unsupported" || policy.policy === "unknown") {
      if (retained !== undefined || policy.policy === "unknown") {
        block("settings_invalid", policy.reason, key);
      }
      continue;
    }
    const value = retained ?? (policy.policy === "fixed" ? policy.value : policy.defaultValue);
    const valid =
      policy.policy === "fixed"
        ? value === policy.value
        : isParameterValueInDomain(policy.domain, value);
    if (!valid) {
      block("settings_invalid", `Review the retained ${key} value; it is not valid for this operation.`, key);
    } else if (
      key === "seed" &&
      (typeof value !== "number" || !Number.isInteger(value) || value < -1 || value > 2147483647)
    ) {
      block(
        "settings_invalid",
        "The requested seed is not a supported concrete or provider-chosen seed.",
        key,
      );
    } else {
      parameters[key] = value;
    }
  }
  for (const [key, policy] of Object.entries(profile?.parameters ?? {})) {
    if (policy.policy !== "derived") continue;
    if (policy.from === "frame-duration") {
      const frames = parameters.numFrames;
      const fps = parameters.framesPerSecond;
      if (typeof frames === "number" && typeof fps === "number" && fps > 0) {
        parameters[key] = frames / fps;
      } else {
        block("settings_invalid", "Frame count and generation rate are required to derive duration.", key);
      }
    } else {
      const index = resolvedInputs.findIndex(input => input.role === policy.role);
      const metadata = resolvedMedia[index]?.metadata;
      if (metadata?.state !== "verified") {
        block("input_pending", "The exact input metadata is needed for this setting.", key);
      } else if (policy.from === "input-duration") {
        parameters[key] = metadata.durationSeconds;
      } else if (metadata.width === undefined || metadata.height === undefined) {
        block("input_incompatible", "This setting requires an input with verified visual dimensions.", key);
      } else {
        parameters[key] = `${metadata.width}:${metadata.height}`;
      }
    }
  }
  for (const constraint of profile?.constraints ?? []) {
    if (parameters[constraint.parameter] === constraint.equals) {
      for (const [field, allowed] of Object.entries(constraint.requires)) {
        if (!allowed.includes(parameters[field] ?? "")) {
          block("settings_invalid", constraint.reason, field);
        }
      }
    }
  }
  if (profile && settings.outputCount > profile.output.maxCount) {
    block("settings_invalid", "This operation cannot produce the selected number of outputs.", "outputCount");
  }
  return { parameters, reasons };
}
