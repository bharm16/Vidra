import type { CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import type { CreationAction, DraftContent, DraftInput } from "@shared/schemas/workflow/draft.schemas";
import {
  DraftIdSchema,
  type ConversationId,
  type DraftId,
  type ProjectId,
  type VersionId,
} from "@shared/schemas/workflow/identity.schemas";
import { importedVersionId } from "@shared/schemas/workflow/import.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import type { AcceptedRequest } from "@shared/schemas/workflow/request.schemas";
import { canonicalJson } from "@shared/workflow/canonicalJson";
import { settingsForProfile } from "@shared/workflow/capabilityEvaluation";
import { COMPOSER_OUTPUTS, actionEntry, composerOutput, composerTool, placeActions } from "@shared/workflow/actionRegistry";

/** Deterministic across tabs/reloads, so a lost create response reuses the same empty draft. */
export async function initialDraftId(
  ownerId: string,
  projectId: string,
  conversationId: string,
  retiredDraftIds: string[],
): Promise<DraftId> {
  const bytes = new TextEncoder().encode(
    canonicalJson({
      version: "vidra-initial-draft/v1",
      ownerId,
      projectId,
      conversationId,
      retiredDraftIds: [...retiredDraftIds].sort(),
    }),
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  return DraftIdSchema.parse(`draft_initial_${hash}`);
}

export function emptyDraftContent(
  action: CreationAction,
  projectId: ProjectId,
  conversationId: ConversationId,
  projectInstructionsRevision: number,
  instructions = "",
): DraftContent {
  return {
    action,
    instructions,
    inputs: [],
    settings: { profileId: "unselected", profileRevision: "unresolved", parameters: {}, outputCount: 1 },
    context: { origin: "empty", requestIds: [], projectInstructionsRevision },
    destination: { projectId, conversationId },
  };
}

/** Ready import bytes may be displayed while the persisted draft keeps its import receipt. */
export function observedDraftInputs(inputs: DraftInput[], media: MediaVersion[]): DraftInput[] {
  return inputs.map(input => {
    if (input.state !== "importing") return input;
    const expectedVersionId = importedVersionId(input.importId);
    const version = media.find(
      candidate =>
        candidate.id === expectedVersionId &&
        candidate.object.identity === "verified" &&
        candidate.metadata.state === "verified",
    );
    return version ? { state: "resolved", role: input.role, versionId: version.id } : input;
  });
}

/** Replacing one reference must retain the other references and their order. */
export function bindDraftInput(
  inputs: DraftInput[],
  next: DraftInput,
  maxCount: number,
  replacing?: DraftInput,
): DraftInput[] {
  if (replacing) {
    const matches = inputs.flatMap((input, index) =>
      input === replacing || canonicalJson(input) === canonicalJson(replacing) ? [index] : [],
    );
    if (matches.length !== 1) return inputs;
    return inputs.map((input, index) => (index === matches[0] ? next : input));
  }
  const existing = inputs.filter(input => input.role === next.role);
  if (existing.some(input => canonicalJson(input) === canonicalJson(next))) return inputs;
  if (maxCount > 1) return existing.length < maxCount ? [...inputs, next] : inputs;
  const first = inputs.findIndex(input => input.role === next.role);
  const remaining = inputs.filter(input => input.role !== next.role);
  remaining.splice(first < 0 ? remaining.length : first, 0, next);
  return remaining;
}

export type DraftInputSource =
  | { state: "resolved"; versionId: VersionId; kind: "image" | "video" | "audio" }
  | { state: "importing"; importId: string; kind: "image" | "video" | "audio" };

/** Selects the appropriate input role for the active action/profile and binds or replaces the input. */
export function applyDraftInputSource(
  content: DraftContent,
  profiles: CapabilityProfile[],
  source: DraftInputSource,
  requestedRole?: DraftInput["role"],
  replacing?: DraftInput,
): DraftContent {
  const profile = profiles.find(candidate => candidate.id === content.settings.profileId);
  const candidates = candidateModels(content, profiles);
  const accepting = (rules: CapabilityProfile["inputs"]): CapabilityProfile["inputs"][number] | undefined => rules.find(rule => rule.minCount > 0 && rule.kinds.includes(source.kind)) ?? rules.find(rule => rule.kinds.includes(source.kind));
  // A model that takes no such input defers to the place's models that do: a picture becomes a words clip's start frame.
  const role =
    requestedRole ??
    accepting(profile?.inputs ?? [])?.role ??
    accepting(candidates.flatMap(candidate => candidate.inputs))?.role ??
    (source.kind === "video" ? "clip" : source.kind === "audio" ? "audio" : "reference");
  const rule = candidates
    .flatMap(candidate => candidate.inputs)
    .find(candidate => candidate.role === role && candidate.kinds.includes(source.kind));
  if (requestedRole && profile && !rule) return content;
  const nextInput: DraftInput =
    source.state === "resolved"
      ? { state: "resolved", role, versionId: source.versionId }
      : { state: "importing", role, importId: source.importId };
  const bound = bindDraftInput(
    content.inputs,
    nextInput,
    rule?.maxCount ?? (role === "reference" ? 16 : 1),
    replacing,
  );
  if (bound === content.inputs) return content;
  // A painted area is tied to the exact picture it was drawn on; another picture drops it rather than reusing its pixels.
  const inputs = role === "primary" ? bound.filter(input => input.role !== "mask") : bound;
  return settleModel({ ...content, inputs }, profiles);
}

const OFFERED_ROLES = ["primary", "start-frame", "end-frame", "reference", "clip", "audio"] as const satisfies readonly DraftInput["role"][];
export type OfferedInputRole = (typeof OFFERED_ROLES)[number];

const sameModel = (a: CapabilityProfile, b: CapabilityProfile): boolean => a.provider === b.provider && a.label === b.label;

/** Models that could serve the request, preferred first: the selected one, its other versions, then the output's other qualified models. */
function candidateModels(content: DraftContent, profiles: readonly CapabilityProfile[]): CapabilityProfile[] {
  const profile = profiles.find(candidate => candidate.id === content.settings.profileId);
  const actions = placeActions(content.action);
  const pool = profiles.filter(
    candidate => candidate !== profile && candidate.availability === "qualified" && actions.includes(candidate.action),
  );
  if (!profile) return pool;
  return [profile, ...pool.filter(candidate => sameModel(candidate, profile)), ...pool.filter(candidate => !sameModel(candidate, profile))];
}

function takesRoles(profile: CapabilityProfile, roles: readonly DraftInput["role"][]): boolean {
  return (
    roles.every(role => profile.inputs.some(rule => rule.role === role)) &&
    profile.inputs.every(rule => {
      const count = roles.filter(role => role === rule.role).length;
      return count >= rule.minCount && count <= rule.maxCount;
    })
  );
}

/** Inputs decide the model: when the selected one cannot take them, the first candidate that can takes over. */
export function settleModel(content: DraftContent, profiles: readonly CapabilityProfile[]): DraftContent {
  const roles = content.inputs.map(input => input.role);
  const profile = profiles.find(candidate => candidate.id === content.settings.profileId);
  if (profile && takesRoles(profile, roles)) return content;
  const next = candidateModels(content, profiles).find(candidate => candidate !== profile && takesRoles(candidate, roles));
  if (!next) return content;
  // Auto stays Auto: the inputs only choose which of the place's actions it serves.
  if (!profile && content.settings.profileId === "unselected") return next.action === content.action ? content : { ...content, action: next.action };
  return { ...content, action: next.action, settings: settingsForProfile(next, content, profile) };
}

/** Inputs the request can still take: some model for the place accepts each beside the current inputs (Rule 4). */
export function offeredInputRoles(content: DraftContent, profiles: readonly CapabilityProfile[]): OfferedInputRole[] {
  const candidates = candidateModels(content, profiles);
  const roles = content.inputs.map(input => input.role);
  return OFFERED_ROLES.filter(role =>
    candidates.some(
      candidate =>
        candidate.inputs.some(rule => rule.role === role) &&
        takesRoles(candidate, [...roles, role]),
    ),
  );
}

/** The kinds the picker offers for one role: what the place's models accept there. */
export function roleKinds(content: DraftContent, profiles: readonly CapabilityProfile[], role: DraftInput["role"]): Array<"image" | "video" | "audio"> {
  const kinds = new Set(candidateModels(content, profiles).flatMap(candidate => candidate.inputs.filter(rule => rule.role === role).flatMap(rule => rule.kinds)));
  return (["image", "video", "audio"] as const).filter(kind => kinds.has(kind));
}

function inputKind(input: DraftInput, media: readonly MediaVersion[], requests: readonly AcceptedRequest[]): "image" | "video" | "audio" | undefined {
  if (input.state === "resolved") {
    const version = media.find(candidate => candidate.id === input.versionId);
    return version?.kind === "export" ? "video" : version?.kind;
  }
  if (input.state === "importing") {
    const version = media.find(candidate => candidate.id === importedVersionId(input.importId));
    return version?.kind === "export" ? "video" : version?.kind;
  }
  const request = requests.find(candidate => candidate.id === input.requestId);
  const group = request ? actionEntry(request.snapshot.action).group : undefined;
  return group === "picture" ? "image" : group === "clip" ? "video" : group === "audio" ? "audio" : undefined;
}

export interface MovedInputs {
  inputs: DraftInput[];
  /** Inputs the new place cannot use; they stay in the row, greyed, and out of the request. */
  parked: DraftInput[];
}

/**
 * Rule 4 on a switch: each input moves to the role the new action's models use for its kind,
 * and an input none of them can take is parked rather than dropped.
 */
export function inputsForAction(inputs: readonly DraftInput[], action: CreationAction, profiles: readonly CapabilityProfile[], media: readonly MediaVersion[], requests: readonly AcceptedRequest[] = []): MovedInputs {
  const actions = placeActions(action);
  const rules = profiles.filter(profile => actions.includes(profile.action) && profile.availability === "qualified").flatMap(profile => profile.inputs);
  const moved: DraftInput[] = [];
  const parked: DraftInput[] = [];
  for (const input of inputs) {
    const kind = inputKind(input, media, requests);
    const fits = (role: DraftInput["role"]): boolean => rules.some(rule => rule.role === role && (kind === undefined || rule.kinds.includes(kind)) && moved.filter(other => other.role === role).length < rule.maxCount);
    const role = fits(input.role) ? input.role : rules.find(rule => kind !== undefined && rule.kinds.includes(kind) && fits(rule.role))?.role;
    if (role) moved.push({ ...input, role });
    else parked.push(input);
  }
  return { inputs: moved, parked };
}

/**
 * A result's verb binds the result into the working request in the verb's role (Rule 8):
 * the words stay, the result claims its role first, and the other inputs move or park as on a switch.
 */
export function inputsWithResult(inputs: readonly DraftInput[], action: CreationAction, versionId: VersionId, role: DraftInput["role"], profiles: readonly CapabilityProfile[], media: readonly MediaVersion[], requests: readonly AcceptedRequest[] = []): MovedInputs {
  const others = inputs.filter(input => input.state !== "resolved" || input.versionId !== versionId);
  return inputsForAction([{ state: "resolved", role, versionId }, ...others], action, profiles, media, requests);
}

export interface ModelChoice {
  /** The version chosen with this entry: one that takes the current inputs when the model has it. */
  profile: CapabilityProfile;
  selected: boolean;
  takesInputs: boolean;
}

/** One model menu entry per model name across the output; a model that cannot take the current inputs is greyed out. */
export function modelChoices(content: DraftContent, profiles: readonly CapabilityProfile[]): ModelChoice[] {
  const actions = placeActions(content.action);
  const roles = content.inputs.map(input => input.role);
  const models: CapabilityProfile[][] = [];
  for (const candidate of profiles) {
    if (!actions.includes(candidate.action)) continue;
    const versions = models.find(group => group.some(version => sameModel(version, candidate)));
    if (versions) versions.push(candidate);
    else models.push([candidate]);
  }
  return models.flatMap(versions => {
    const fitting = versions.filter(version => takesRoles(version, roles));
    const profile =
      fitting.find(version => version.action === content.action) ??
      fitting[0] ??
      versions.find(version => version.action === content.action) ??
      versions[0];
    if (!profile) return [];
    return [{ profile, selected: versions.some(version => version.id === content.settings.profileId), takesInputs: fitting.length > 0 }];
  });
}

/** Removes one input; the request moves to a model that takes what remains, such as a words clip once its start frame goes. */
export function withoutDraftInput(
  content: DraftContent,
  profiles: readonly CapabilityProfile[],
  input: DraftInput,
): DraftContent {
  return settleModel({ ...content, inputs: content.inputs.filter(candidate => candidate !== input) }, profiles);
}

/** Upgrades pending slot inputs to resolved version inputs once the target request slot completes and media is linked. */
export function resolvePendingDraftInputs(
  content: DraftContent,
  requests: AcceptedRequest[],
  media: MediaVersion[],
  ownerId: string,
  projectId: string,
): DraftContent {
  let changed = false;
  const inputs = content.inputs.map(input => {
    if (input.state !== "pending") return input;
    const request = requests.find(candidate => candidate.id === input.requestId);
    const slot = request?.slots.find(candidate => candidate.id === input.slotId);
    if (
      slot?.outcome !== "completed" ||
      !slot.versionId ||
      !media.some(
        version => version.id === slot.versionId && version.ownerId === ownerId && version.projectId === projectId,
      )
    ) {
      return input;
    }
    changed = true;
    return { role: input.role, state: "resolved" as const, versionId: slot.versionId };
  });
  return changed ? { ...content, inputs } : content;
}

export function wordsDraftContent(
  action: CreationAction,
  instructions: string,
  settings: DraftContent["settings"],
  projectId: ProjectId,
  conversationId: ConversationId,
  projectInstructionsRevision: number,
): DraftContent {
  return {
    action,
    instructions,
    inputs: [],
    settings,
    context: { origin: "empty", requestIds: [], projectInstructionsRevision },
    destination: { projectId, conversationId },
  };
}

/** A result's verb starts the same composer with the result bound in the verb's role (Rule 8). */
export function mediaActionDraftContent(
  action: CreationAction,
  versionId: VersionId,
  projectId: ProjectId,
  conversationId: ConversationId,
  projectInstructionsRevision: number,
  role: DraftInput["role"] = actionEntry(action).verb?.role ?? "primary",
): DraftContent {
  return {
    ...emptyDraftContent(action, projectId, conversationId, projectInstructionsRevision),
    inputs: [{ state: "resolved", role, versionId }],
  };
}

export function reuseDraftContent(
  request: AcceptedRequest,
  projectId: ProjectId,
  conversationId: ConversationId,
  variation = false,
): DraftContent {
  const parameters = { ...request.snapshot.settings.parameters };
  if (variation) delete parameters.seed;
  return {
    ...request.snapshot,
    settings: { ...request.snapshot.settings, parameters },
    destination: { projectId, conversationId },
  };
}

export function retrySlotDraftContent(
  request: AcceptedRequest,
  slot: AcceptedRequest["slots"][number],
): DraftContent {
  return {
    ...request.snapshot,
    settings: {
      ...request.snapshot.settings,
      outputCount: 1,
      parameters: {
        ...request.snapshot.settings.parameters,
        ...(slot.seed === undefined ? {} : { seed: slot.seed }),
      },
    },
  };
}

export function followupDraftForRequest(
  request: AcceptedRequest,
  profiles: CapabilityProfile[],
  projectId: ProjectId,
  conversationId: ConversationId,
  projectInstructionsRevision: number,
): { content: DraftContent; noticeKind?: "choose-result" | "edit-unavailable" } | undefined {
  const entry = actionEntry(request.snapshot.action);
  const imageAction = entry.group === "picture" && entry.place.kind !== "none";
  const followed = composerOutput(request.snapshot.action) ?? composerTool(request.snapshot.action);
  if (!followed) return undefined;
  const editProfile =
    imageAction && request.slots.length === 1
      ? profiles.find(
          candidate =>
            candidate.availability === "qualified" &&
            candidate.action === "edit-image" &&
            candidate.inputs.some(
              rule => rule.role === "primary" && rule.kinds.includes("image") && rule.minCount === 1 && rule.maxCount === 1,
            ),
        )
      : undefined;
  const parameters: DraftContent["settings"]["parameters"] = {};
  if (editProfile) {
    for (const [name, policy] of Object.entries(editProfile.parameters)) {
      if (policy.policy === "fixed") parameters[name] = policy.value;
      else if (policy.policy === "editable") parameters[name] = policy.defaultValue;
    }
  }
  const slot = request.slots[0];
  const content: DraftContent = {
    action: editProfile ? "edit-image" : imageAction ? "make-image" : COMPOSER_OUTPUTS.find(output => output.output === composerOutput(request.snapshot.action))?.action ?? "make-video",
    instructions: "",
    inputs: editProfile && slot ? [{ role: "primary", state: "pending", requestId: request.id, slotId: slot.id }] : [],
    settings: {
      profileId: editProfile?.id ?? "unselected",
      profileRevision: editProfile?.revision ?? "unresolved",
      parameters,
      outputCount: 1,
    },
    context: editProfile
      ? {
          ...request.snapshot.context,
          origin: "branch",
          parentRequestId: request.id,
          requestIds: [...request.snapshot.context.requestIds, request.id],
          projectInstructionsRevision,
        }
      : { origin: "empty", requestIds: [], projectInstructionsRevision },
    destination: { projectId, conversationId },
  };
  const noticeKind: "choose-result" | "edit-unavailable" | undefined =
    request.slots.length > 1 ? "choose-result" : imageAction && !editProfile ? "edit-unavailable" : undefined;
  return { content, ...(noticeKind ? { noticeKind } : {}) };
}
