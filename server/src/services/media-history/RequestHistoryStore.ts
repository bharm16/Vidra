import type { Firestore } from "firebase-admin/firestore";
import { AcceptedRequestSchema, type AcceptedRequest } from "@shared/schemas/workflow/request.schemas";
import { ConversationIdSchema, RequestIdSchema } from "@shared/schemas/workflow/identity.schemas";
import type { ProjectStore } from "@services/projects/ProjectStore";
import { WorkflowError } from "@services/projects/WorkflowError";

export class RequestHistoryStore {
  constructor(private readonly database: Firestore, private readonly projects: ProjectStore) {}

  async get(ownerId: string, projectId: string, id: string): Promise<AcceptedRequest> {
    await this.projects.get(ownerId, projectId);
    const row = await this.database.collection("creation_requests").doc(RequestIdSchema.parse(id)).get();
    if (!row.exists) throw new WorkflowError("not_found", "This accepted request is unavailable.");
    return this.owned(ownerId, projectId, row.data());
  }

  async list(ownerId: string, projectId: string, conversation: string): Promise<AcceptedRequest[]> {
    const project = await this.projects.get(ownerId, projectId);
    const conversationId = ConversationIdSchema.parse(conversation);
    const rows = await this.database.collection("creation_requests").where("ownerId", "==", ownerId).where("projectId", "==", project.id).where("conversationId", "==", conversationId).limit(200).get();
    return rows.docs.map(row => this.owned(ownerId, projectId, row.data())).sort((a, b) => a.acceptanceSequence - b.acceptanceSequence);
  }

  private owned(ownerId: string, projectId: string, data: unknown): AcceptedRequest {
    const request = AcceptedRequestSchema.parse(data);
    if (request.ownerId !== ownerId || request.projectId !== projectId) throw new WorkflowError("access_denied", "You do not have access to this request.");
    return request;
  }
}
