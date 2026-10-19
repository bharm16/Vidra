import { z } from "zod";
import { ApiClient } from "@/services/ApiClient";
import { createFirebaseTokenInterceptor } from "@/services/http/AuthInterceptors";
import { getAuthRepository } from "@/repositories/index";
import { setupTelemetrySource } from "@/services/http/TelemetrySourceInterceptor";
import { ApiErrorResponseSchema, ApiSuccessResponseSchema } from "@shared/schemas/api.schemas";
import { ChangeProjectCommandSchema, CreateConversationCommandSchema, CreateProjectCommandSchema, ProjectSchema, ConversationSchema, type Project, type Conversation, ConversationListingSchema, type ConversationListing } from "@shared/schemas/workflow/project.schemas";
import { CreationDraftSchema, CreateDraftCommandSchema, SaveDraftCommandSchema, RestoreDraftCommandSchema, DraftConflictSchema, type CreationDraft, type DraftContent, type SaveDraftResult } from "@shared/schemas/workflow/draft.schemas";
import { AcceptedRequestSchema, SubmissionCommandSchema, type AcceptedRequest, type SubmissionCommand } from "@shared/schemas/workflow/request.schemas";
import { PreparedActionSchema, type PreparedAction } from "@shared/schemas/workflow/preparation.schemas";
import { CapabilityProfileSchema, type CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import { MediaVersionSchema, type MediaVersion } from "@shared/schemas/workflow/media.schemas";
import type { ApiErrorCode } from "@shared/types/api";
import { ConversationIdSchema, DraftIdSchema, OwnerIdSchema, ProjectIdSchema, RequestIdSchema, SubmissionIdSchema } from "@shared/schemas/workflow/identity.schemas";
import type { PhraseBinding } from "../state/phraseChange";
import { CopyMediaCommandSchema, ImportCommandSchema, ImportRecordSchema, ImportSessionSchema, type ImportCommand, type ImportRecord } from "@shared/schemas/workflow/import.schemas";

const RecordScopeSchema = z.object({ ownerId: OwnerIdSchema, id: z.string(), projectId: z.string().optional(), conversationId: z.string().optional() });
interface RecordScope { id?: string; projectId?: string; conversationId?: string; }
const PhraseBindingSchema = z.strictObject({
  draftId: DraftIdSchema, sequence: z.number().int().nonnegative(), contextKey: z.string().min(1),
  sourceText: z.string().min(1).max(32000), start: z.number().int().nonnegative(), end: z.number().int().positive(), text: z.string().min(1).max(10000),
}).refine(target => target.end > target.start && target.end <= target.sourceText.length && target.sourceText.slice(target.start, target.end) === target.text, "The selected phrase must match its exact captured words");
const PhraseSuggestionResponseSchema = z.object({
  suggestions: z.array(z.union([z.string().max(32000), z.object({ text: z.string().max(32000) }), z.object({ suggestion: z.string().max(32000) })])),
  isPlaceholder: z.boolean().optional(),
});

const SaveResultSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("saved"), draft: CreationDraftSchema }),
  z.object({ state: z.literal("conflict"), current: CreationDraftSchema, retained: DraftConflictSchema }),
]);

export class WorkflowApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: ApiErrorCode | undefined) { super(message); this.name = "WorkflowApiError"; }
}

export function createWorkflowClient(expectedOwnerId?: string): ApiClient {
  // Authentication is attached normally. A 401 never resends an unaccepted action.
  const client = new ApiClient();
  const authenticate = createFirebaseTokenInterceptor();
  client.addRequestInterceptor(async request => {
    if (expectedOwnerId !== undefined && getAuthRepository().getCurrentUser()?.uid !== expectedOwnerId) throw new WorkflowApiError("Sign in to the original account before saving this work.", 401, "AUTH_REQUIRED");
    const authenticated = await authenticate(request);
    if (expectedOwnerId !== undefined && getAuthRepository().getCurrentUser()?.uid !== expectedOwnerId) throw new WorkflowApiError("The account changed before the request was sent. Your draft is retained.", 401, "AUTH_REQUIRED");
    return authenticated;
  });
  setupTelemetrySource(client);
  return client;
}

export class WorkflowApi {
  private readonly client: Pick<ApiClient, "rawRequest">;
  private readonly ownerId: string | undefined;
  constructor(client?: Pick<ApiClient, "rawRequest">, ownerId?: string) {
    this.ownerId = ownerId === undefined ? undefined : OwnerIdSchema.parse(ownerId);
    this.client = client ?? createWorkflowClient(this.ownerId);
  }

  private owned<T extends z.ZodType>(schema: T, scope: RecordScope = {}): T {
    return schema.refine(value => {
      const record = RecordScopeSchema.parse(value);
      return (this.ownerId === undefined || record.ownerId === this.ownerId)
        && (scope.id === undefined || record.id === scope.id)
        && (scope.projectId === undefined || record.projectId === scope.projectId)
        && (scope.conversationId === undefined || record.conversationId === scope.conversationId);
    }, "The response does not match the requested account or work.");
  }

  private async request<T extends z.ZodType>(path: string, schema: T, method = "GET", body?: unknown, signal?: AbortSignal): Promise<z.output<T>> {
    const response = await this.client.rawRequest(path, { method, ...(body === undefined ? {} : { body }), ...(signal ? { signal } : {}) });
    const payload: unknown = await response.json().catch(() => undefined);
    if (this.ownerId !== undefined && getAuthRepository().getCurrentUser()?.uid !== this.ownerId) throw new WorkflowApiError("The account changed while this work was loading. Sign in to the original account.", 401, "AUTH_REQUIRED");
    if (!response.ok) {
      const error = ApiErrorResponseSchema.safeParse(payload);
      throw new WorkflowApiError(error.success ? error.data.error : `The request was not confirmed (${response.status}).`, response.status, error.success ? error.data.code : undefined);
    }
    return schema.parse(ApiSuccessResponseSchema(z.unknown()).parse(payload).data);
  }

  listProjects(signal?: AbortSignal): Promise<Project[]> { return this.request("/projects", z.array(this.owned(ProjectSchema)), "GET", undefined, signal); }
  async createProject(id: string, name: string): Promise<Project> {
    const command = CreateProjectCommandSchema.parse({ id, name });
    return this.request("/projects", this.owned(ProjectSchema, { id: command.id }), "POST", command);
  }
  async getProject(id: string, signal?: AbortSignal): Promise<Project> {
    const projectId = ProjectIdSchema.parse(id);
    return this.request(`/projects/${encodeURIComponent(projectId)}`, this.owned(ProjectSchema, { id: projectId }), "GET", undefined, signal);
  }
  async changeProject(id: string, patch: { expectedRevision: number; name?: string; status?: "active" | "trashed"; instructions?: string }): Promise<Project> {
    const projectId = ProjectIdSchema.parse(id);
    return this.request(`/projects/${encodeURIComponent(projectId)}`, this.owned(ProjectSchema, { id: projectId }), "PATCH", ChangeProjectCommandSchema.parse(patch));
  }
  async listConversations(project: string, signal?: AbortSignal): Promise<ConversationListing[]> {
    const projectId = ProjectIdSchema.parse(project);
    return this.request(`/projects/${encodeURIComponent(projectId)}/conversations`, z.array(this.owned(ConversationListingSchema, { projectId })), "GET", undefined, signal);
  }
  async createConversation(project: string, id: string, name: string): Promise<Conversation> {
    const projectId = ProjectIdSchema.parse(project);
    const command = CreateConversationCommandSchema.parse({ id, name });
    return this.request(`/projects/${encodeURIComponent(projectId)}/conversations`, this.owned(ConversationSchema, { projectId, id: command.id }), "POST", command);
  }
  listDrafts(projectId: string, conversationId: string, signal?: AbortSignal): Promise<CreationDraft[]> {
    ProjectIdSchema.parse(projectId); ConversationIdSchema.parse(conversationId);
    return this.request(`/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/drafts`, z.array(this.owned(CreationDraftSchema, { projectId, conversationId })), "GET", undefined, signal);
  }
  createDraft(projectId: string, conversationId: string, id: string, content: DraftContent): Promise<CreationDraft> {
    ProjectIdSchema.parse(projectId); ConversationIdSchema.parse(conversationId);
    const command = CreateDraftCommandSchema.parse({ id, content });
    if (content.destination.projectId !== projectId || content.destination.conversationId !== conversationId) return Promise.reject(new Error("The draft destination does not match this conversation."));
    return this.request(`/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/drafts`, this.owned(CreationDraftSchema, { projectId, conversationId, id }), "POST", command);
  }
  saveDraft(projectId: string, id: string, expectedRevision: number, content: DraftContent): Promise<SaveDraftResult> {
    ProjectIdSchema.parse(projectId); DraftIdSchema.parse(id);
    if (content.destination.projectId !== projectId) return Promise.reject(new Error("The draft destination does not match this project."));
    const schema = SaveResultSchema.refine(result => {
      const current = result.state === "saved" ? result.draft : result.current;
      return current.id === id && current.projectId === projectId && current.conversationId === content.destination.conversationId && (this.ownerId === undefined || current.ownerId === this.ownerId) && (result.state !== "conflict" || (result.retained.draftId === id && (this.ownerId === undefined || result.retained.ownerId === this.ownerId)));
    }, "The saved draft does not match this account or destination.");
    return this.request(`/projects/${encodeURIComponent(projectId)}/drafts/${encodeURIComponent(id)}`, schema, "PATCH", SaveDraftCommandSchema.parse({ expectedRevision, content }));
  }
  draftStatus(projectId: string, id: string, expectedRevision: number, status: "open" | "parked" | "discarded"): Promise<CreationDraft> {
    ProjectIdSchema.parse(projectId); DraftIdSchema.parse(id);
    return this.request(`/projects/${encodeURIComponent(projectId)}/drafts/${encodeURIComponent(id)}/status`, this.owned(CreationDraftSchema, { projectId, id }), "POST", z.strictObject({ expectedRevision: z.number().int().positive(), status: z.enum(["open", "parked", "discarded"]) }).parse({ expectedRevision, status }));
  }
  restoreDraft(projectId: string, id: string, expectedRevision: number, sourceRevision: number): Promise<CreationDraft> {
    ProjectIdSchema.parse(projectId); DraftIdSchema.parse(id);
    return this.request(`/projects/${encodeURIComponent(projectId)}/drafts/${encodeURIComponent(id)}/restore`, this.owned(CreationDraftSchema, { projectId, id }), "POST", RestoreDraftCommandSchema.parse({ expectedRevision, sourceRevision }));
  }
  profiles(signal?: AbortSignal): Promise<CapabilityProfile[]> { return this.request("/workflow/profiles", z.array(CapabilityProfileSchema), "GET", undefined, signal); }
  async phraseSuggestions(input: PhraseBinding, direction?: string, signal?: AbortSignal): Promise<string[]> {
    if (this.ownerId === undefined) throw new WorkflowApiError("Sign in to the original account before requesting suggestions.", 401, "AUTH_REQUIRED");
    const target = PhraseBindingSchema.parse(input);
    const customRequest = direction === undefined ? undefined : z.string().trim().min(1).max(500).parse(direction);
    const context = { highlightedText: target.text, fullPrompt: target.sourceText, contextBefore: target.sourceText.slice(Math.max(0, target.start - 5000), target.start), contextAfter: target.sourceText.slice(target.end, target.end + 5000) };
    const payload = customRequest === undefined
      ? { ...context, originalUserPrompt: target.sourceText }
      : { ...context, customRequest, metadata: { draftId: target.draftId, revision: target.sequence, startIndex: target.start, endIndex: target.end, contextKey: target.contextKey } };
    const result = await this.request(customRequest === undefined ? "/enhancement/suggestions" : "/enhancement/custom-suggestions", PhraseSuggestionResponseSchema, "POST", payload, signal);
    return result.suggestions.map(suggestion => typeof suggestion === "string" ? suggestion : "text" in suggestion ? suggestion.text : suggestion.suggestion).filter(value => value.trim().length > 0);
  }
  history(projectId: string, conversationId: string, signal?: AbortSignal): Promise<AcceptedRequest[]> {
    ProjectIdSchema.parse(projectId); ConversationIdSchema.parse(conversationId);
    return this.request(`/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/requests`, z.array(this.owned(AcceptedRequestSchema, { projectId, conversationId })), "GET", undefined, signal);
  }
  prepare(projectId: string, draftId: string): Promise<PreparedAction> {
    ProjectIdSchema.parse(projectId); DraftIdSchema.parse(draftId);
    return this.request("/creation-requests/prepare", PreparedActionSchema.refine(result => result.draftId === draftId && (result.state !== "ready" || result.snapshot.destination.projectId === projectId), "The prepared request has a different destination."), "POST", { projectId, draftId });
  }
  submit(projectId: string, input: SubmissionCommand): Promise<AcceptedRequest> {
    ProjectIdSchema.parse(projectId); const command = SubmissionCommandSchema.parse(input);
    return this.request("/creation-requests", this.owned(AcceptedRequestSchema, { projectId }).refine(result => result.submissionId === command.submissionId && result.executionDraftId === command.draftId && result.executionDraftRevision === command.draftRevision && result.snapshotHash === command.reviewedHash, "The receipt differs from the captured submission."), "POST", { projectId, ...command });
  }
  async recover(submissionId: string): Promise<AcceptedRequest | undefined> {
    SubmissionIdSchema.parse(submissionId);
    return (await this.request(`/creation-requests/submissions/${encodeURIComponent(submissionId)}`, this.owned(AcceptedRequestSchema).refine(result => result.submissionId === submissionId, "The receipt belongs to a different submission.").nullable())) ?? undefined;
  }
  requestStatus(projectId: string, requestId: string, signal?: AbortSignal): Promise<AcceptedRequest> {
    ProjectIdSchema.parse(projectId); RequestIdSchema.parse(requestId);
    return this.request(`/creation-requests/${encodeURIComponent(requestId)}`, this.owned(AcceptedRequestSchema, { projectId, id: requestId }), "GET", undefined, signal);
  }
  cancelRequest(projectId: string, requestId: string): Promise<AcceptedRequest> {
    ProjectIdSchema.parse(projectId); RequestIdSchema.parse(requestId);
    return this.request(`/creation-requests/${encodeURIComponent(requestId)}/cancel`, this.owned(AcceptedRequestSchema, { projectId, id: requestId }), "POST", {});
  }
  reconcileRequest(projectId: string, requestId: string): Promise<AcceptedRequest> {
    ProjectIdSchema.parse(projectId); RequestIdSchema.parse(requestId);
    return this.request(`/creation-requests/${encodeURIComponent(requestId)}/reconcile`, this.owned(AcceptedRequestSchema, { projectId, id: requestId }), "POST", {});
  }
  media(projectId: string, signal?: AbortSignal): Promise<MediaVersion[]> { return this.request(`/projects/${encodeURIComponent(projectId)}/media`, z.array(this.owned(MediaVersionSchema, { projectId })), "GET", undefined, signal); }
  imports(projectId: string, signal?: AbortSignal): Promise<ImportRecord[]> { return this.request(`/projects/${encodeURIComponent(projectId)}/imports`, z.array(this.owned(ImportRecordSchema, { projectId })), "GET", undefined, signal); }
  beginImport(projectId: string, command: ImportCommand, signal?: AbortSignal): Promise<z.infer<typeof ImportSessionSchema>> { return this.request(`/projects/${encodeURIComponent(projectId)}/imports`, ImportSessionSchema.refine(value => value.record.ownerId === this.ownerId && value.record.projectId === projectId && value.record.id === command.id && value.record.sha256 === command.sha256 && value.record.bytes === command.bytes, "The upload grant does not match this file or account"), "POST", ImportCommandSchema.parse(command), signal); }
  finishImport(projectId: string, id: string, signal?: AbortSignal): Promise<MediaVersion> { return this.request(`/projects/${encodeURIComponent(projectId)}/imports/${encodeURIComponent(id)}/finish`, this.owned(MediaVersionSchema, { projectId, id: `version_${id.slice(7)}` }), "POST", {}, signal); }
  cancelImport(projectId: string, id: string, command?: ImportCommand): Promise<ImportRecord> { return this.request(`/projects/${encodeURIComponent(projectId)}/imports/${encodeURIComponent(id)}/cancel`, this.owned(ImportRecordSchema, { projectId, id }), "POST", command ? ImportCommandSchema.parse(command) : {}); }
  hideMedia(projectId: string, id: string, hidden: boolean): Promise<MediaVersion> { return this.request(`/projects/${encodeURIComponent(projectId)}/media/${encodeURIComponent(id)}`, this.owned(MediaVersionSchema, { projectId, id }), "PATCH", { hidden }); }
  copyMedia(projectId: string, id: string, targetProjectId: string, copyId: string): Promise<MediaVersion> { return this.request(`/projects/${encodeURIComponent(projectId)}/media/${encodeURIComponent(id)}/copy`, this.owned(MediaVersionSchema, { projectId: targetProjectId, id: copyId }), "POST", CopyMediaCommandSchema.parse({ targetProjectId, id: copyId })); }
  access(projectId: string, versionId: string): Promise<{ url: string; expiresAt?: string | undefined }> { return this.request(`/projects/${encodeURIComponent(projectId)}/media/${encodeURIComponent(versionId)}/access`, z.object({ url: z.url(), expiresAt: z.iso.datetime().optional() })); }
}

export const workflowApi = new WorkflowApi();
