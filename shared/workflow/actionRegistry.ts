import type {
  CapabilityProfile,
  ParameterPolicy,
  ParameterPresentation,
  ParameterRole,
  WordsPolicy,
} from "../schemas/workflow/capability.schemas";
import type { CreationAction, DraftInput } from "../schemas/workflow/draft.schemas";

/** What the composer's one switch makes (Rule 3). */
export type ComposerOutput = "video" | "image" | "voiceover" | "music";
/** Rail tools that change existing media in the same composer. */
export type ComposerTool = "upscale" | "reframe" | "captions";
/** Where a result lands in the feed, Focus and library. */
export type ResultGroup = "picture" | "clip" | "audio" | "text";
/** The composer place an action belongs to; actions sharing a place are chosen by their inputs. */
export type ComposerPlace =
  | { kind: "output"; output: ComposerOutput }
  | { kind: "tool"; tool: ComposerTool }
  | { kind: "words" }
  | { kind: "none" };
/** One chip in an action's fixed core row (Rule 6). */
export type CoreChip = "model" | ParameterRole | "count";

/** The button a result of an accepted kind shows, and the input role it binds the result to. */
export interface ResultVerb {
  label: string;
  role: DraftInput["role"];
}

export interface ActionEntry {
  /** The primary button. */
  label: string;
  /** What one result is called on its count chip and feed line: "2 takes", "4 images". */
  resultNoun: string;
  /** The in-progress words in the feed. */
  running: string;
  group: ResultGroup;
  place: ComposerPlace;
  /** The action's words; a profile may declare its own. */
  words: WordsPolicy;
  placeholder?: string;
  coreChips: readonly CoreChip[];
  verb?: ResultVerb;
  /** The verb's input is the request's subject: it stays alone in the input row, with no add-cells beside it. */
  changesSource?: boolean;
}

const PICTURE_CHIPS = ["model", "shape", "resolution", "count"] as const;
const CLIP_CHIPS = ["model", "shape", "duration", "resolution", "sound", "count"] as const;
const video = { kind: "output", output: "video" } as const;
const image = { kind: "output", output: "image" } as const;
const words = { kind: "words" } as const;
const none = { kind: "none" } as const;

/** Every catalog action. Adding an action is one entry here plus its profiles. */
export const ACTION_REGISTRY: Readonly<Record<CreationAction, ActionEntry>> = {
  "make-image": { label: "Make image", resultNoun: "image", running: "Making your image", group: "picture", place: image, words: "required", placeholder: "What would you like to make?", coreChips: PICTURE_CHIPS },
  "edit-image": { label: "Edit image", resultNoun: "image", running: "Editing your image", group: "picture", place: image, words: "required", placeholder: "Describe a change…", coreChips: PICTURE_CHIPS, verb: { label: "Edit", role: "primary" }, changesSource: true },
  "upscale-image": { label: "Upscale image", resultNoun: "image", running: "Upscaling your image", group: "picture", place: { kind: "tool", tool: "upscale" }, words: "none", coreChips: ["model", "scale"], verb: { label: "Upscale", role: "primary" }, changesSource: true },
  "make-video": { label: "Make video", resultNoun: "clip", running: "Making your video", group: "clip", place: video, words: "required", placeholder: "Describe your video…", coreChips: CLIP_CHIPS },
  "animate-image": { label: "Make video", resultNoun: "clip", running: "Making your video", group: "clip", place: video, words: "required", placeholder: "Describe your video…", coreChips: CLIP_CHIPS, verb: { label: "Animate", role: "start-frame" } },
  "edit-video": { label: "Edit clip", resultNoun: "clip", running: "Editing your clip", group: "clip", place: video, words: "required", placeholder: "Describe a change…", coreChips: CLIP_CHIPS, verb: { label: "Edit", role: "clip" }, changesSource: true },
  "extend-video": { label: "Extend clip", resultNoun: "clip", running: "Extending your clip", group: "clip", place: video, words: "required", placeholder: "Describe what happens next…", coreChips: CLIP_CHIPS, verb: { label: "Extend", role: "clip" } },
  "upscale-video": { label: "Upscale clip", resultNoun: "clip", running: "Upscaling your clip", group: "clip", place: { kind: "tool", tool: "upscale" }, words: "none", coreChips: ["model", "scale"], verb: { label: "Upscale", role: "clip" }, changesSource: true },
  "reframe-video": { label: "Reframe clip", resultNoun: "clip", running: "Reframing your clip", group: "clip", place: { kind: "tool", tool: "reframe" }, words: "optional", placeholder: "Describe what fills the new space", coreChips: ["model", "shape"], verb: { label: "Reframe", role: "clip" }, changesSource: true },
  "make-voiceover": { label: "Make voiceover", resultNoun: "take", running: "Making your voiceover", group: "audio", place: { kind: "output", output: "voiceover" }, words: "script", placeholder: "Write the script…", coreChips: ["model", "voice", "count"] },
  "make-music": { label: "Make music", resultNoun: "take", running: "Making your music", group: "audio", place: { kind: "output", output: "music" }, words: "required", placeholder: "Describe the music…", coreChips: ["model", "duration", "count"] },
  transcribe: { label: "Make captions", resultNoun: "captions", running: "Making captions", group: "text", place: { kind: "tool", tool: "captions" }, words: "none", coreChips: ["model", "language"], verb: { label: "Make captions", role: "primary" }, changesSource: true },
  ask: { label: "Ask", resultNoun: "answer", running: "Thinking", group: "text", place: words, words: "required", placeholder: "Ask about your words…", coreChips: [] },
  "expand-description": { label: "Expand description", resultNoun: "description", running: "Expanding your description", group: "text", place: words, words: "required", coreChips: [] },
  "improve-words": { label: "Improve wording", resultNoun: "wording", running: "Improving your words", group: "text", place: words, words: "required", coreChips: [] },
  import: { label: "Import", resultNoun: "file", running: "Importing", group: "picture", place: none, words: "none", coreChips: [] },
  "accept-sketch": { label: "Use sketch", resultNoun: "image", running: "Saving your sketch", group: "picture", place: none, words: "none", coreChips: [] },
  "export-video": { label: "Export", resultNoun: "video", running: "Exporting", group: "clip", place: none, words: "none", coreChips: [] },
};

/** The switch, Video first (Rule 3). */
export const COMPOSER_OUTPUTS: ReadonlyArray<{ output: ComposerOutput; label: string; action: CreationAction }> = [
  { output: "video", label: "Video", action: "make-video" },
  { output: "image", label: "Image", action: "make-image" },
  { output: "voiceover", label: "Voiceover", action: "make-voiceover" },
  { output: "music", label: "Music", action: "make-music" },
];

/** Rail tools after Sketch; each opens on the action its first input kind decides. */
export const COMPOSER_TOOLS: ReadonlyArray<{ tool: ComposerTool; label: string; action: CreationAction }> = [
  { tool: "upscale", label: "Upscale", action: "upscale-image" },
  { tool: "reframe", label: "Reframe", action: "reframe-video" },
  { tool: "captions", label: "Captions", action: "transcribe" },
];

export function actionEntry(action: CreationAction): ActionEntry {
  return ACTION_REGISTRY[action];
}

function placeKey(place: ComposerPlace): string {
  return place.kind === "output" ? `output:${place.output}` : place.kind === "tool" ? `tool:${place.tool}` : place.kind;
}

/** Actions one composer place switches between as its inputs change: a start frame makes Video animate. */
export function placeActions(action: CreationAction): CreationAction[] {
  const place = ACTION_REGISTRY[action].place;
  if (place.kind !== "output" && place.kind !== "tool") return [action];
  const key = placeKey(place);
  return (Object.keys(ACTION_REGISTRY) as CreationAction[]).filter(candidate => placeKey(ACTION_REGISTRY[candidate].place) === key);
}

/** The switch output an action belongs to, if any. */
export function composerOutput(action: CreationAction): ComposerOutput | undefined {
  const place = ACTION_REGISTRY[action].place;
  return place.kind === "output" ? place.output : undefined;
}

/** The rail tool an action belongs to, if any. */
export function composerTool(action: CreationAction): ComposerTool | undefined {
  const place = ACTION_REGISTRY[action].place;
  return place.kind === "tool" ? place.tool : undefined;
}

/** Words follow the profile; a profile captured before it declared them falls back to its action. */
export function wordsPolicy(action: CreationAction, profile?: Pick<CapabilityProfile, "presentation">): WordsPolicy {
  return profile?.presentation?.words ?? ACTION_REGISTRY[action].words;
}

export function parameterPresentation(profile: Pick<CapabilityProfile, "presentation">, name: string): ParameterPresentation | undefined {
  return profile.presentation?.parameters[name];
}

/** The role a profile declares for a setting. The composer never guesses one from a name. */
export function parameterRole(profile: Pick<CapabilityProfile, "presentation">, name: string): ParameterRole | undefined {
  return profile.presentation?.parameters[name]?.role;
}

/** The profile's setting for one role, if it has one. */
export function roleParameter(profile: CapabilityProfile, role: ParameterRole): [string, ParameterPolicy] | undefined {
  return Object.entries(profile.parameters).find(([name]) => parameterRole(profile, name) === role);
}

/** Everything without a role that a creator can choose, in declared order; this is Advanced. */
export function advancedParameters(profile: CapabilityProfile): [string, Extract<ParameterPolicy, { policy: "editable" }>][] {
  return Object.entries(profile.parameters).flatMap(([name, policy]): [string, Extract<ParameterPolicy, { policy: "editable" }>][] => {
    const shown = profile.presentation?.parameters[name];
    return policy.policy === "editable" && shown && !shown.role && !shown.hidden ? [[name, policy]] : [];
  });
}

export interface OfferedVerb extends ResultVerb {
  action: CreationAction;
}

/** Verbs on a result come from the qualified profiles that accept its kind in the verb's role (Rule 8). */
export function resultVerbs(kind: "image" | "video" | "audio", profiles: readonly CapabilityProfile[]): OfferedVerb[] {
  const verbs: OfferedVerb[] = [];
  for (const action of Object.keys(ACTION_REGISTRY) as CreationAction[]) {
    const verb = ACTION_REGISTRY[action].verb;
    if (!verb || verbs.some(offered => offered.label === verb.label)) continue;
    const accepts = profiles.some(profile => profile.action === action && profile.availability === "qualified" && profile.inputs.some(rule => rule.role === verb.role && rule.kinds.includes(kind)));
    if (accepts) verbs.push({ ...verb, action });
  }
  return verbs;
}
