import type { Firestore, Transaction } from "firebase-admin/firestore";
import { AcceptedRequestSchema, AcceptedSnapshotSchema } from "@shared/schemas/workflow/request.schemas";
import { PreparedActionSchema, PreparedSlotSchema, type PreparedAction, type PreparationReason, type PreparedSlot } from "@shared/schemas/workflow/preparation.schemas";
import type { CapabilityProfile, ParameterValue } from "@shared/schemas/workflow/capability.schemas";
import { ResolvedInputSchema, type CreationDraft } from "@shared/schemas/workflow/draft.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { canonicalJson } from "@shared/workflow/canonicalJson";
import { validateProfileParameters } from "@shared/workflow/capabilityEvaluation";
import { wordsPolicy } from "@shared/workflow/actionRegistry";
import type { ProjectStore } from "@services/projects/ProjectStore";
import type { ConversationStore } from "@services/projects/ConversationStore";
import type { CreationDraftStore } from "@services/creation-drafts/CreationDraftStore";
import type { CreationContextService } from "@services/creation-context/CreationContextService";
import { WorkflowError } from "@services/projects/WorkflowError";
import { requireWritableConversation } from "@services/projects/projectAccess";
import { sha256Hex } from "@utils/hash";
import { ImportRecordSchema } from "@shared/schemas/workflow/import.schemas";
import { areaMaskMismatch } from "./areaMaskInputs";

export interface WorkflowProfileCatalog { get(id: string): CapabilityProfile | undefined; }
export interface WorkflowInputReader { get(ownerId: string, projectId: string, versionId: string, transaction?: Transaction): Promise<MediaVersion | undefined>; }
export interface ActionPreparationDependencies {
  database: Firestore;
  projects: ProjectStore;
  conversations: ConversationStore;
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
    const conversation = await this.deps.conversations.readOwned(transaction, ownerId, projectId, draft.conversationId);
    requireWritableConversation(project, conversation);
    const reasons: PreparationReason[] = [];
    const block = (code: PreparationReason["code"], message: string, field?: string): void => { reasons.push({ code, message, ...(field ? { field } : {}) }); };
    if (draft.status !== "open" && draft.status !== "parked") block("draft_frozen", "This execution draft has already been submitted or discarded. Reuse its setup explicitly.");
    const profile = this.deps.profiles.get(draft.settings.profileId);
    if (!profile) block("profile_unknown", "This exact model and action profile is unknown. Choose a qualified profile.");
    else {
      if (profile.action !== draft.action || profile.revision !== draft.settings.profileRevision) block("profile_changed", "This action or capability profile changed. Review the current setup.");
      if (profile.availability !== "qualified") block("profile_unavailable", profile.unavailableReason ?? "This operation has not been qualified for execution.");
    }
    const words = wordsPolicy(draft.action, profile);
    if ((words === "required" || words === "script") && !draft.instructions.trim()) block("settings_invalid", "Describe what you want to make or change.", "instructions");

    const inputs: Array<ReturnType<typeof ResolvedInputSchema.parse>> = [];
    const media: MediaVersion[] = [];
    for (const input of draft.inputs) {
      let versionId = input.state === "resolved" ? input.versionId : undefined;
      if (input.state === "importing") {
        const row = await transaction.get(this.deps.database.collection("creation_projects").doc(projectId).collection("imports").doc(input.importId));
        const record = row.exists ? ImportRecordSchema.strip().parse(row.data()) : undefined;
        if (!record || record.ownerId !== ownerId || record.projectId !== projectId || record.id !== input.importId) { block("input_denied", "This imported file is unavailable. Choose the file again.", input.role); continue; }
        if (record.state === "cancelled" || record.state === "rejected") { block("input_missing", "This import is unavailable. Choose another picture or clip.", input.role); continue; }
        if (record.state !== "ready") { block("input_pending", "Wait for this file to finish uploading.", input.role); continue; }
        versionId = record.versionId;
      }
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
      const rule = profile?.inputs.find(candidate => candidate.role === input.role);
      const kind = version.kind === "export" ? "video" : version.kind;
      if (profile && (!rule || !rule.kinds.includes(kind))) { block("input_incompatible", `The ${input.role} input is unsupported by this exact operation.`, input.role); continue; }
      if (rule?.maxBytes !== undefined && (version.object.identity !== "verified" || version.object.bytes > rule.maxBytes)) block("input_incompatible", "The input size is unknown or exceeds this operation's limit.", input.role);
      if (rule && (rule.minDurationSeconds !== undefined || rule.maxDurationSeconds !== undefined)) {
        if (version.metadata.state !== "verified") block("input_pending", "The input's duration must be checked.", input.role);
        else if (version.metadata.durationSeconds < (rule.minDurationSeconds ?? 0) || version.metadata.durationSeconds > (rule.maxDurationSeconds ?? Infinity)) block("input_incompatible", "The input duration is outside this operation's limits.", input.role);
      }
      inputs.push(ResolvedInputSchema.parse({ role: input.role, state: "resolved", versionId }));
      media.push(version);
    }
    for (const rule of profile?.inputs ?? []) {
      const count = inputs.filter(input => input.role === rule.role).length;
      if (count < rule.minCount && !draft.inputs.some(input => input.role === rule.role && input.state === "pending")) block("input_missing", `Choose ${rule.minCount} ${rule.role} input${rule.minCount === 1 ? "" : "s"}.`, rule.role);
      if (count > rule.maxCount) block("input_incompatible", `This operation supports at most ${rule.maxCount} ${rule.role} inputs.`, rule.role);
    }
    if (areaMaskMismatch(inputs, media)) block("input_incompatible", "This area belongs to a different picture or size. Redraw it on this exact version.", "mask");
    const { parameters, reasons: settingReasons } = validateProfileParameters(profile, draft.settings, inputs, media);
    reasons.push(...settingReasons);
    let materializedContext: Awaited<ReturnType<CreationContextService["materializeInTransaction"]>> | undefined;
    try {
      materializedContext = await this.deps.contexts.materializeInTransaction(transaction, ownerId, projectId, draft.context, project);
    } catch (error) {
      if (!(error instanceof WorkflowError) || error.code !== "invalid_context") throw error;
      block("context_invalid", error.message);
    }
    if (profile && materializedContext) {
      const summarized = new Set(draft.context.summary?.requestIds ?? []);
      const length = draft.instructions.length + materializedContext.projectInstructions.length + (draft.context.summary?.text.length ?? 0) + materializedContext.entries.reduce((total, entry) => total + (summarized.has(entry.requestId) ? 0 : entry.instructions.length + (entry.textOutputs ?? []).reduce((answerLength, output) => answerLength + output.text.length, 0)), 0);
      if (length > profile.maxContextCharacters) block("context_limit", "The captured context exceeds this operation's allowance. Choose less context or explicitly apply a summary.");
    }
    const slotPlan = profile ? this.planSlots(draft, profile, parameters) : undefined;
    if (profile && !slotPlan) block("settings_invalid", "This fresh seed policy cannot supply a valid concrete seed. Review the seed setting.", "seed");
    if (reasons.length || !profile || !materializedContext || !slotPlan) return this.blocked(draft, reasons, profile);
    const snapshot = AcceptedSnapshotSchema.parse({
      action: draft.action, instructions: draft.instructions, inputs,
      settings: { ...draft.settings, parameters }, context: draft.context,
      destination: draft.destination, ...(draft.contextualTarget ? { contextualTarget: draft.contextualTarget } : {}),
    });
    const reviewedHash = sha256Hex(canonicalJson({ draftId: draft.id, draftRevision: draft.revision, snapshot, materializedContext, profile, slotPlan }));
    return PreparedActionSchema.parse({ state: "ready", draftId: draft.id, draftRevision: draft.revision, snapshot, materializedContext, reviewedHash, profile, slotPlan });
  }

  private planSlots(draft: CreationDraft, profile: CapabilityProfile, parameters: Record<string, ParameterValue>): PreparedSlot[] | undefined {
    const seed = parameters.seed;
    const policy = profile.parameters.seed;
    let effectiveSeed: (ordinal: number) => number | undefined = () => typeof seed === "number" && Number.isInteger(seed) && seed >= 0 ? seed : undefined;
    if (seed === -1 && policy?.policy === "editable") {
      const domain = policy.domain;
      const choiceFor = (ordinal: number): number => Number.parseInt(sha256Hex(`${draft.id}:${draft.revision}:${profile.id}:${profile.revision}:${ordinal}`).slice(0, 8), 16);
      if (domain.kind === "enum") {
        const allowed = domain.values.filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2147483647);
        effectiveSeed = ordinal => allowed.length ? allowed[choiceFor(ordinal) % allowed.length] : undefined;
      } else if (domain.kind === "range") {
        if (!Number.isInteger(domain.min) || !Number.isInteger(domain.step)) return undefined;
        const firstIndex = Math.ceil((Math.max(0, domain.min) - domain.min) / domain.step);
        const lastIndex = Math.floor((Math.min(2147483647, domain.max) - domain.min) / domain.step);
        const count = Math.max(0, lastIndex - firstIndex + 1);
        effectiveSeed = ordinal => count ? domain.min + (firstIndex + choiceFor(ordinal) % count) * domain.step : undefined;
      } else return undefined;
    }
    return Array.from({ length: draft.settings.outputCount }, (_, index) => {
      const ordinal = index + 1;
      const resolved = effectiveSeed(ordinal);
      return PreparedSlotSchema.parse({ ordinal, ...(resolved === undefined ? {} : { seed: resolved }) });
    });
  }

  private blocked(draft: CreationDraft, reasons: PreparationReason[], profile?: CapabilityProfile): PreparedAction {
    const priority = (reason: PreparationReason): number => {
      switch (reason.code) {
        case "input_denied": return 0;
        case "draft_frozen": return 2;
        case "input_pending":
        case "input_missing": return 3;
        case "context_invalid": return 4;
        case "profile_changed":
        case "input_incompatible": return 5;
        case "settings_invalid": return reason.field === "instructions" ? 9 : 5;
        case "context_limit": return 6;
        case "profile_unknown":
        case "profile_unavailable": return 7;
      }
    };
    return PreparedActionSchema.parse({ state: "blocked", draftId: draft.id, draftRevision: draft.revision, reasons: reasons.sort((a, b) => priority(a) - priority(b)), ...(profile ? { profile } : {}) });
  }
}
