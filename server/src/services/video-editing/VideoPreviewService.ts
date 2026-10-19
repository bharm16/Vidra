import type { Firestore } from "firebase-admin/firestore";
import { rm } from "node:fs/promises";
import { z } from "zod";
import type { MediaVersionIndex } from "@services/media-history/MediaVersionIndex";
import type { ProjectStore } from "@services/projects/ProjectStore";
import { WorkflowError } from "@services/projects/WorkflowError";
import { logger } from "@infrastructure/Logger";
import { canonicalJson } from "@shared/workflow/canonicalJson";
import { ProjectIdSchema, VersionIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { sha256Hex } from "@utils/hash";
import type { ExportStorage } from "@services/video-export/ExportStorage";
import type { NativeVideoRenderer } from "@services/video-export/NativeVideoRenderer";
const PreviewSchema = z.strictObject({ ownerId: z.string(), versionId: VersionIdSchema, objectHash: z.string(), renderer: z.string(), storagePath: z.string(), generation: z.string(), sha256: z.string(), bytes: z.number().int().positive(), frames: z.number().int().positive(), width: z.number().int().positive(), height: z.number().int().positive(), framesPerSecond: z.literal(30), audio: z.enum(["present", "absent"]), createdAt: z.string() });
export interface EditorPreviewAccess { url: string; expiresAt: string; frames: number; width: number; height: number; framesPerSecond: 30; audio: "present" | "absent"; }
/** Bounded derived cache; only exact owned immutable sources are normalized. */
export class VideoPreviewService {
  private readonly preparing = new Map<string, Promise<z.infer<typeof PreviewSchema>>>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly database: Firestore, private readonly projects: ProjectStore, private readonly media: MediaVersionIndex, private readonly storage: ExportStorage, private readonly renderer: NativeVideoRenderer) {}
  async access(ownerId: string, project: string, version: string): Promise<EditorPreviewAccess> {
    const projectId = ProjectIdSchema.parse(project); const versionId = VersionIdSchema.parse(version);
    await this.projects.get(ownerId, projectId); const source = await this.media.get(ownerId, projectId, versionId);
    if (!source || source.ownerId !== ownerId || source.object.identity !== "verified" || source.metadata.state !== "verified" || (source.kind !== "video" && source.kind !== "export")) throw new WorkflowError("input_unavailable", "This exact clip cannot be prepared for the editor.");
    const objectHash = sha256Hex(canonicalJson(source.object)); const renderer = await this.renderer.fingerprint(); const key = sha256Hex(canonicalJson({ ownerId, projectId, versionId, objectHash, renderer }));
    const ref = this.database.collection("creation_projects").doc(projectId).collection("video_previews").doc(key);
    const existing = await ref.get(); let preview = existing.exists ? PreviewSchema.parse(existing.data()) : undefined;
    if (preview && (preview.ownerId !== ownerId || preview.versionId !== versionId || preview.objectHash !== objectHash || preview.renderer !== renderer)) throw new WorkflowError("access_denied", "This editor preview is unavailable.");
    if (preview) { const object = await this.storage.inspect(preview.storagePath); if (!object || object.generation !== preview.generation || object.sha256 !== preview.sha256 || object.bytes !== preview.bytes) preview = undefined; }
    if (!preview) {
      let task = this.preparing.get(key);
      if (!task) {
        task = this.queue.then(async () => {
          await this.prune(ownerId, projectId, 32, 1024 * 1024 * 1024 - 268435456);
          let rendered;
          try { rendered = await this.renderer.normalize(ownerId, source, new AbortController().signal); }
          catch (error) { logger.warn("Editor preview normalization failed", { versionId, error: error instanceof Error ? error.message : String(error) }); throw new WorkflowError("capability_unavailable", error instanceof WorkflowError ? error.message : "This clip's editor preview could not be prepared."); }
          try {
            const target = `users/${ownerId}/video-previews/${key}.mp4`; const object = await this.storage.store(target, rendered.localPath, { sha256: rendered.sha256, bytes: rendered.bytes });
            const created = PreviewSchema.parse({ ownerId, versionId, objectHash, renderer, ...object, frames: rendered.frames, width: rendered.width, height: rendered.height, framesPerSecond: 30, audio: rendered.audio, createdAt: new Date().toISOString() });
            const current = await this.media.get(ownerId, projectId, versionId); if (!current || sha256Hex(canonicalJson(current.object)) !== objectHash) throw new WorkflowError("input_unavailable", "The original clip is unavailable. The editor will not substitute a stale preview.");
            await ref.set(created);
            await this.database.collection("creation_projects").doc(projectId).collection("video_source_frames").doc(versionId).set({ objectHash, frames: created.frames, normalizationVersion: "vidra-cfr30/v1", renderer });
            return created;
          } finally { await rm(rendered.directory, { recursive: true, force: true }); }
        }).finally(() => { this.preparing.delete(key); });
        this.preparing.set(key, task); this.queue = task.catch(() => undefined);
      }
      preview = await task;
    }
    const current = await this.media.get(ownerId, projectId, versionId); if (!current || sha256Hex(canonicalJson(current.object)) !== objectHash) throw new WorkflowError("input_unavailable", "This exact clip is no longer available for preview.");
    const access = await this.storage.access(ownerId, preview.storagePath, preview.generation);
    return { ...access, frames: preview.frames, width: preview.width, height: preview.height, framesPerSecond: 30, audio: preview.audio };
  }
  private async prune(ownerId: string, projectId: string, count: number, maximumBytes: number): Promise<void> {
    const ref = this.database.collection("creation_projects").doc(projectId).collection("video_previews"); const rows = await ref.limit(200).get();
    const entries = rows.docs.map(row => ({ row, preview: PreviewSchema.parse(row.data()) })).filter(entry => entry.preview.ownerId === ownerId).sort((a, b) => a.preview.createdAt.localeCompare(b.preview.createdAt));
    let bytes = entries.reduce((total, entry) => total + entry.preview.bytes, 0); let remaining = entries.length;
    for (const entry of entries) { const expired = Date.now() - Date.parse(entry.preview.createdAt) > 7 * 24 * 60 * 60_000; if (!expired && remaining < count && bytes <= maximumBytes) break; await this.storage.remove(entry.preview.storagePath, entry.preview.generation); await entry.row.ref.delete(); bytes -= entry.preview.bytes; remaining -= 1; }
  }
}
