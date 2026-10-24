import { z } from "zod";
import { ApiErrorResponseSchema, ApiSuccessResponseSchema } from "@shared/schemas/api.schemas";
import { ProjectIdSchema, VersionIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { ChangeMediaSchema, DeriveFrameSchema } from "@shared/schemas/workflow/management.schemas";
import { MediaVersionSchema, type MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { OwnedRequest } from "@/services/http/OwnedRequest";

/** Exact-version actions share the workspace's account-bound transport. */
export class MediaActionsApi {
  private readonly transport: OwnedRequest;
  constructor(private readonly ownerId: string, private readonly projectId: string) {
    ProjectIdSchema.parse(projectId);
    this.transport = new OwnedRequest(ownerId);
  }
  private owned() { return MediaVersionSchema.refine(row => row.ownerId === this.ownerId && row.projectId === this.projectId, "The media response belongs to different work."); }
  private async request<T extends z.ZodType>(versionId: string, suffix: string, schema: T, method: string, body?: unknown): Promise<z.output<T>> {
    VersionIdSchema.parse(versionId);
    return this.transport.request(`/projects/${encodeURIComponent(this.projectId)}/media/${encodeURIComponent(versionId)}${suffix}`, schema, method, body);
  }

  change(versionId: string, patch: { label?: string; hidden?: boolean; favorite?: boolean }): Promise<MediaVersion> {
    return this.request(versionId, "", this.owned().refine(row => row.id === versionId), "PATCH", ChangeMediaSchema.parse(patch));
  }
  preferred(versionId: string): Promise<MediaVersion[]> { return this.request(versionId, "/preferred", z.array(this.owned()), "POST", {}); }
  frame(versionId: string, id: string, timestampSeconds: number): Promise<MediaVersion> { return this.request(versionId, "/frame", this.owned().refine(row => row.id === id && row.origin.kind === "frame" && row.origin.versionId === versionId), "POST", DeriveFrameSchema.parse({ id, timestampSeconds })); }
  download(versionId: string): Promise<{ url: string; expiresAt: string }> { return this.request(versionId, "/download", z.object({ url: z.string().url(), expiresAt: z.string() }), "GET"); }
}
