import type { CapabilityProfile, ParameterPolicy, ParameterValue } from "@shared/schemas/workflow/capability.schemas";
import type { DraftContent, DraftInput } from "@shared/schemas/workflow/draft.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";

const ORDER = ["aspectRatio", "aspect_ratio", "shape", "duration", "durationSeconds", "resolution", "generateAudio", "audio", "sound"];
export function orderedParameters(profile: CapabilityProfile): [string, ParameterPolicy][] {
  return Object.entries(profile.parameters).sort(([a], [b]) => {
    const rank = (name: string): number => { const index = ORDER.indexOf(name); return index < 0 ? ORDER.length : index; };
    return rank(a) - rank(b);
  });
}

/** The composer exposes creation choices, not adapter serialization settings. */
export function visibleParameters(profile: CapabilityProfile): [string, ParameterPolicy][] {
  return orderedParameters(profile).filter(([name]) => ORDER.includes(name));
}

/** Saved choices remain readable while their model cannot be resolved. */
export function visibleSavedParameters(parameters: DraftContent["settings"]["parameters"]): [string, ParameterValue][] {
  return Object.entries(parameters).filter(([name]) => ORDER.includes(name)).sort(([a], [b]) => ORDER.indexOf(a) - ORDER.indexOf(b));
}

type EditableParameter = Extract<ParameterPolicy, { policy: "editable" }>;
type ParameterRange = Extract<EditableParameter["domain"], { kind: "range" }>;
export interface PreModelParameterChoices { values: ParameterValue[]; ranges: ParameterRange[]; }

function inRange(value: ParameterValue, range: ParameterRange): boolean {
  return typeof value === "number" && value >= range.min && value <= range.max && Math.abs((value - range.min) / range.step - Math.round((value - range.min) / range.step)) < 1e-8;
}

function acceptsCurrentInputs(profile: CapabilityProfile, content: DraftContent, media: MediaVersion[]): boolean {
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

/** Preferences have declared candidate witnesses; they do not resolve or qualify a request. */
export function preModelParameterChoices(profiles: CapabilityProfile[], content: DraftContent, media: MediaVersion[], name: string): PreModelParameterChoices {
  const choices: PreModelParameterChoices = { values: [], ranges: [] };
  if (content.settings.profileId !== "unselected") return choices;
  const add = (value: ParameterValue): void => { if (!choices.values.includes(value)) choices.values.push(value); };
  for (const profile of profiles) {
    if (profile.action !== content.action || profile.availability !== "qualified" || !acceptsCurrentInputs(profile, content, media)) continue;
    const policy = profile.parameters[name];
    if (policy?.policy !== "editable" || (/audio|sound/i.test(name) && profile.generatedAudio === "unsupported")) continue;
    const restrictions = profile.constraints.flatMap(constraint => {
      const values = constraint.requires[name];
      return content.settings.parameters[constraint.parameter] === constraint.equals && values ? [values] : [];
    });
    const domain = policy.domain;
    if (domain.kind === "enum") {
      for (const value of allowedParameterValues(profile, content, name) ?? []) add(value);
    } else if (restrictions.length) {
      for (const value of restrictions[0] ?? []) if (inRange(value, domain) && restrictions.every(values => values.includes(value))) add(value);
    } else if (!choices.ranges.some(range => range.min === domain.min && range.max === domain.max && range.step === domain.step)) {
      choices.ranges.push({ ...domain });
    }
  }
  return choices;
}

type OutputKind = CapabilityProfile["output"]["kind"];
const OUTPUT_NOUN: Record<OutputKind, string> = { image: "image", video: "video", text: "response", file: "file" };

export function parameterName(name: string, outputKind?: OutputKind): string {
  if (name === "outputCount") return outputKind ? `${OUTPUT_NOUN[outputKind]}s`.replace(/^./, value => value.toUpperCase()) : "Results";
  if (/aspect|shape/i.test(name)) return "Shape";
  if (/duration/i.test(name)) return "Duration";
  if (/audio|sound/i.test(name)) return "Sound";
  if (/frame.?rate|fps/i.test(name)) return "Frame rate";
  if (/num.?frames|frame.?count/i.test(name)) return "Frames";
  return name.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/^./, value => value.toUpperCase());
}

export function parameterLabel(name: string, value: ParameterValue, outputKind?: OutputKind): string {
  if (value === "match_input_image") return "Same as picture";
  if (name === "outputFormat" && value === "webp") return "WebP";
  if (name === "outputCount") return `${String(value)} ${outputKind ? OUTPUT_NOUN[outputKind] : "result"}${value === 1 ? "" : "s"}`;
  if (/audio|sound/i.test(name) && typeof value === "boolean") return value ? "Sound on" : "Sound off";
  if (/duration/i.test(name) && typeof value === "number") return `${value}s`;
  if (/fps|frame.?rate/i.test(name)) return `${String(value)} fps`;
  return String(value);
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
    if (policy.policy === "fixed" && value !== policy.value) problems.push(`${parameterName(name)} must be ${parameterLabel(name, policy.value)} for this model.`);
    if (policy.policy === "editable") {
      const domain = policy.domain;
      const valid = domain.kind === "enum" ? domain.values.includes(value) : typeof value === "number" && value >= domain.min && value <= domain.max && Math.abs((value - domain.min) / domain.step - Math.round((value - domain.min) / domain.step)) < 1e-8;
      if (!valid) problems.push(`Choose an available ${parameterName(name).toLowerCase()} for this model.`);
    }
    if (policy.policy === "unsupported" || policy.policy === "unknown") problems.push(policy.reason);
  }
  for (const constraint of profile.constraints) {
    if (content.settings.parameters[constraint.parameter] === constraint.equals && Object.entries(constraint.requires).some(([name, values]) => !values.includes(content.settings.parameters[name] ?? ""))) problems.push(constraint.reason);
  }
  for (const input of content.inputs) {
    if (!profile.inputs.some(rule => rule.role === input.role)) problems.push(`This model does not use the ${input.role.replaceAll("-", " ")} input. Choose another action or remove it.`);
  }
  return [...new Set(problems)];
}

/** Intersect declared constraints without altering the retained selection. */
export function allowedParameterValues(profile: CapabilityProfile, content: DraftContent, name: string): ParameterValue[] | undefined {
  const policy = profile.parameters[name];
  if (policy?.policy !== "editable" || policy.domain.kind !== "enum") return undefined;
  let values = [...policy.domain.values];
  for (const constraint of profile.constraints) {
    const allowed = constraint.requires[name];
    if (content.settings.parameters[constraint.parameter] === constraint.equals && allowed) values = values.filter(value => allowed.includes(value));
  }
  return values;
}

function list(values: ParameterValue[]): string {
  return values.length < 2 ? String(values[0] ?? "") : `${values.slice(0, -1).join(", ")} or ${String(values.at(-1))}`;
}

export function parameterDescription(profile: CapabilityProfile | undefined, name: string, value: ParameterValue): string | undefined {
  if (/aspect|shape/i.test(name) && typeof value === "string") return value === "16:9" ? "Landscape" : value === "9:16" ? "Portrait" : value === "1:1" ? "Square" : undefined;
  if (!profile || !/resolution/i.test(name)) return undefined;
  const constrained = profile.constraints.find(rule => rule.parameter === name && rule.equals === value);
  const duration = constrained && Object.entries(constrained.requires).find(([key]) => /duration/i.test(key))?.[1];
  if (duration?.length) return `${list(duration)} seconds required`;
  const durationPolicy = Object.entries(profile.parameters).find(([key]) => /duration/i.test(key))?.[1];
  return durationPolicy?.policy === "editable" && durationPolicy.domain.kind === "enum" ? `${list(durationPolicy.domain.values)} seconds` : undefined;
}

/** Capability copy is derived from supplied qualified offers, without adding modes by model name. */
export function modelCapabilityDescription(profile: CapabilityProfile, profiles: CapabilityProfile[]): string {
  if (profile.availability !== "qualified") return profile.unavailableReason ?? "Currently unavailable";
  const required = profile.inputs.find(input => input.minCount > 0 && input.kinds.includes("image"));
  if (required) return `${required.role === "end-frame" ? "End image" : "Start image"} required · ${profile.generatedAudio === "unsupported" ? "no generated sound" : profile.generatedAudio === "unknown" ? "sound not confirmed" : "sound generated"}`;
  if (profile.generatedAudio === "unsupported") return `${profile.output.kind === "video" ? "Text to video" : "Picture generation"} · no generated sound`;
  const family = profiles.filter(other => other.provider === profile.provider && other.label === profile.label && other.availability === "qualified");
  const modes: string[] = [];
  if (family.some(other => /text/i.test(other.mode) && other.inputs.every(input => input.minCount === 0))) modes.push("text");
  if (family.some(other => other.inputs.some(input => input.kinds.includes("image")))) modes.push("images");
  if (family.some(other => other.action === "extend-video")) modes.push("extension");
  const kinds = modes.length > 1 ? `${modes.slice(0, -1).join(", ")} and ${modes.at(-1)}` : modes[0];
  const sound = profile.generatedAudio === "always" ? "Sound included" : profile.generatedAudio === "optional" ? "Optional sound" : "Sound not confirmed";
  return kinds ? `${sound} · ${kinds}` : sound;
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
    if (profile.action === "extend-video" && version.metadata.state === "verified" && ((rule.maxDurationSeconds !== undefined && version.metadata.durationSeconds > rule.maxDurationSeconds) || (rule.minDurationSeconds !== undefined && version.metadata.durationSeconds < rule.minDurationSeconds))) return { tone: "warning", message: `${profile.label} cannot extend this clip`, kind: "extension-ineligible" };
  }
  if (profile.inputs.some(rule => rule.role === "start-frame" && rule.minCount > content.inputs.filter(input => input.role === rule.role).length)) return { tone: "warning", message: "Add a start image" };
  const parameters = content.settings.parameters;
  const duration = Object.entries(profile.parameters).find(([name]) => /duration/i.test(name));
  if (profile.action === "extend-video" && duration?.[1].policy === "fixed" && typeof duration[1].value === "number") {
    const input = content.inputs.find(candidate => candidate.state === "resolved" && (candidate.role === "clip" || candidate.role === "primary"));
    const version = input?.state === "resolved" ? media.find(candidate => candidate.id === input.versionId) : undefined;
    if (version?.metadata.state === "verified") return { tone: "hint", message: `This adds ${duration[1].value} seconds to your ${version.metadata.durationSeconds}-second clip.` };
  }
  if (content.inputs.some(input => input.role === "reference") && duration?.[1].policy === "fixed") return { tone: "hint", message: `Reference images use ${String(duration[1].value)} seconds.` };
  if ((profile.action === "make-video" || profile.action === "animate-image") && content.inputs.some(input => input.state === "resolved" && media.some(version => version.id === input.versionId && version.origin.kind === "frame"))) return { tone: "hint", message: "Make a new clip from the chosen frame." };
  for (const constraint of profile.constraints) {
    if (parameters[constraint.parameter] !== constraint.equals || !/resolution/i.test(constraint.parameter)) continue;
    const required = Object.entries(constraint.requires).find(([name]) => /duration/i.test(name));
    if (required?.[1].length === 1 && required[1].includes(parameters[required[0]] ?? "")) return { tone: "hint", message: `${parameterLabel(constraint.parameter, constraint.equals)} uses ${String(required[1][0])} seconds.` };
  }
  const frames = parameters.numFrames;
  const rate = parameters.framesPerSecond;
  const framePolicy = profile.parameters.numFrames;
  if (typeof frames === "number" && typeof rate === "number" && framePolicy?.policy === "editable" && frames !== framePolicy.defaultValue) return { tone: "hint", message: `${frames} frames at ${rate} fps.` };
  return undefined;
}

export function modelInputLabel(role: DraftInput["role"], profile?: CapabilityProfile, version?: MediaVersion): string {
  if (role === "audio") return version?.label ?? "Audio";
  if (role === "clip" || role === "primary" && (profile?.action === "extend-video" || profile?.inputs.some(rule => rule.role === "primary" && rule.kinds.includes("video")))) return "Extending";
  const labels: Partial<Record<DraftInput["role"], string>> = { "start-frame": "Start frame", "end-frame": "End frame", reference: "Reference", primary: "Start frame", mask: "Area" };
  return labels[role] ?? role;
}

