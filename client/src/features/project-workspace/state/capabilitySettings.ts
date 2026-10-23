import {
  isParameterValueInDomain,
  type CapabilityProfile,
  type ParameterPolicy,
  type ParameterRangeDomain,
  type ParameterRole,
  type ParameterValue,
} from "@shared/schemas/workflow/capability.schemas";
import type { CreationAction, DraftContent, DraftInput } from "@shared/schemas/workflow/draft.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import {
  allowedParameterValues,
  settingsForAction,
  settingsForProfile,
  withConstraints,
} from "@shared/workflow/capabilityEvaluation";
import { actionEntry, parameterPresentation, parameterRole, placeActions, roleParameter, type CoreChip } from "@shared/workflow/actionRegistry";
import { languageName } from "./languages";

export { allowedParameterValues, settingsForAction, settingsForProfile, withConstraints };

const ROLE_LABELS: Record<ParameterRole, string> = { shape: "Shape", duration: "Duration", resolution: "Resolution", sound: "Sound", voice: "Voice", language: "Language", scale: "Scale" };
export function roleLabel(role: ParameterRole): string {
  return ROLE_LABELS[role];
}

/** The profile's own name for a setting; captured profiles without presentation fall back to the key. */
export function settingLabel(profile: Pick<CapabilityProfile, "presentation"> | undefined, name: string): string {
  const shown = profile ? parameterPresentation(profile, name) : undefined;
  if (shown) return shown.label;
  if (name === "outputCount") return "Results";
  return name.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/^./, value => value.toUpperCase());
}

/** How one value reads on its chip or field: a declared name, Auto, or the declared number format. */
export function valueLabel(profile: Pick<CapabilityProfile, "presentation"> | undefined, name: string, value: ParameterValue): string {
  const shown = profile ? parameterPresentation(profile, name) : undefined;
  const named = shown?.values?.[String(value)];
  if (named) return named;
  if (shown?.auto !== undefined && value === shown.auto) return "Auto";
  if (value === "match_input_image") return "Same as picture";
  if (typeof value === "boolean") return shown?.role === "sound" ? (value ? "Sound on" : "Sound off") : value ? "On" : "Off";
  if (typeof value === "number") {
    if (shown?.format === "fraction") return `${Math.round(value * 100)}%`;
    if (shown?.format === "percent") return `${value}%`;
    if (shown?.format === "seconds") return `${value}s`;
    if (shown?.format === "fps") return `${value} fps`;
    if (shown?.format === "times") return `${value.toFixed(1)}x`;
  }
  if (shown?.format === "language" && typeof value === "string") return languageName(value);
  return String(value);
}

/** "1 clip", "4 images", "2 takes". */
export function countLabel(action: CreationAction, count: number): string {
  const noun = actionEntry(action).resultNoun;
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export interface CoreChipEntry {
  chip: Exclude<CoreChip, "model" | "count">;
  name?: string;
  policy?: ParameterPolicy;
}

/** The action's fixed core row (Rule 6): each role keeps its slot whether or not this model has the setting. */
export function coreChipEntries(action: CreationAction, profile: CapabilityProfile | undefined): CoreChipEntry[] {
  return actionEntry(action).coreChips.flatMap((chip): CoreChipEntry[] => {
    if (chip === "model" || chip === "count") return [];
    const found = profile ? roleParameter(profile, chip) : undefined;
    return [found ? { chip, name: found[0], policy: found[1] } : { chip }];
  });
}

export interface SettingOption { value: ParameterValue; enabled: boolean; }
/** Values other models of the same place offer for the role stay listed but unavailable, so a menu keeps its shape across models. */
export function settingOptions(profile: CapabilityProfile, profiles: readonly CapabilityProfile[], content: DraftContent, name: string): SettingOption[] | undefined {
  const policy = profile.parameters[name];
  if (policy?.policy !== "editable" || policy.domain.kind !== "enum") return undefined;
  const allowed = allowedParameterValues(profile, content, name) ?? [];
  const role = parameterRole(profile, name);
  const values = [...policy.domain.values];
  if (role && role !== "sound") {
    const actions = placeActions(profile.action);
    for (const other of profiles) {
      if (!actions.includes(other.action)) continue;
      const found = roleParameter(other, role);
      if (found?.[1].policy !== "editable" || found[1].domain.kind !== "enum") continue;
      for (const value of found[1].domain.values) if (!values.includes(value)) values.push(value);
    }
  }
  if (values.every(value => typeof value === "number")) values.sort((a, b) => Number(a) - Number(b));
  return values.map(value => ({ value, enabled: allowed.includes(value) }));
}

export interface PreModelParameterChoices { name: string | undefined; values: ParameterValue[]; ranges: ParameterRangeDomain[]; }

export function acceptsCurrentInputs(profile: CapabilityProfile, content: DraftContent, media: MediaVersion[]): boolean {
  for (const rule of profile.inputs) {
    const count = content.inputs.filter(input => input.role === rule.role).length;
    if (count < rule.minCount || count > rule.maxCount) return false;
  }
  return content.inputs.every(input => {
    const rule = profile.inputs.find(candidate => candidate.role === input.role);
    if (!rule || input.state !== "resolved") return false;
    const version = media.find(candidate => candidate.id === input.versionId && candidate.projectId === content.destination.projectId);
    const kind = version?.kind === "export" ? "video" : version?.kind;
    if (!version || !kind || !rule.kinds.some(allowed => allowed === kind)) return false;
    if (rule.maxBytes !== undefined && (version.object.identity !== "verified" || version.object.bytes > rule.maxBytes)) return false;
    if (rule.minDurationSeconds !== undefined || rule.maxDurationSeconds !== undefined) {
      if (version.metadata.state !== "verified") return false;
      if (version.metadata.durationSeconds < (rule.minDurationSeconds ?? 0) || version.metadata.durationSeconds > (rule.maxDurationSeconds ?? Infinity)) return false;
    }
    return true;
  });
}

/** What is attached fits the model: each input has a role it takes, within its counts, kinds and limits. Inputs still to add do not count against it. */
function takesAttachedInputs(profile: CapabilityProfile, content: DraftContent, media: MediaVersion[]): boolean {
  const attached = (role: DraftInput["role"]): number => content.inputs.filter(input => input.role === role).length;
  return acceptsCurrentInputs({ ...profile, inputs: profile.inputs.map(rule => ({ ...rule, minCount: Math.min(rule.minCount, attached(rule.role)) })) }, content, media);
}

/** Auto's candidates: the action's qualified models that can take what is attached (Rule 5). The inputs already chose the action. */
export function autoCandidates(profiles: readonly CapabilityProfile[], content: DraftContent, media: MediaVersion[]): CapabilityProfile[] {
  return profiles.filter(profile => profile.action === content.action && profile.availability === "qualified" && takesAttachedInputs(profile, content, media));
}

/** Auto's chip for one role offers what its candidates offer; preparation still needs one exact model. */
export function preModelParameterChoices(profiles: readonly CapabilityProfile[], content: DraftContent, media: MediaVersion[], role: ParameterRole): PreModelParameterChoices {
  const choices: PreModelParameterChoices = { name: undefined, values: [], ranges: [] };
  const add = (value: ParameterValue): void => { if (!choices.values.includes(value)) choices.values.push(value); };
  for (const profile of autoCandidates(profiles, content, media)) {
    const found = roleParameter(profile, role);
    if (found?.[1].policy !== "editable") continue;
    const [name, policy] = found;
    choices.name ??= name;
    const domain = policy.domain;
    if (domain.kind === "enum") for (const value of allowedParameterValues(profile, content, name) ?? []) add(value);
    else if (domain.kind === "range" && !choices.ranges.some(range => range.min === domain.min && range.max === domain.max && range.step === domain.step)) choices.ranges.push({ ...domain });
  }
  if (choices.values.every(value => typeof value === "number")) choices.values.sort((a, b) => Number(a) - Number(b));
  return choices;
}

/** Auto keeps the core values its first candidate would start with, so its chips read like a model's. */
export function autoSettings(content: DraftContent, action: CreationAction, profiles: readonly CapabilityProfile[], media: MediaVersion[] = []): DraftContent["settings"] {
  const settings = settingsForAction(content);
  const target = { ...content, action, settings };
  const candidates = autoCandidates(profiles, target, media);
  const parameters: DraftContent["settings"]["parameters"] = {};
  for (const entry of coreChipEntries(action, candidates[0])) {
    if (!entry.name || entry.policy?.policy !== "editable") continue;
    const previous = content.settings.parameters[entry.name];
    parameters[entry.name] = previous !== undefined && isParameterValueInDomain(entry.policy.domain, previous) ? previous : entry.policy.defaultValue;
  }
  const maxCount = Math.max(1, ...candidates.map(candidate => candidate.output.maxCount));
  return { ...settings, parameters, outputCount: Math.max(1, Math.min(content.settings.outputCount, maxCount)) };
}

/** Make resolves Auto to one exact model: the first candidate that offers every chosen value, else the first that takes the inputs. */
export function resolveAuto(content: DraftContent, profiles: readonly CapabilityProfile[], media: MediaVersion[]): CapabilityProfile | undefined {
  const candidates = autoCandidates(profiles, content, media).filter(profile => acceptsCurrentInputs(profile, content, media));
  const offers = (profile: CapabilityProfile): boolean => profile.output.maxCount >= content.settings.outputCount && Object.entries(content.settings.parameters).every(([name, value]) => {
    const policy = profile.parameters[name];
    return policy?.policy === "editable" ? isParameterValueInDomain(policy.domain, value) : policy?.policy === "fixed" ? policy.value === value : false;
  });
  return candidates.find(offers) ?? candidates[0];
}

export function derivedParameter(policy: Extract<ParameterPolicy, { policy: "derived" }>, content: DraftContent, media: MediaVersion[]): string {
  if (policy.from === "frame-duration") {
    const frames = content.settings.parameters.numFrames ?? content.settings.parameters.num_frames;
    const rate = content.settings.parameters.framesPerSecond ?? content.settings.parameters.frames_per_second;
    return typeof frames === "number" && typeof rate === "number" && rate > 0 ? `~${(frames / rate).toFixed(1)}s` : "From frames";
  }
  const input = content.inputs.find(candidate => candidate.state === "resolved" && (!policy.role || candidate.role === policy.role));
  const version = input?.state === "resolved" ? media.find(candidate => candidate.id === input.versionId) : undefined;
  if (!version || version.metadata.state !== "verified") return "From input";
  if (policy.from === "input-duration") return `${version.metadata.durationSeconds}s`;

  const { width, height } = version.metadata;
  if (!width || !height) return "From input";
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

/** Incompatibilities stay visible instead of silently rewriting the saved setup. */
export function capabilityProblems(profile: CapabilityProfile, content: DraftContent): string[] {
  const problems: string[] = [];
  for (const [name, policy] of Object.entries(profile.parameters)) {
    const value = content.settings.parameters[name];
    if (value === undefined) continue;
    if (policy.policy === "fixed" && value !== policy.value) problems.push(`${settingLabel(profile, name)} must be ${valueLabel(profile, name, policy.value)} for this model.`);
    if (policy.policy === "editable" && !isParameterValueInDomain(policy.domain, value)) {
      problems.push(`Choose an available ${settingLabel(profile, name).toLowerCase()} for this model.`);
    }
    if (policy.policy === "unsupported" || policy.policy === "unknown") problems.push(policy.reason);
  }
  for (const constraint of profile.constraints) {
    if (content.settings.parameters[constraint.parameter] === constraint.equals && Object.entries(constraint.requires).some(([name, values]) => !values.includes(content.settings.parameters[name] ?? ""))) problems.push(constraint.reason);
  }
  for (const input of content.inputs) {
    if (!profile.inputs.some(rule => rule.role === input.role)) problems.push(`This model does not use the ${input.role.replaceAll("-", " ")} input. Remove it or choose another model.`);
  }
  return [...new Set(problems)];
}

function list(values: ParameterValue[]): string {
  return values.length < 2 ? String(values[0] ?? "") : `${values.slice(0, -1).join(", ")} or ${String(values.at(-1))}`;
}

/** A shape's common name, or the durations a resolution allows. */
export function parameterDescription(profile: CapabilityProfile | undefined, name: string, value: ParameterValue, role = profile ? parameterRole(profile, name) : undefined): string | undefined {
  if (role === "shape" && typeof value === "string") return value === "16:9" ? "Landscape" : value === "9:16" ? "Portrait" : value === "1:1" ? "Square" : undefined;
  if (!profile || role !== "resolution") return undefined;
  const durationName = roleParameter(profile, "duration")?.[0];
  const constrained = profile.constraints.find(rule => rule.parameter === name && rule.equals === value);
  const duration = constrained && durationName ? constrained.requires[durationName] : undefined;
  if (duration?.length && duration.length <= 4) return `${list(duration)} seconds required`;
  return undefined;
}

export interface ModelCreationNotice {
  tone: "hint" | "warning" | "danger";
  message: string;
  kind?: "extension-ineligible";
}

/** Feedback follows the actual selected profile and immutable input metadata. */
export function modelCreationFeedback(profile: CapabilityProfile, content: DraftContent, media: MediaVersion[]): ModelCreationNotice | undefined {
  if (profile.availability !== "qualified") return { tone: "warning", message: profile.unavailableReason ?? "This model is currently unavailable." };
  for (const input of content.inputs) {
    const version = input.state === "resolved" ? media.find(candidate => candidate.id === input.versionId) : undefined;
    if (!version) continue;
    const kind = version.kind === "export" ? "video" : version.kind;
    const rule = profile.inputs.find(candidate => candidate.role === input.role);
    if (!rule || (kind !== "image" && kind !== "video" && kind !== "audio") || !rule.kinds.includes(kind)) return { tone: "danger", message: `${profile.label} cannot use ${kind === "audio" ? "audio files" : kind === "image" ? "this picture" : "this clip"}` };
    if (profile.action === "extend-video" && version.metadata.state === "verified" && version.metadata.contentType !== undefined && version.metadata.contentType !== "video/mp4") return { tone: "warning", message: `${profile.label} needs an MP4 clip`, kind: "extension-ineligible" };
    if (profile.action === "extend-video" && version.metadata.state === "verified" && ((rule.maxDurationSeconds !== undefined && version.metadata.durationSeconds > rule.maxDurationSeconds) || (rule.minDurationSeconds !== undefined && version.metadata.durationSeconds < rule.minDurationSeconds))) return { tone: "warning", message: `${profile.label} cannot extend this clip`, kind: "extension-ineligible" };
  }
  const duration = roleParameter(profile, "duration");
  if (profile.action === "extend-video" && duration?.[1].policy === "fixed" && typeof duration[1].value === "number") {
    const input = content.inputs.find(candidate => candidate.state === "resolved" && (candidate.role === "clip" || candidate.role === "primary"));
    const version = input?.state === "resolved" ? media.find(candidate => candidate.id === input.versionId) : undefined;
    if (version?.metadata.state === "verified") return { tone: "hint", message: `This adds ${duration[1].value} seconds to your ${version.metadata.durationSeconds}-second clip.` };
  }
  return undefined;
}

const INPUT_LABELS: Partial<Record<DraftInput["role"], string>> = { "start-frame": "Start frame", "end-frame": "End frame", reference: "Reference", mask: "Area", audio: "Audio" };

/** A tile's caption: what the input is for in the request it belongs to. */
export function modelInputLabel(role: DraftInput["role"], profile?: CapabilityProfile, version?: MediaVersion): string {
  if (role === "audio") return version?.label ?? "Audio";
  if (role === "clip" || role === "primary" && profile?.inputs.some(rule => rule.role === "primary" && rule.kinds.includes("video") && !rule.kinds.includes("image"))) return profile?.action === "extend-video" ? "Extending" : "Clip";
  if (role === "primary") return profile?.inputs.some(rule => rule.role === "primary" && rule.kinds.includes("audio")) ? version?.label ?? "Clip or audio" : "Picture";
  return INPUT_LABELS[role] ?? role;
}

export interface CapabilityDraftEvaluation {
  candidates: CapabilityProfile[];
  profile: CapabilityProfile | undefined;
  problems: string[];
  modelNotice: ModelCreationNotice | undefined;
  unsupportedSaved: string[];
  fixedConflicts: [string, Extract<ParameterPolicy, { policy: "fixed" }>][];
}

export function evaluateCapabilityDraft(
  profiles: CapabilityProfile[],
  content: DraftContent,
  media: MediaVersion[],
): CapabilityDraftEvaluation {
  const actions = placeActions(content.action);
  const candidates = profiles.filter(profile => actions.includes(profile.action));
  const profile = candidates.find(candidate => candidate.id === content.settings.profileId && candidate.action === content.action);
  const problems = profile ? capabilityProblems(profile, content) : [];
  const modelNotice = profile ? modelCreationFeedback(profile, content, media) : undefined;
  const unsupportedSaved = profile
    ? Object.keys(content.settings.parameters).filter(
        name => !(name in profile.parameters) || profile.parameters[name]?.policy === "unsupported",
      )
    : [];
  const fixedConflicts = profile
    ? Object.entries(profile.parameters).filter(
        (entry): entry is [string, Extract<ParameterPolicy, { policy: "fixed" }>] =>
          entry[1].policy === "fixed" &&
          content.settings.parameters[entry[0]] !== undefined &&
          content.settings.parameters[entry[0]] !== entry[1].value,
      )
    : [];
  return { candidates, profile, problems, modelNotice, unsupportedSaved, fixedConflicts };
}

/** A composer starts on the model last used for this action, else on Auto. */
export function settingsForOutput(content: DraftContent, action: CreationAction, profiles: readonly CapabilityProfile[], remembered?: DraftContent["settings"], media: MediaVersion[] = []): DraftContent["settings"] {
  const prior = remembered ? profiles.find(profile => profile.id === remembered.profileId && profile.action === action && profile.availability === "qualified") : undefined;
  if (!prior || !remembered) return autoSettings(content, action, profiles, media);
  const settings = settingsForProfile(prior, { ...content, settings: remembered });
  return { ...settings, outputCount: Math.max(1, Math.min(settings.outputCount, prior.output.maxCount)) };
}

