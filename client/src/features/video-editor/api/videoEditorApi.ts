import { z } from "zod";
import { ApiSuccessResponseSchema, ApiErrorResponseSchema } from "@shared/schemas/api.schemas";
import { CreateVideoEditSchema, CreateVideoExportSchema, EditCommandSchema, ExportIdSchema, SaveVideoEditSchema, VideoCaptionValidationDetailsSchema, VideoEditSchema, VideoExportSchema, type VideoCaptionValidationDetails, type VideoEdit, type VideoComposition, type EditCommand, type VideoExport } from "@shared/schemas/workflow/video-edit.schemas";
import { OwnerIdSchema, ProjectIdSchema, EditIdSchema, VersionIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { createWorkflowClient, WorkflowApiError } from "@/features/project-workspace/api/workflowApi";
import type { ApiClient } from "@/services/ApiClient";
import { VideoCaptionValidationError } from "./VideoCaptionValidationError";

export type ExportEnvelope = z.infer<typeof CreateVideoExportSchema>;
const AccessSchema = z.strictObject({ url: z.url().refine(value => value.startsWith("https://") || value.startsWith("http://localhost") || value.startsWith("http://127.0.0.1"), "Export access must use an authorized URL"), expiresAt: z.string() });
const PreviewSchema = AccessSchema.extend({ frames: z.number().int().positive(), width: z.number().int().positive(), height: z.number().int().positive(), framesPerSecond: z.literal(30), audio: z.enum(["present", "absent"]) });
function captionValidationDetails(serialized: string | undefined): VideoCaptionValidationDetails | undefined {
  if (serialized === undefined) return undefined;
  try { const payload: unknown = JSON.parse(serialized); const parsed = VideoCaptionValidationDetailsSchema.safeParse(payload); return parsed.success ? parsed.data : undefined; } catch { return undefined; }
}

/** No automatic request replay: accepted export identities survive a lost response. */
export class VideoEditorApi {
  private readonly client: Pick<ApiClient, "rawRequest">;
  private readonly owner: string;
  private readonly project: string;
  constructor(owner: string, project: string, client?: Pick<ApiClient, "rawRequest">) {
    this.owner = OwnerIdSchema.parse(owner); this.project = ProjectIdSchema.parse(project);
    this.client = client ?? createWorkflowClient(owner);
  }
  private path(path = ""): string { return `/projects/${encodeURIComponent(this.project)}${path}`; }
  private editPath(id: string): string { return `/video-edits/${encodeURIComponent(EditIdSchema.parse(id))}`; }
  private exportPath(id: string): string { return `/exports/${encodeURIComponent(ExportIdSchema.parse(id))}`; }
  private async request<T extends z.ZodType>(path: string, schema: T, method = "GET", body?: unknown, signal?: AbortSignal, captionSubmission?: { editId: string; revision: number }): Promise<z.output<T>> {
    const response = await this.client.rawRequest(this.path(path), { method, ...(body === undefined ? {} : { body }), ...(signal ? { signal } : {}) });
    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const failure = ApiErrorResponseSchema.safeParse(payload);
      if (response.status === 422 && failure.success && failure.data.code === "invalid_settings" && captionSubmission) {
        const details = captionValidationDetails(failure.data.details);
        if (details && details.ownerId === this.owner && details.projectId === this.project && details.editId === captionSubmission.editId && details.revision === captionSubmission.revision) throw new VideoCaptionValidationError(failure.data.error, details);
      }
      throw new WorkflowApiError(failure.success ? failure.data.error : `This change was not confirmed (${response.status}).`, response.status, failure.success ? failure.data.code : undefined);
    }
    return schema.parse(ApiSuccessResponseSchema(z.unknown()).parse(payload).data);
  }
  private editSchema(id?: string): typeof VideoEditSchema { return VideoEditSchema.refine(value => value.ownerId === this.owner && value.projectId === this.project && (id === undefined || value.id === id), "The edit belongs to different work or another account."); }
  private exportSchema(id?: string): typeof VideoExportSchema { return VideoExportSchema.refine(value => value.ownerId === this.owner && value.projectId === this.project && (id === undefined || value.id === id), "The export belongs to different work or another account."); }
  list(signal?: AbortSignal): Promise<VideoEdit[]> { return this.request("/video-edits", z.array(this.editSchema()), "GET", undefined, signal); }
  get(id: string, signal?: AbortSignal): Promise<VideoEdit> { return this.request(this.editPath(id), this.editSchema(id), "GET", undefined, signal); }
  revisions(id: string): Promise<VideoEdit[]> { return this.request(`${this.editPath(id)}/revisions`, z.array(this.editSchema(id))); }
  create(id: string, composition: VideoComposition): Promise<VideoEdit> { return this.request("/video-edits", this.editSchema(id), "POST", CreateVideoEditSchema.parse({ id, name: "Video edit", composition })); }
  async command(id: string, revision: number, operationId: string, command: EditCommand): Promise<VideoEdit> { return this.request(`${this.editPath(id)}/commands`, this.editSchema(id), "POST", SaveVideoEditSchema.parse({ operationId, expectedRevision: revision, command: EditCommandSchema.parse(command) })); }
  exports(signal?: AbortSignal): Promise<VideoExport[]> { return this.request("/exports", z.array(this.exportSchema()), "GET", undefined, signal); }
  startExport(id: string, envelope: ExportEnvelope): Promise<VideoExport> { return this.request(`${this.editPath(id)}/exports`, this.exportSchema().refine(value => value.editId === id && value.submissionId === envelope.submissionId && value.executionDraftId === envelope.executionDraftId && value.executionDraftRevision === envelope.executionDraftRevision && value.revision === envelope.revision && value.composition.preset === envelope.preset, "The export receipt does not match its captured edit."), "POST", CreateVideoExportSchema.parse(envelope), undefined, { editId: id, revision: envelope.revision }); }
  export(id: string): Promise<VideoExport> { return this.request(this.exportPath(id), this.exportSchema(id)); }
  resume(id: string): Promise<VideoExport> { return this.request(`${this.exportPath(id)}/resume`, this.exportSchema(id), "POST", {}); }
  cancel(id: string): Promise<VideoExport> { return this.request(`${this.exportPath(id)}/cancel`, this.exportSchema(id), "POST", {}); }
  access(id: string): Promise<z.infer<typeof AccessSchema>> { return this.request(`${this.exportPath(id)}/access`, AccessSchema); }
  preview(versionId: string): Promise<z.infer<typeof PreviewSchema>> { return this.request(`/media/${encodeURIComponent(VersionIdSchema.parse(versionId))}/editor-preview`, PreviewSchema); }
}
