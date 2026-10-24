import { allPages, listPage, allDocuments, type ListOptions } from "@services/firestore/WorkflowLists";
import type { WorkflowPage } from "@shared/schemas/workflow/page.schemas";
import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import { CreationDraftSchema, CreateDraftCommandSchema, DraftConflictSchema, RestoreDraftCommandSchema, SaveDraftCommandSchema, type CreationDraft, type DraftConflict, type SaveDraftResult } from "@shared/schemas/workflow/draft.schemas";
import { ConversationIdSchema, DraftIdSchema, OwnerIdSchema, ProjectIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { canonicalJson } from "@shared/workflow/canonicalJson";
import type { ProjectStore } from "@services/projects/ProjectStore";
import type { ConversationStore } from "@services/projects/ConversationStore";
import { WorkflowError } from "@services/projects/WorkflowError";
import { requireWritableConversation } from "@services/projects/projectAccess";
import { sha256Hex } from "@utils/hash";

const DraftIdentitySchema = z.strictObject({ ownerId: OwnerIdSchema, draftId: DraftIdSchema, projectId: ProjectIdSchema, conversationId: ConversationIdSchema });
type DraftIdentity = z.infer<typeof DraftIdentitySchema>;

export class CreationDraftStore {
  constructor(
    private readonly database: Firestore,
    private readonly projects: ProjectStore,
    private readonly conversations: ConversationStore,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async create(ownerId: string, project: string, conversationId: string, input: unknown): Promise<CreationDraft> {
    const command = CreateDraftCommandSchema.parse(input);
    const ref = this.ref(project, command.id);
    const identityRef = this.identityRef(ownerId, command.id);
    const timestamp = this.now();
    return this.database.runTransaction(async transaction => {
      const existing = await transaction.get(ref);
      const identityRow = await transaction.get(identityRef);
      const conversation = await this.conversations.readOwned(transaction, ownerId, project, conversationId);
      const identity = DraftIdentitySchema.parse({ ownerId, draftId: command.id, projectId: project, conversationId: conversation.id });
      if (identityRow.exists && !this.identityMatches(identity, identityRow.data())) throw new WorkflowError("submission_conflict", "This draft identity is already bound to a different project or conversation. Keep this work under a new draft identity.");
      if (existing.exists) {
        const draft = this.owned(ownerId, project, command.id, existing.data());
        if (draft.conversationId !== conversation.id) throw new WorkflowError("submission_conflict", "This draft identity belongs to a different conversation.");
        if (!identityRow.exists) transaction.create(identityRef, identity);
        return draft;
      }
      await this.writable(transaction, ownerId, project, conversationId);
      const draft = CreationDraftSchema.parse({
        schemaVersion: "vidra-workflow/v2", id: command.id, ownerId,
        projectId: project, conversationId, revision: 1, status: "open",
        ...command.content, createdAt: timestamp, updatedAt: timestamp,
      });
      transaction.create(ref, draft);
      if (!identityRow.exists) transaction.create(identityRef, identity);
      transaction.create(ref.collection("revisions").doc("1"), draft);
      return draft;
    });
  }

  async get(ownerId: string, project: string, id: string): Promise<CreationDraft> {
    return this.database.runTransaction(transaction => this.readOwned(transaction, ownerId, project, id));
  }

  async list(ownerId: string, project: string, conversationId: string): Promise<CreationDraft[]> {
    return (await allPages(options => this.page(ownerId, project, conversationId, options))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async page(ownerId: string, project: string, conversationId: string, options: ListOptions = {}): Promise<WorkflowPage<CreationDraft>> {
    await this.conversations.get(ownerId, project, conversationId);
    const page = await listPage(this.database.collection("creation_projects").doc(ProjectIdSchema.parse(project)).collection("drafts").where("conversationId", "==", conversationId), `drafts:${ownerId}:${project}:${conversationId}`, row => this.owned(ownerId, project, row.id, row.data()), options);
    if (page.items.length) {
      const identities = await this.database.getAll(...page.items.map(draft => this.identityRef(ownerId, draft.id)));
      identities.forEach((identity, index) => { const draft = page.items[index]; if (identity.exists && draft) this.requireIdentityBinding(draft, identity.data()); });
    }
    return page;
  }

  async save(ownerId: string, project: string, id: string, input: unknown): Promise<SaveDraftResult> {
    const command = SaveDraftCommandSchema.parse(input);
    const timestamp = this.now();
    return this.database.runTransaction(async transaction => {
      const current = await this.readOwned(transaction, ownerId, project, id);
      await this.writable(transaction, ownerId, project, current.conversationId);
      this.editable(current);
      // Parse the candidate before any write; changed destinations are never retargeted.
      const candidate = CreationDraftSchema.parse({ ...current, ...command.content, revision: current.revision + 1, updatedAt: timestamp });
      if (current.revision !== command.expectedRevision) {
        const conflictId = `conflict_${sha256Hex(canonicalJson({ ownerId, id, expectedRevision: command.expectedRevision, content: command.content }))}`;
        const conflictRef = this.ref(project, id).collection("conflicts").doc(conflictId);
        const existing = await transaction.get(conflictRef);
        const retained = existing.exists ? this.ownedConflict(current, conflictId, existing.data()) : DraftConflictSchema.parse({ id: conflictId, draftId: current.id, ownerId, expectedRevision: command.expectedRevision, content: command.content, createdAt: timestamp });
        if (!existing.exists) transaction.create(conflictRef, retained);
        return { state: "conflict", current, retained };
      }
      this.writeRevision(transaction, project, candidate);
      return { state: "saved", draft: candidate };
    });
  }

  async restore(ownerId: string, project: string, id: string, input: unknown): Promise<CreationDraft> {
    const command = RestoreDraftCommandSchema.parse(input);
    const timestamp = this.now();
    return this.database.runTransaction(async transaction => {
      const current = await this.readOwned(transaction, ownerId, project, id);
      await this.writable(transaction, ownerId, project, current.conversationId);
      this.editable(current);
      if (current.revision !== command.expectedRevision) throw new WorkflowError("revision_conflict", "This draft changed. Review the current words before restoring.");
      const source = await transaction.get(this.ref(project, id).collection("revisions").doc(String(command.sourceRevision)));
      if (!source.exists) throw new WorkflowError("not_found", "This saved revision is unavailable.");
      const prior = this.ownedRevision(current, source.id, source.data());
      const restored = CreationDraftSchema.parse({ ...prior, status: current.status, revision: current.revision + 1, createdAt: current.createdAt, updatedAt: timestamp });
      this.writeRevision(transaction, project, restored);
      return restored;
    });
  }

  async setStatus(ownerId: string, project: string, id: string, expectedRevision: number, status: "open" | "parked" | "discarded"): Promise<CreationDraft> {
    return this.database.runTransaction(async transaction => {
      const current = await this.readOwned(transaction, ownerId, project, id);
      await this.writable(transaction, ownerId, project, current.conversationId);
      this.editable(current);
      if (current.revision !== expectedRevision) throw new WorkflowError("revision_conflict", "This draft changed before the action completed.");
      const next = CreationDraftSchema.parse({ ...current, status, revision: current.revision + 1, updatedAt: this.now() });
      this.writeRevision(transaction, project, next);
      return next;
    });
  }

  async revisions(ownerId: string, project: string, id: string): Promise<CreationDraft[]> {
    const current = await this.get(ownerId, project, id);
    const rows = { docs: await allDocuments(this.ref(project, id).collection("revisions")) };
    return rows.docs.map(row => this.ownedRevision(current, row.id, row.data())).sort((a, b) => a.revision - b.revision);
  }

  async conflicts(ownerId: string, project: string, id: string): Promise<DraftConflict[]> {
    const current = await this.get(ownerId, project, id);
    const rows = { docs: await allDocuments(this.ref(project, id).collection("conflicts")) };
    return rows.docs.map(row => this.ownedConflict(current, row.id, row.data()));
  }

  async readOwned(transaction: Transaction, ownerId: string, project: string, id: string): Promise<CreationDraft> {
    await this.projects.readOwned(transaction, ownerId, project);
    const row = await transaction.get(this.ref(project, id));
    if (!row.exists) throw new WorkflowError("not_found", "This draft is unavailable.");
    const draft = this.owned(ownerId, project, id, row.data());
    const identity = await transaction.get(this.identityRef(ownerId, draft.id));
    // Existing records may predate the registry; explicit creation backfills it.
    if (identity.exists) this.requireIdentityBinding(draft, identity.data());
    return draft;
  }

  private ref(project: string, id: string): DocumentReference {
    return this.database.collection("creation_projects").doc(ProjectIdSchema.parse(project)).collection("drafts").doc(DraftIdSchema.parse(id));
  }

  private identityRef(ownerId: string, id: string): DocumentReference {
    return this.database.collection("creation_draft_identities").doc(sha256Hex(canonicalJson({ ownerId, draftId: id })));
  }

  private identityMatches(expected: DraftIdentity, data: unknown): boolean {
    return canonicalJson(DraftIdentitySchema.parse(data)) === canonicalJson(expected);
  }

  private requireIdentityBinding(draft: CreationDraft, data: unknown): void {
    if (!this.identityMatches({ ownerId: draft.ownerId, draftId: draft.id, projectId: draft.projectId, conversationId: draft.conversationId }, data)) {
      throw new WorkflowError("access_denied", "This saved draft is unavailable.");
    }
  }

  private owned(ownerId: string, project: string, id: string, data: unknown): CreationDraft {
    const scope = z.object({ ownerId: OwnerIdSchema, projectId: ProjectIdSchema, id: DraftIdSchema }).parse(data);
    if (scope.ownerId !== ownerId || scope.projectId !== project || scope.id !== id) throw new WorkflowError("access_denied", "You do not have access to this draft.");
    return CreationDraftSchema.parse(data);
  }

  private ownedRevision(current: CreationDraft, revisionId: string, data: unknown): CreationDraft {
    const prior = this.owned(current.ownerId, current.projectId, current.id, data);
    if (String(prior.revision) !== revisionId || prior.conversationId !== current.conversationId) {
      throw new WorkflowError("access_denied", "This saved draft revision is unavailable.");
    }
    return prior;
  }

  private ownedConflict(current: CreationDraft, conflictId: string, data: unknown): DraftConflict {
    const scope = z.object({ ownerId: OwnerIdSchema, draftId: DraftIdSchema, id: DraftConflictSchema.shape.id }).parse(data);
    if (scope.ownerId !== current.ownerId || scope.draftId !== current.id || scope.id !== conflictId) {
      throw new WorkflowError("access_denied", "This retained draft conflict is unavailable.");
    }
    const conflict = DraftConflictSchema.parse(data);
    if (conflict.content.destination.projectId !== current.projectId || conflict.content.destination.conversationId !== current.conversationId) {
      throw new WorkflowError("access_denied", "This retained draft conflict is unavailable.");
    }
    return conflict;
  }

  private async writable(transaction: Transaction, ownerId: string, projectId: string, conversationId: string): Promise<void> {
    const project = await this.projects.readOwned(transaction, ownerId, projectId);
    const conversation = await this.conversations.readOwned(transaction, ownerId, projectId, conversationId);
    requireWritableConversation(project, conversation);
  }

  private editable(draft: CreationDraft): void {
    if (draft.status !== "open" && draft.status !== "parked") throw new WorkflowError("read_only", "This draft is immutable. Reuse its setup in a new draft.");
  }

  private writeRevision(transaction: Transaction, project: string, draft: CreationDraft): void {
    const ref = this.ref(project, draft.id);
    transaction.set(ref, draft);
    transaction.create(ref.collection("revisions").doc(String(draft.revision)), draft);
  }
}
