import { z } from "zod";
import { ApiErrorResponseSchema, ApiSuccessResponseSchema } from "@shared/schemas/api.schemas";
import { ProjectIdSchema, VersionIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { ChangeMediaSchema, DeriveFrameSchema } from "@shared/schemas/workflow/management.schemas";
import { MediaVersionSchema, type MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { createWorkflowClient, WorkflowApiError } from "./workflowApi";

/** Exact-version actions share the workspace's account-bound transport. */
export class MediaActionsApi {
  private readonly client;
  constructor(private readonly ownerId: string, private readonly projectId: string) {
    ProjectIdSchema.parse(projectId);
    this.client = createWorkflowClient(ownerId);
  }
  private owned() { return MediaVersionSchema.refine(row => row.ownerId === this.ownerId && row.projectId === this.projectId, "The media response belongs to different work."); }
  private async request<T extends z.ZodType>(versionId: string, suffix: string, schema: T, method: string, body?: unknown): Promise<z.output<T>> {
    VersionIdSchema.parse(versionId);
    const response = await this.client.rawRequest(`/projects/${encodeURIComponent(this.projectId)}/media/${encodeURIComponent(versionId)}${suffix}`, { method, ...(body === undefined ? {} : { body }) });
    const value: unknown = await response.json().catch(() => undefined);
    if (!response.ok) { const parsed = ApiErrorResponseSchema.safeParse(value); throw new WorkflowApiError(parsed.success ? parsed.data.error : "This media action was not confirmed.", response.status, parsed.success ? parsed.data.code : undefined); }
    return schema.parse(ApiSuccessResponseSchema(z.unknown()).parse(value).data);
  }
  change(versionId: string, patch: { label?: string; hidden?: boolean; favorite?: boolean }): Promise<MediaVersion> {
    return this.request(versionId, "", this.owned().refine(row => row.id === versionId), "PATCH", ChangeMediaSchema.parse(patch));
  }
  preferred(versionId: string): Promise<MediaVersion[]> { return this.request(versionId, "/preferred", z.array(this.owned()), "POST", {}); }
  frame(versionId: string, id: string, timestampSeconds: number): Promise<MediaVersion> { return this.request(versionId, "/frame", this.owned().refine(row => row.id === id && row.origin.kind === "frame" && row.origin.versionId === versionId), "POST", DeriveFrameSchema.parse({ id, timestampSeconds })); }
  download(versionId: string): Promise<{ url: string; expiresAt: string }> { return this.request(versionId, "/download", z.object({ url: z.string().url(), expiresAt: z.string() }), "GET"); }
}
