import type { Firestore, Transaction } from "firebase-admin/firestore";
import { AcceptedRequestSchema, AcceptedSnapshotSchema } from "@shared/schemas/workflow/request.schemas";
import { PreparedActionSchema, type PreparedAction, type PreparationReason } from "@shared/schemas/workflow/preparation.schemas";
import type { CapabilityProfile, ParameterValue } from "@shared/schemas/workflow/capability.schemas";
import { ResolvedInputSchema, type CreationDraft } from "@shared/schemas/workflow/draft.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { canonicalJson } from "@shared/workflow/canonicalJson";
import type { ProjectStore } from "@services/projects/ProjectStore";
import type { CreationDraftStore } from "@services/creation-drafts/CreationDraftStore";
import type { CreationContextService } from "@services/creation-context/CreationContextService";
import { WorkflowError } from "@services/projects/WorkflowError";
import { sha256Hex } from "@utils/hash";

export interface WorkflowProfileCatalog { get(id: string): CapabilityProfile | undefined; }
export interface WorkflowInputReader { get(ownerId: string, projectId: string, versionId: string, transaction?: Transaction): Promise<MediaVersion | undefined>; }
export interface ActionPreparationDependencies {
  database: Firestore;
  projects: ProjectStore;
  drafts: CreationDraftStore;
  contexts: CreationContextService;
  profiles: WorkflowProfileCatalog;
  media: WorkflowInputReader;
}

export class ActionPreparationService {
  constructor(private readonly deps: ActionPreparationDependencies) {}

  async prepare(ownerId: string, projectId: string, draftId: string): Promise<PreparedAction> {
    return this.deps.database.runTransaction(transaction => this.prepareInTransaction(transaction, ownerId, projectId, draftId));
  }

  async prepareInTransaction(transaction: Transaction, ownerId: string, projectId: string, draftId: string): Promise<PreparedAction> {
    const draft = await this.deps.drafts.readOwned(transaction, ownerId, projectId, draftId);
    const project = await this.deps.projects.readOwned(transaction, ownerId, projectId);
    const conversation = await transaction.get(this.deps.database.collection("creation_projects").doc(project.id).collection("conversations").doc(draft.conversationId));
    if (project.status !== "active" || conversation.data()?.status !== "active" || (project.origin.kind !== "new" && project.origin.authority !== "workflow")) throw new WorkflowError("read_only", "Restore this project and conversation before submitting work.");
    const reasons: PreparationReason[] = [];
    const block = (code: PreparationReason["code"], message: string, field?: string): void => { reasons.push({ code, message, ...(field ? { field } : {}) }); };
    if (draft.status !== "open" && draft.status !== "parked") block("draft_frozen", "This execution draft has already been submitted or discarded. Reuse its setup explicitly.");
    const profile = this.deps.profiles.get(draft.settings.profileId);
    if (!profile) return this.blocked(draft, [{ code: "profile_unknown", message: "This exact model and action profile is unknown. Choose a qualified profile." }]);
    if (profile.action !== draft.action || profile.revision !== draft.settings.profileRevision) block("profile_changed", "This action or capability profile changed. Review the current setup.");
    if (profile.availability !== "qualified") block("profile_unavailable", profile.unavailableReason ?? "This operation has not been qualified for execution.");
    if (!["import", "accept-sketch", "export-video", "upscale-image"].includes(draft.action) && !draft.instructions.trim()) block("settings_invalid", "Describe what you want to make or change.", "instructions");
    if (reasons.length) return this.blocked(draft, reasons, profile);

    const inputs: Array<ReturnType<typeof ResolvedInputSchema.parse>> = [];
    const media: MediaVersion[] = [];
    for (const input of draft.inputs) {
      let versionId = input.state === "resolved" ? input.versionId : undefined;
      if (input.state === "pending") {
        const row = await transaction.get(this.deps.database.collection("creation_requests").doc(input.requestId));
        const request = row.exists ? AcceptedRequestSchema.parse(row.data()) : undefined;
        const slot = request?.slots.find(candidate => candidate.id === input.slotId);
        if (!request || request.ownerId !== ownerId || request.projectId !== projectId) { block("input_denied", "The declared result is unavailable in this project."); continue; }
        if (!slot) { block("input_missing", "The declared output slot does not exist."); continue; }
        if (slot.delivery !== "ready" || !slot.versionId) { block("input_pending", "The exact declared result must finish saving and attaching before it can be used."); continue; }
        versionId = slot.versionId;
      }
      if (!versionId) { block("input_missing", "Choose the exact input for this action."); continue; }
      const version = await this.deps.media.get(ownerId, projectId, versionId, transaction);
      if (!version || version.ownerId !== ownerId || version.projectId !== projectId) { block("input_denied", "An exact selected input is unavailable or access was lost."); continue; }
      if (version.association !== "linked") { block("input_pending", "This input has not been attached to the project."); continue; }
      const rule = profile.inputs.find(candidate => candidate.role === input.role);
      const kind = version.kind === "export" ? "video" : version.kind;
      if (!rule || !rule.kinds.includes(kind)) { block("input_incompatible", `The ${input.role} input is unsupported by this exact operation.`, input.role); continue; }
      if (rule.maxBytes !== undefined && (version.object.identity !== "verified" || version.object.bytes > rule.maxBytes)) block("input_incompatible", "The input size is unknown or exceeds this operation's limit.", input.role);
      if (rule.minDurationSeconds !== undefined || rule.maxDurationSeconds !== undefined) {
        if (version.metadata.state !== "verified") block("input_pending", "The input's duration must be checked.", input.role);
        else if (version.metadata.durationSeconds < (rule.minDurationSeconds ?? 0) || version.metadata.durationSeconds > (rule.maxDurationSeconds ?? Infinity)) block("input_incompatible", "The input duration is outside this operation's limits.", input.role);
      }
      inputs.push(ResolvedInputSchema.parse({ role: input.role, state: "resolved", versionId }));
      media.push(version);
    }
    for (const rule of profile.inputs) {
      const count = inputs.filter(input => input.role === rule.role).length;
      if (count < rule.minCount && !draft.inputs.some(input => input.role === rule.role && input.state === "pending")) block("input_missing", `Choose ${rule.minCount} ${rule.role} input${rule.minCount === 1 ? "" : "s"}.`, rule.role);
      if (count > rule.maxCount) block("input_incompatible", `This operation supports at most ${rule.maxCount} ${rule.role} inputs.`, rule.role);
    }
    const parameters: Record<string, ParameterValue> = {};
    for (const key of Object.keys(draft.settings.parameters)) if (!Object.hasOwn(profile.parameters, key)) block("settings_invalid", `The ${key} setting is not mapped by this exact operation.`, key);
    for (const [key, policy] of Object.entries(profile.parameters)) {
      const retained = draft.settings.parameters[key];
      if (policy.policy === "derived") continue;
      if (policy.policy === "unsupported" || policy.policy === "unknown") {
        if (retained !== undefined || policy.policy === "unknown") block("settings_invalid", policy.reason, key);
        continue;
      }
      const value = retained ?? (policy.policy === "fixed" ? policy.value : policy.defaultValue);
      const valid = policy.policy === "fixed" ? value === policy.value : policy.domain.kind === "enum" ? policy.domain.values.includes(value) : typeof value === "number" && value >= policy.domain.min && value <= policy.domain.max && Math.abs((value - policy.domain.min) / policy.domain.step - Math.round((value - policy.domain.min) / policy.domain.step)) < 1e-8;
      if (!valid) block("settings_invalid", `Review the retained ${key} value; it is not valid for this operation.`, key);
      else parameters[key] = key === "seed" && value === -1 ? Number.parseInt(sha256Hex(`${draft.id}:${draft.revision}:${profile.id}`).slice(0, 8), 16) % 2147483648 : value;
    }
    for (const [key, policy] of Object.entries(profile.parameters)) {
      if (policy.policy !== "derived") continue;
      if (policy.from === "frame-duration") {
        const frames = parameters.numFrames;
        const fps = parameters.framesPerSecond;
        if (typeof frames === "number" && typeof fps === "number" && fps > 0) parameters[key] = frames / fps;
        else block("settings_invalid", "Frame count and generation rate are required to derive duration.", key);
      } else {
        const index = inputs.findIndex(input => input.role === policy.role);
        const metadata = media[index]?.metadata;
        if (metadata?.state !== "verified") block("input_pending", "The exact input metadata is needed for this setting.", key);
        else parameters[key] = policy.from === "input-duration" ? metadata.durationSeconds : `${metadata.width}:${metadata.height}`;
      }
    }
    for (const constraint of profile.constraints) if (parameters[constraint.parameter] === constraint.equals) for (const [field, allowed] of Object.entries(constraint.requires)) if (!allowed.includes(parameters[field] ?? "")) block("settings_invalid", constraint.reason, field);
    if (draft.settings.outputCount > profile.output.maxCount) block("settings_invalid", "This operation cannot produce the selected number of outputs.", "outputCount");
    const materializedContext = await this.deps.contexts.materializeInTransaction(transaction, ownerId, projectId, draft.context);
    const summarized = new Set(draft.context.summary?.requestIds ?? []);
    const length = draft.instructions.length + materializedContext.projectInstructions.length + (draft.context.summary?.text.length ?? 0) + materializedContext.entries.reduce((total, entry) => total + (summarized.has(entry.requestId) ? 0 : entry.instructions.length), 0);
    if (length > profile.maxContextCharacters) block("context_limit", "The captured context exceeds this operation's allowance. Choose less context or explicitly apply a summary.");
    if (reasons.length) return this.blocked(draft, reasons, profile);
    const snapshot = AcceptedSnapshotSchema.parse({
      action: draft.action, instructions: draft.instructions, inputs,
      settings: { ...draft.settings, parameters }, context: draft.context,
      destination: draft.destination, ...(draft.contextualTarget ? { contextualTarget: draft.contextualTarget } : {}),
    });
    const reviewedHash = sha256Hex(canonicalJson({ draftId: draft.id, draftRevision: draft.revision, snapshot, materializedContext, profile }));
    return PreparedActionSchema.parse({ state: "ready", draftId: draft.id, draftRevision: draft.revision, snapshot, materializedContext, reviewedHash, profile });
  }

  private blocked(draft: CreationDraft, reasons: PreparationReason[], profile?: CapabilityProfile): PreparedAction {
    return PreparedActionSchema.parse({ state: "blocked", draftId: draft.id, draftRevision: draft.revision, reasons, ...(profile ? { profile } : {}) });
  }
}
