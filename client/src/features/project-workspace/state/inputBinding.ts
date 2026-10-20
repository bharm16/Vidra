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
  const role =
    requestedRole ??
    profile?.inputs.find(rule => rule.minCount > 0 && rule.kinds.includes(source.kind))?.role ??
    (content.action === "edit-image"
      ? "primary"
      : content.action === "animate-image"
        ? "start-frame"
        : source.kind === "video"
          ? "clip"
          : "reference");
  const rule = profile?.inputs.find(candidate => candidate.role === role && candidate.kinds.includes(source.kind));
  if (requestedRole && profile && !rule) return content;
  const nextInput: DraftInput =
    source.state === "resolved"
      ? { state: "resolved", role, versionId: source.versionId }
      : { state: "importing", role, importId: source.importId };
  const inputs = bindDraftInput(
    content.inputs,
    nextInput,
    rule?.maxCount ?? (role === "reference" ? 16 : 1),
    replacing,
  );
  return inputs === content.inputs ? content : { ...content, inputs };
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

export function mediaActionDraftContent(
  action: "edit-image" | "edit-video" | "animate-image" | "extend-video",
  versionId: VersionId,
  projectId: ProjectId,
  conversationId: ConversationId,
  projectInstructionsRevision: number,
): DraftContent {
  const role: DraftInput["role"] =
    action === "edit-image" ? "primary" : action === "animate-image" ? "start-frame" : "clip";
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
  const imageAction = ["make-image", "edit-image", "upscale-image"].includes(request.snapshot.action);
  if (!imageAction && !["make-video", "animate-image", "edit-video", "extend-video"].includes(request.snapshot.action)) {
    return undefined;
  }
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
    action: editProfile ? "edit-image" : imageAction ? "make-image" : "make-video",
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
