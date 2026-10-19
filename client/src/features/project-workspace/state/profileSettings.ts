import type { CapabilityProfile, ParameterPolicy, ParameterValue } from "@shared/schemas/workflow/capability.schemas";
import type { DraftContent } from "@shared/schemas/workflow/draft.schemas";
import { settingRole } from "./capabilitySettings";

type ParameterDomain = Extract<ParameterPolicy, { policy: "editable" }>["domain"];

/** Seconds and resolutions compare by size; other values only match exactly. */
function magnitude(value: ParameterValue): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return undefined;
  const lines = /^(\d+)p$/i.exec(value); if (lines) return Number(lines[1]);
  const k = /^(\d+)k$/i.exec(value); return k ? Number(k[1]) * 540 : undefined;
}

function nearest(value: ParameterValue | undefined, values: ParameterValue[], fallback: ParameterValue): ParameterValue {
  if (value !== undefined && values.includes(value)) return value;
  const size = value === undefined ? undefined : magnitude(value);
  const sized = size === undefined ? [] : values.flatMap(candidate => { const candidateSize = magnitude(candidate); return candidateSize === undefined ? [] : [{ candidate, distance: Math.abs(candidateSize - size) }]; });
  if (sized.length) return sized.reduce((best, next) => next.distance < best.distance ? next : best).candidate;
  return values.includes(fallback) ? fallback : values[0] ?? fallback;
}

function fit(value: ParameterValue | undefined, domain: ParameterDomain, fallback: ParameterValue): ParameterValue {
  if (domain.kind === "enum") return nearest(value, domain.values, fallback);
  if (typeof value !== "number") return fallback;
  const steps = Math.round((Math.min(domain.max, Math.max(domain.min, value)) - domain.min) / domain.step);
  return Math.min(domain.max, domain.min + steps * domain.step);
}

/** Choosing a model keeps the values it can use and moves the rest to its nearest offer. */
export function settingsForProfile(profile: CapabilityProfile, content: DraftContent): DraftContent["settings"] {
  const previous = content.settings.parameters;
  const retained = (name: string): ParameterValue | undefined => {
    if (previous[name] !== undefined) return previous[name];
    const role = settingRole(name);
    return role ? Object.entries(previous).find(([key]) => settingRole(key) === role)?.[1] : undefined;
  };
  const parameters: DraftContent["settings"]["parameters"] = {};
  for (const [name, policy] of Object.entries(profile.parameters)) {
    if (policy.policy === "fixed") parameters[name] = policy.value;
    else if (policy.policy === "editable") parameters[name] = fit(retained(name), policy.domain, policy.defaultValue);
  }
  return { profileId: profile.id, profileRevision: profile.revision, parameters: withConstraints(profile, parameters), outputCount: content.settings.outputCount };
}

/** A chosen value moves the settings it constrains to their nearest allowed value. */
export function withConstraints(profile: CapabilityProfile, parameters: DraftContent["settings"]["parameters"]): DraftContent["settings"]["parameters"] {
  const next = { ...parameters };
  for (const constraint of profile.constraints) {
    if (next[constraint.parameter] !== constraint.equals) continue;
    for (const [name, allowed] of Object.entries(constraint.requires)) if (name in next) next[name] = nearest(next[name], allowed, allowed[0] ?? constraint.equals);
  }
  return next;
}

/** A new action has not chosen a model for itself yet. */
export function settingsForAction(content: DraftContent): DraftContent["settings"] {
  return { ...content.settings, profileId: "unselected", profileRevision: "unresolved" };
}
