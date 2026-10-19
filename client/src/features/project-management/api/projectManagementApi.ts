import { z } from "zod";
import type { ApiClient } from "@/services/ApiClient";
import { getAuthRepository } from "@/repositories/index";
import { createWorkflowClient, WorkflowApiError } from "@/features/project-workspace/api/workflowApi";
import { ApiErrorResponseSchema, ApiSuccessResponseSchema } from "@shared/schemas/api.schemas";
import { ProjectSchema, ConversationSchema, ConversationListingSchema, CreateProjectCommandSchema, ChangeProjectCommandSchema, CreateConversationCommandSchema, FolderSchema, CreateFolderCommandSchema, ChangeFolderCommandSchema, type Project, type Conversation, type ConversationListing, type Folder } from "@shared/schemas/workflow/project.schemas";
import { OwnerIdSchema, ProjectIdSchema, ConversationIdSchema, FolderIdSchema, RevisionSchema } from "@shared/schemas/workflow/identity.schemas";

const ConversationPatchSchema = z.strictObject({ expectedRevision: RevisionSchema, name: z.string().trim().min(1).max(200).optional(), status: z.enum(["active", "archived"]).optional(), folderId: FolderIdSchema.nullable().optional() }).refine(value => value.name !== undefined || value.status !== undefined || value.folderId !== undefined, "A conversation change is required");
export class ProjectManagementApi {
  private readonly ownerId: string;
  private readonly client: Pick<ApiClient, "rawRequest">;
  constructor(ownerId: string, client?: Pick<ApiClient, "rawRequest">) { this.ownerId = OwnerIdSchema.parse(ownerId); this.client = client ?? createWorkflowClient(ownerId); }
  private async request<T extends z.ZodType>(path: string, schema: T, method = "GET", body?: unknown, signal?: AbortSignal): Promise<z.output<T>> {
    this.requireOwner();
    const response = await this.client.rawRequest(path, { method, ...(body === undefined ? {} : { body }), ...(signal ? { signal } : {}) });
    const payload: unknown = await response.json().catch(() => undefined);
    this.requireOwner();
    if (!response.ok) { const failure = ApiErrorResponseSchema.safeParse(payload); throw new WorkflowApiError(failure.success ? failure.data.error : "The change was not confirmed. Check your connection and try again.", response.status, failure.success ? failure.data.code : undefined); }
    return schema.parse(ApiSuccessResponseSchema(z.unknown()).parse(payload).data);
  }
  private requireOwner(): void { if (getAuthRepository().getCurrentUser()?.uid !== this.ownerId) throw new WorkflowApiError("Sign in to the original account to view or change this project.", 401, "AUTH_REQUIRED"); }
  private projectSchema(id?: string): z.ZodType<Project> { return ProjectSchema.refine(project => project.ownerId === this.ownerId && (id === undefined || project.id === id), "This project does not belong to the requested account."); }
  private conversationSchema(projectId: string, id?: string): z.ZodType<Conversation> { return ConversationSchema.refine(conversation => conversation.ownerId === this.ownerId && conversation.projectId === projectId && (id === undefined || conversation.id === id), "This conversation does not belong to the requested project and account."); }
  listProjects(signal?: AbortSignal): Promise<Project[]> { return this.request("/projects", z.array(this.projectSchema()), "GET", undefined, signal); }
  getProject(projectId: string): Promise<Project> { const id = ProjectIdSchema.parse(projectId); return this.request(`/projects/${encodeURIComponent(id)}`, this.projectSchema(id)); }
  listConversations(projectId: string): Promise<ConversationListing[]> { const id = ProjectIdSchema.parse(projectId); return this.request(`/projects/${encodeURIComponent(id)}/conversations`, z.array(ConversationListingSchema.refine(conversation => conversation.ownerId === this.ownerId && conversation.projectId === id, "This conversation does not belong to the requested project and account."))); }
  createProject(id: string, name: string): Promise<Project> { const command = CreateProjectCommandSchema.parse({ id, name }); return this.request("/projects", this.projectSchema(command.id), "POST", command); }
  createConversation(projectId: string, id: string, name: string): Promise<Conversation> { const project = ProjectIdSchema.parse(projectId); const command = CreateConversationCommandSchema.parse({ id, name }); return this.request(`/projects/${encodeURIComponent(project)}/conversations`, this.conversationSchema(project, command.id), "POST", command); }
  changeProject(projectId: string, patch: { expectedRevision: number; name?: string; instructions?: string; status?: "active" | "trashed" }): Promise<Project> { const id = ProjectIdSchema.parse(projectId); return this.request(`/projects/${encodeURIComponent(id)}`, this.projectSchema(id), "PATCH", ChangeProjectCommandSchema.parse(patch)); }
  private folderSchema(id?: string): z.ZodType<Folder> { return FolderSchema.refine(folder => folder.ownerId === this.ownerId && (id === undefined || folder.id === id), "This project does not belong to the requested account."); }
  getFolder(folderId: string, signal?: AbortSignal): Promise<Folder> { const id = FolderIdSchema.parse(folderId); return this.request(`/folders/${encodeURIComponent(id)}`, this.folderSchema(id), "GET", undefined, signal); }
  listFolders(signal?: AbortSignal): Promise<Folder[]> { return this.request("/folders", z.array(this.folderSchema()), "GET", undefined, signal); }
  createFolder(id: string, name: string): Promise<Folder> { const command = CreateFolderCommandSchema.parse({ id, name }); return this.request("/folders", this.folderSchema(command.id), "POST", command); }
  changeFolder(folderId: string, patch: { expectedRevision: number; name?: string; status?: "active" | "trashed" }): Promise<Folder> { const id = FolderIdSchema.parse(folderId); return this.request(`/folders/${encodeURIComponent(id)}`, this.folderSchema(id), "PATCH", ChangeFolderCommandSchema.parse(patch)); }
  changeConversation(projectId: string, conversationId: string, patch: { expectedRevision: number; name?: string; status?: "active" | "archived"; folderId?: string | null }): Promise<Conversation> { const project = ProjectIdSchema.parse(projectId); const id = ConversationIdSchema.parse(conversationId); return this.request(`/projects/${encodeURIComponent(project)}/conversations/${encodeURIComponent(id)}`, this.conversationSchema(project, id), "PATCH", ConversationPatchSchema.parse(patch)); }
}
