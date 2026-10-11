import type { Firestore, Transaction } from "firebase-admin/firestore";
import { ConversationSchema, CreateConversationCommandSchema, type Conversation } from "@shared/schemas/workflow/project.schemas";
import { ConversationIdSchema, ProjectIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { AcceptedRequestSchema } from "@shared/schemas/workflow/request.schemas";
import type { ProjectStore } from "./ProjectStore";
import { WorkflowError } from "./WorkflowError";

export class ConversationStore {
  constructor(private readonly database: Firestore, private readonly projects: ProjectStore, private readonly now: () => string = () => new Date().toISOString()) {}

  async create(ownerId: string, id: string, input: unknown): Promise<Conversation> {
    const projectId = ProjectIdSchema.parse(id);
    const command = CreateConversationCommandSchema.parse(input);
    const ref = this.database.collection("creation_projects").doc(projectId).collection("conversations").doc(command.id);
    const timestamp = this.now();
    return this.database.runTransaction(async transaction => {
      const project = await this.projects.readOwned(transaction, ownerId, projectId);
      const existing = await transaction.get(ref);
      if (existing.exists) return this.owned(ownerId, projectId, existing.data());
      if (project.status !== "active" || (project.origin.kind !== "new" && project.origin.authority !== "workflow")) throw new WorkflowError("read_only", "This project is not open for new work.");
      const context = command.context ?? { origin: "empty", requestIds: [], projectInstructionsRevision: project.instructions.revision };
      if (context.projectInstructionsRevision !== project.instructions.revision) throw new WorkflowError("invalid_context", "Review the project's current instructions before starting this conversation.");
      for (const requestId of context.requestIds) {
        const request = await transaction.get(this.database.collection("creation_requests").doc(requestId));
        if (!request.exists) throw new WorkflowError("invalid_context", "The selected request history is unavailable.");
        const data = AcceptedRequestSchema.parse(request.data());
        if (data.ownerId !== ownerId || data.projectId !== projectId) throw new WorkflowError("invalid_context", "The selected history is outside this project.");
      }
      const conversation = ConversationSchema.parse({
        schemaVersion: "vidra-workflow/v2", id: command.id, projectId, ownerId, revision: 1,
        name: command.name, status: "active", acceptanceSequence: 0, initialContext: context,
        createdAt: timestamp, updatedAt: timestamp,
      });
      transaction.create(ref, conversation);
      return conversation;
    });
  }

  async get(ownerId: string, id: string, conversation: string): Promise<Conversation> {
    return this.database.runTransaction(transaction => this.readOwned(transaction, ownerId, id, conversation));
  }

  async list(ownerId: string, id: string): Promise<Conversation[]> {
    const projectId = ProjectIdSchema.parse(id);
    await this.projects.get(ownerId, projectId);
    const result = await this.database.collection("creation_projects").doc(projectId).collection("conversations").limit(200).get();
    return result.docs.map(doc => this.owned(ownerId, projectId, doc.data())).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  async readOwned(transaction: Transaction, ownerId: string, id: string, conversation: string): Promise<Conversation> {
    const projectId = ProjectIdSchema.parse(id);
    const conversationId = ConversationIdSchema.parse(conversation);
    await this.projects.readOwned(transaction, ownerId, projectId);
    const snapshot = await transaction.get(this.database.collection("creation_projects").doc(projectId).collection("conversations").doc(conversationId));
    if (!snapshot.exists) throw new WorkflowError("not_found", "This conversation is unavailable.");
    return this.owned(ownerId, projectId, snapshot.data());
  }

  private owned(ownerId: string, projectId: string, data: unknown): Conversation {
    const conversation = ConversationSchema.parse(data);
    if (conversation.ownerId !== ownerId || conversation.projectId !== projectId) throw new WorkflowError("access_denied", "You do not have access to this conversation.");
    return conversation;
  }
}
