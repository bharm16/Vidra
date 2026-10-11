import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";
import { CreationDraftSchema, CreateDraftCommandSchema, DraftConflictSchema, RestoreDraftCommandSchema, SaveDraftCommandSchema, type CreationDraft, type DraftConflict, type SaveDraftResult } from "@shared/schemas/workflow/draft.schemas";
import { DraftIdSchema, ProjectIdSchema } from "@shared/schemas/workflow/identity.schemas";
import type { ProjectStore } from "@services/projects/ProjectStore";
import type { ConversationStore } from "@services/projects/ConversationStore";
import { WorkflowError } from "@services/projects/WorkflowError";
import { sha256Hex } from "@utils/hash";

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
    const timestamp = this.now();
    return this.database.runTransaction(async transaction => {
      const existing = await transaction.get(ref);
      const conversation = await this.conversations.readOwned(transaction, ownerId, project, conversationId);
      if (existing.exists) {
        const draft = this.owned(ownerId, project, existing.data());
        if (draft.conversationId !== conversation.id) throw new WorkflowError("submission_conflict", "This draft identity belongs to a different conversation.");
        return draft;
      }
      await this.writable(transaction, ownerId, project, conversationId);
      const draft = CreationDraftSchema.parse({
        schemaVersion: "vidra-workflow/v2", id: command.id, ownerId,
        projectId: project, conversationId, revision: 1, status: "open",
        ...command.content, createdAt: timestamp, updatedAt: timestamp,
      });
      transaction.create(ref, draft);
      transaction.create(ref.collection("revisions").doc("1"), draft);
      return draft;
    });
  }

  async get(ownerId: string, project: string, id: string): Promise<CreationDraft> {
    return this.database.runTransaction(transaction => this.readOwned(transaction, ownerId, project, id));
  }

  async list(ownerId: string, project: string, conversationId: string): Promise<CreationDraft[]> {
    await this.conversations.get(ownerId, project, conversationId);
    const rows = await this.database.collection("creation_projects").doc(ProjectIdSchema.parse(project)).collection("drafts").where("conversationId", "==", conversationId).limit(200).get();
    return rows.docs.map(row => this.owned(ownerId, project, row.data())).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
        const conflictId = `conflict_${sha256Hex(JSON.stringify({ ownerId, id, expectedRevision: command.expectedRevision, content: command.content }))}`;
        const conflictRef = this.ref(project, id).collection("conflicts").doc(conflictId);
        const existing = await transaction.get(conflictRef);
        const retained = existing.exists ? DraftConflictSchema.parse(existing.data()) : DraftConflictSchema.parse({ id: conflictId, draftId: current.id, ownerId, expectedRevision: command.expectedRevision, content: command.content, createdAt: timestamp });
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
      const prior = this.owned(ownerId, project, source.data());
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
    await this.get(ownerId, project, id);
    const rows = await this.ref(project, id).collection("revisions").limit(1000).get();
    return rows.docs.map(row => this.owned(ownerId, project, row.data())).sort((a, b) => a.revision - b.revision);
  }

  async conflicts(ownerId: string, project: string, id: string): Promise<DraftConflict[]> {
    await this.get(ownerId, project, id);
    const rows = await this.ref(project, id).collection("conflicts").limit(200).get();
    return rows.docs.map(row => DraftConflictSchema.parse(row.data()));
  }

  async readOwned(transaction: Transaction, ownerId: string, project: string, id: string): Promise<CreationDraft> {
    await this.projects.readOwned(transaction, ownerId, project);
    const row = await transaction.get(this.ref(project, id));
    if (!row.exists) throw new WorkflowError("not_found", "This draft is unavailable.");
    return this.owned(ownerId, project, row.data());
  }

  private ref(project: string, id: string): DocumentReference {
    return this.database.collection("creation_projects").doc(ProjectIdSchema.parse(project)).collection("drafts").doc(DraftIdSchema.parse(id));
  }

  private owned(ownerId: string, project: string, data: unknown): CreationDraft {
    const draft = CreationDraftSchema.parse(data);
    if (draft.ownerId !== ownerId || draft.projectId !== project) throw new WorkflowError("access_denied", "You do not have access to this draft.");
    return draft;
  }

  private async writable(transaction: Transaction, ownerId: string, projectId: string, conversationId: string): Promise<void> {
    const project = await this.projects.readOwned(transaction, ownerId, projectId);
    const conversation = await this.conversations.readOwned(transaction, ownerId, projectId, conversationId);
    if (project.status !== "active" || conversation.status !== "active" || (project.origin.kind !== "new" && project.origin.authority !== "workflow")) throw new WorkflowError("read_only", "Restore this project and conversation before changing work.");
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
