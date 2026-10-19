import type { Firestore, Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import { ConversationSchema, CreateConversationCommandSchema, isLibraryProject, type Conversation, type Project } from "@shared/schemas/workflow/project.schemas";
import { ConversationIdSchema, OwnerIdSchema, ProjectIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { AcceptedRequestSchema } from "@shared/schemas/workflow/request.schemas";
import type { ProjectStore } from "./ProjectStore";
import { WorkflowError } from "./WorkflowError";
import { requireWritableProject } from "./projectAccess";
import { ChangeConversationSchema } from "@shared/schemas/workflow/management.schemas";
import { FolderStore } from "./FolderStore";

export class ConversationStore {
  constructor(
    private readonly database: Firestore,
    private readonly projects: ProjectStore,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly folders: FolderStore = new FolderStore(database, now),
  ) {}

  /** Only library conversations are filed, and only into the owner's active projects. */
  private async requireFilingTarget(transaction: Transaction, ownerId: string, project: Project, folderId: string): Promise<void> {
    if (!isLibraryProject(project)) throw new WorkflowError("invalid_context", "Only work outside a project can be added to one.");
    const folder = await this.folders.readOwned(transaction, ownerId, folderId);
    if (folder.status !== "active") throw new WorkflowError("read_only", "Restore this project before adding work to it.");
  }

  async create(ownerId: string, id: string, input: unknown): Promise<Conversation> {
    const projectId = ProjectIdSchema.parse(id);
    const command = CreateConversationCommandSchema.parse(input);
    const ref = this.database.collection("creation_projects").doc(projectId).collection("conversations").doc(command.id);
    const timestamp = this.now();
    return this.database.runTransaction(async transaction => {
      const project = await this.projects.readOwned(transaction, ownerId, projectId);
      const existing = await transaction.get(ref);
      if (existing.exists) return this.owned(ownerId, projectId, command.id, existing.data());
      requireWritableProject(project);
      if (command.folderId) await this.requireFilingTarget(transaction, ownerId, project, command.folderId);
      const context = command.context ?? { origin: "empty", requestIds: [], projectInstructionsRevision: project.instructions.revision };
      if (context.projectInstructionsRevision !== project.instructions.revision) throw new WorkflowError("invalid_context", "Review the project's current instructions before starting this conversation.");
      for (const requestId of context.requestIds) {
        const request = await transaction.get(this.database.collection("creation_requests").doc(requestId));
        if (!request.exists) throw new WorkflowError("invalid_context", "The selected request history is unavailable.");
        const data = AcceptedRequestSchema.parse(request.data());
        if (data.id !== requestId || data.ownerId !== ownerId || data.projectId !== projectId) throw new WorkflowError("invalid_context", "The selected history is outside this project.");
      }
      const conversation = ConversationSchema.parse({
        schemaVersion: "vidra-workflow/v2", id: command.id, projectId, ownerId, revision: 1,
        name: command.name, status: "active", acceptanceSequence: 0, initialContext: context,
        ...(command.folderId ? { folderId: command.folderId } : {}),
        createdAt: timestamp, updatedAt: timestamp,
      });
      transaction.create(ref, conversation);
      return conversation;
    });
  }

  async get(ownerId: string, id: string, conversation: string): Promise<Conversation> {
    return this.database.runTransaction(transaction => this.readOwned(transaction, ownerId, id, conversation));
  }

  async change(ownerId: string, id: string, conversationId: string, input: unknown): Promise<Conversation> {
    const command = ChangeConversationSchema.parse(input);
    return this.database.runTransaction(async transaction => {
      const project = await this.projects.readOwned(transaction, ownerId, id);
      requireWritableProject(project);
      const current = await this.readOwned(transaction, ownerId, id, conversationId);
      if (current.revision !== command.expectedRevision) throw new WorkflowError("revision_conflict", "This conversation changed in another window. Review its current name and status.");
      if (command.folderId) await this.requireFilingTarget(transaction, ownerId, project, command.folderId);
      const { folderId: filed, ...unfiled } = current;
      const folderId = command.folderId === undefined ? filed : command.folderId ?? undefined;
      const next = ConversationSchema.parse({ ...unfiled, ...(folderId ? { folderId } : {}), name: command.name ?? current.name, status: command.status ?? current.status, revision: current.revision + 1, updatedAt: this.now() });
      transaction.set(this.database.collection("creation_projects").doc(project.id).collection("conversations").doc(current.id), next);
      return next;
    });
  }

  async list(ownerId: string, id: string): Promise<Conversation[]> {
    const projectId = ProjectIdSchema.parse(id);
    await this.projects.get(ownerId, projectId);
    // Newest first, so a busy library never drops recent work past the cap.
    const result = await this.database.collection("creation_projects").doc(projectId).collection("conversations").orderBy("updatedAt", "desc").limit(200).get();
    return result.docs.map(doc => this.owned(ownerId, projectId, doc.id, doc.data())).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  async readOwned(transaction: Transaction, ownerId: string, id: string, conversation: string): Promise<Conversation> {
    const projectId = ProjectIdSchema.parse(id);
    const conversationId = ConversationIdSchema.parse(conversation);
    await this.projects.readOwned(transaction, ownerId, projectId);
    const snapshot = await transaction.get(this.database.collection("creation_projects").doc(projectId).collection("conversations").doc(conversationId));
    if (!snapshot.exists) throw new WorkflowError("not_found", "This conversation is unavailable.");
    return this.owned(ownerId, projectId, conversationId, snapshot.data());
  }

  private owned(ownerId: string, projectId: string, conversationId: string, data: unknown): Conversation {
    const scope = z.object({ ownerId: OwnerIdSchema, projectId: ProjectIdSchema, id: ConversationIdSchema }).parse(data);
    if (scope.ownerId !== ownerId || scope.projectId !== projectId || scope.id !== conversationId) throw new WorkflowError("access_denied", "You do not have access to this conversation.");
    return ConversationSchema.parse(data);
  }
}
