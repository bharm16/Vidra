import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { AcceptedRequestSchema, type AcceptedRequest } from "@shared/schemas/workflow/request.schemas";
import type { ConversationMediaCount } from "@shared/schemas/workflow/project.schemas";
import { ConversationIdSchema, OwnerIdSchema, ProjectIdSchema, RequestIdSchema } from "@shared/schemas/workflow/identity.schemas";
import type { ProjectStore } from "@services/projects/ProjectStore";
import { WorkflowError } from "@services/projects/WorkflowError";

// Only generated and sketch media carry the request that places them in a conversation.
const CountedVersionSchema = z.object({ ownerId: z.string(), kind: z.enum(["image", "video"]), hidden: z.boolean().optional(), origin: z.object({ kind: z.enum(["generated", "sketch"]), requestId: z.string().optional() }) });

export class RequestHistoryStore {
  constructor(private readonly database: Firestore, private readonly projects: ProjectStore) {}

  async get(ownerId: string, projectId: string, id: string): Promise<AcceptedRequest> {
    await this.projects.get(ownerId, projectId);
    const requestId = RequestIdSchema.parse(id);
    const row = await this.database.collection("creation_requests").doc(requestId).get();
    if (!row.exists) throw new WorkflowError("not_found", "This accepted request is unavailable.");
    return this.owned(ownerId, projectId, requestId, row.data());
  }

  async list(ownerId: string, projectId: string, conversation: string): Promise<AcceptedRequest[]> {
    const project = await this.projects.get(ownerId, projectId);
    const conversationId = ConversationIdSchema.parse(conversation);
    const rows = await this.database.collection("creation_requests").where("ownerId", "==", ownerId).where("projectId", "==", project.id).where("conversationId", "==", conversationId).limit(200).get();
    return rows.docs.map(row => this.owned(ownerId, projectId, row.id, row.data(), conversationId)).sort((a, b) => a.acceptanceSequence - b.acceptanceSequence);
  }

  /** Pictures and clips each conversation produced. Hidden media and rows owned by another account are not counted. */
  async conversationMediaCounts(ownerId: string, projectId: string): Promise<Map<string, ConversationMediaCount>> {
    const project = await this.projects.get(ownerId, projectId);
    const [requests, versions] = await Promise.all([
      this.database.collection("creation_requests").where("ownerId", "==", ownerId).where("projectId", "==", project.id).select("conversationId").limit(2000).get(),
      this.database.collection("creation_projects").doc(project.id).collection("media_versions").select("ownerId", "kind", "origin", "hidden").limit(2000).get(),
    ]);
    const conversations = new Map<string, string>();
    for (const row of requests.docs) { const conversationId = ConversationIdSchema.safeParse(row.get("conversationId")); if (conversationId.success) conversations.set(row.id, conversationId.data); }
    const counts = new Map<string, ConversationMediaCount>();
    for (const row of versions.docs) {
      const version = CountedVersionSchema.safeParse(row.data());
      if (!version.success || version.data.ownerId !== ownerId || version.data.hidden || version.data.origin.requestId === undefined) continue;
      const conversationId = conversations.get(version.data.origin.requestId); if (conversationId === undefined) continue;
      const count = counts.get(conversationId) ?? { pictures: 0, clips: 0 };
      counts.set(conversationId, version.data.kind === "image" ? { ...count, pictures: count.pictures + 1 } : { ...count, clips: count.clips + 1 });
    }
    return counts;
  }

  private owned(ownerId: string, projectId: string, requestId: string, data: unknown, conversationId?: string): AcceptedRequest {
    const scope = z.object({ ownerId: OwnerIdSchema, projectId: ProjectIdSchema, id: RequestIdSchema, conversationId: ConversationIdSchema }).parse(data);
    if (scope.ownerId !== ownerId || scope.projectId !== projectId || scope.id !== requestId || (conversationId !== undefined && scope.conversationId !== conversationId)) {
      throw new WorkflowError("access_denied", "You do not have access to this request.");
    }
    return AcceptedRequestSchema.parse(data);
  }
}
