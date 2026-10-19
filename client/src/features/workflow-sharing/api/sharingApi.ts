import { z } from "zod";
import { ApiClient } from "@/services/ApiClient";
import { ApiErrorResponseSchema, ApiSuccessResponseSchema } from "@shared/schemas/api.schemas";
import { OwnerIdSchema, ProjectIdSchema, VersionIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { PublishVersionSchema, PublicVersionSchema, VersionShareSchema, WorkflowShareIdSchema, type PublicVersion, type VersionShare } from "@shared/schemas/workflow/sharing.schemas";
import { createWorkflowClient } from "@/features/project-workspace/api/workflowApi";

export class SharingApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "SharingApiError"; }
}
async function read<T extends z.ZodType>(response: Response, schema: T): Promise<z.output<T>> {
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const parsed = ApiErrorResponseSchema.safeParse(payload);
    throw new SharingApiError(parsed.success ? parsed.data.error : "The sharing request was not confirmed.", response.status);
  }
  return schema.parse(ApiSuccessResponseSchema(z.unknown()).parse(payload).data);
}
export interface OwnedSharesPort {
  list(projectId: string, signal?: AbortSignal): Promise<VersionShare[]>;
  publish(projectId: string, versionId: string, id: string): Promise<VersionShare>;
  revoke(projectId: string, id: string): Promise<VersionShare>;
  access(projectId: string, versionId: string, signal?: AbortSignal): Promise<{ url: string }>;
}
export class OwnedSharesApi implements OwnedSharesPort {
  private readonly ownerId: string;
  private readonly client: Pick<ApiClient, "rawRequest">;
  constructor(ownerId: string, client?: Pick<ApiClient, "rawRequest">) { this.ownerId = OwnerIdSchema.parse(ownerId); this.client = client ?? createWorkflowClient(this.ownerId); }
  private scoped(projectId: string): typeof VersionShareSchema {
    return VersionShareSchema.refine(share => share.ownerId === this.ownerId && share.projectId === projectId, "Sharing response belongs to another account or project.");
  }
  async list(project: string, signal?: AbortSignal): Promise<VersionShare[]> {
    const projectId = ProjectIdSchema.parse(project);
    return read(await this.client.rawRequest(`/projects/${encodeURIComponent(projectId)}/shares`, { ...(signal ? { signal } : {}), fetchOptions: { cache: "no-store" } }), z.array(this.scoped(projectId)));
  }
  async publish(project: string, versionId: string, id: string): Promise<VersionShare> {
    const projectId = ProjectIdSchema.parse(project);
    const command = PublishVersionSchema.parse({ id, versionId });
    return read(await this.client.rawRequest(`/projects/${encodeURIComponent(projectId)}/shares`, { method: "POST", body: command }), this.scoped(projectId).refine(share => share.id === id && share.versionId === versionId, "Publication does not match the exact requested version."));
  }
  async revoke(project: string, id: string): Promise<VersionShare> {
    const projectId = ProjectIdSchema.parse(project); WorkflowShareIdSchema.parse(id);
    return read(await this.client.rawRequest(`/projects/${encodeURIComponent(projectId)}/shares/${encodeURIComponent(id)}/revoke`, { method: "POST", body: {} }), this.scoped(projectId).refine(share => share.id === id && share.revoked, "The link revocation was not confirmed."));
  }
  async access(project: string, version: string, signal?: AbortSignal): Promise<{ url: string }> {
    const projectId = ProjectIdSchema.parse(project); const versionId = VersionIdSchema.parse(version);
    return read(await this.client.rawRequest(`/projects/${encodeURIComponent(projectId)}/media/${encodeURIComponent(versionId)}/access`, { ...(signal ? { signal } : {}), fetchOptions: { cache: "no-store" } }), z.object({ url: z.url().refine(value => /^https?:$/.test(new URL(value).protocol)), expiresAt: z.iso.datetime().optional() }));
  }
}
export interface PublicSharesPort {
  resolve(id: string, signal?: AbortSignal): Promise<PublicVersion>;
  download(id: string): Promise<{ blob: Blob; filename: string }>;
}
export class PublicSharesApi implements PublicSharesPort {
  constructor(private readonly client: Pick<ApiClient, "rawRequest"> = new ApiClient()) {}
  async resolve(value: string, signal?: AbortSignal): Promise<PublicVersion> {
    const id = WorkflowShareIdSchema.parse(value);
    return read(await this.client.rawRequest(`/public/workflow-shares/${encodeURIComponent(id)}`, { ...(signal ? { signal } : {}), fetchOptions: { cache: "no-store" } }), PublicVersionSchema.refine(version => {
      const url = new URL(version.url);
      return version.id === id && url.origin === window.location.origin && url.pathname === `/api/public/workflow-shares/${id}/content` && !url.username && !url.password && !url.hash && !url.search;
    }, "The public response must resolve this exact same-origin share."));
  }
  async download(id: string): Promise<{ blob: Blob; filename: string }> {
    const version = await this.resolve(id);
    const response = await this.client.rawRequest(`/public/workflow-shares/${encodeURIComponent(version.id)}/content`, { fetchOptions: { cache: "no-store" } });
    if (!response.ok) throw new SharingApiError("The download could not be opened.", response.status);
    const type = response.headers.get("Content-Type") ?? "";
    if (!/^(image\/(png|jpeg|webp|gif|avif)|video\/(mp4|webm|quicktime))(;|$)/i.test(type)) throw new Error("The shared file type could not be verified.");
    const extensions: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif", "image/avif": ".avif", "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov" };
    const mime = type.split(";")[0]?.toLowerCase() ?? "";
    const extension = extensions[mime] ?? (version.kind === "image" ? ".png" : ".mp4");
    const label = Array.from(version.label.replace(/[\\/:*?"<>|]/g, "-")).map(character => character.charCodeAt(0) < 32 ? "-" : character).join("");
    const filename = label.toLowerCase().endsWith(extension) ? label : label.replace(/\.[a-z0-9]{2,5}$/i, "") + extension;
    return { blob: await response.blob(), filename };
  }
}
