import type { Firestore, Transaction, DocumentReference } from "firebase-admin/firestore";
import { z } from "zod";
import { CreateVideoEditSchema, SaveVideoEditSchema, VideoEditSchema, type VideoEdit, type VideoEditChange, type VideoValidationIssue } from "@shared/schemas/workflow/video-edit.schemas";
import { EditIdSchema, OwnerIdSchema, ProjectIdSchema, RevisionSchema } from "@shared/schemas/workflow/identity.schemas";
import { canonicalJson } from "@shared/workflow/canonicalJson";
import { applyEditCommand, sourceVersionIds, validateVideoComposition } from "@shared/video-edit/composition";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import type { ProjectStore } from "@services/projects/ProjectStore";
import type { MediaVersionIndex } from "@services/media-history/MediaVersionIndex";
import { WorkflowError } from "@services/projects/WorkflowError";
import { requireWritableProject } from "@services/projects/projectAccess";
import { sha256Hex } from "@utils/hash";

export class VideoEditStore {
  constructor(private readonly database: Firestore, private readonly projects: ProjectStore, private readonly media: MediaVersionIndex, private readonly now: () => string = () => new Date().toISOString()) {}
  async create(owner: string, project: string, input: unknown): Promise<VideoEdit> {
    const command = CreateVideoEditSchema.parse(input);
    return this.database.runTransaction(async transaction => {
      requireWritableProject(await this.projects.readOwned(transaction, owner, project));
      const ref = this.ref(project, command.id); const existing = await transaction.get(ref);
      const identityRef = this.database.collection("video_edit_identities").doc(sha256Hex(canonicalJson({ ownerId: owner, editId: command.id })));
      const identityRow = await transaction.get(identityRef);
      if (identityRow.exists) { const identity = z.object({ ownerId: OwnerIdSchema, projectId: ProjectIdSchema, editId: EditIdSchema }).parse(identityRow.data()); if (identity.ownerId !== owner || identity.projectId !== project || identity.editId !== command.id) throw new WorkflowError("submission_conflict", "This video edit identity is already bound to another project."); }
      if (existing.exists) return this.owned(owner, project, command.id, existing.data());
      const sources = await this.sources(owner, project, command.composition, transaction);
      const timestamp = this.now();
      const edit = VideoEditSchema.parse({ schemaVersion: "vidra-workflow/v2", id: command.id, ownerId: owner, projectId: project, name: command.name, revision: 1, composition: command.composition, issues: await this.issues(project, command.composition, sources, transaction), createdAt: timestamp, updatedAt: timestamp });
      transaction.create(ref, edit); transaction.create(ref.collection("revisions").doc("1"), edit); if (!identityRow.exists) transaction.create(identityRef, { ownerId: owner, projectId: project, editId: command.id }); return edit;
    });
  }
  async get(owner: string, project: string, id: string): Promise<VideoEdit> { return this.database.runTransaction(transaction => this.readOwned(transaction, owner, project, id)); }
  async list(owner: string, project: string): Promise<VideoEdit[]> {
    await this.projects.get(owner, project);
    const rows = await this.database.collection("creation_projects").doc(ProjectIdSchema.parse(project)).collection("video_edits").orderBy("updatedAt", "desc").limit(200).get();
    return rows.docs.map(row => this.owned(owner, project, row.id, row.data())).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async revisions(owner: string, project: string, id: string): Promise<VideoEdit[]> {
    await this.get(owner, project, id); const rows = await this.ref(project, id).collection("revisions").orderBy("revision", "desc").limit(1000).get();
    return rows.docs.map(row => this.ownedRevision(owner, project, id, Number(row.id), row.data())).sort((a, b) => a.revision - b.revision);
  }
  async revision(owner: string, project: string, id: string, revision: number, transaction?: Transaction): Promise<VideoEdit> {
    RevisionSchema.parse(revision);
    if (transaction) await this.projects.readOwned(transaction, owner, project); else await this.projects.get(owner, project);
    const ref = this.ref(project, id).collection("revisions").doc(String(revision)); const row = transaction ? await transaction.get(ref) : await ref.get();
    if (!row.exists) throw new WorkflowError("not_found", "This saved video edit revision is unavailable.");
    return this.ownedRevision(owner, project, id, revision, row.data());
  }
  async save(owner: string, project: string, id: string, input: unknown): Promise<VideoEdit> {
    const command = SaveVideoEditSchema.parse(input); const payloadHash = sha256Hex(canonicalJson(command));
    return this.database.runTransaction(async transaction => {
      const current = await this.readOwned(transaction, owner, project, id); const projectRecord = await this.projects.readOwned(transaction, owner, project);
      const opRef = this.ref(project, id).collection("operations").doc(command.operationId); const previous = await transaction.get(opRef);
      if (previous.exists) { const op = z.object({ payloadHash: z.string(), revision: RevisionSchema }).parse(previous.data()); if (op.payloadHash !== payloadHash) throw new WorkflowError("submission_conflict", "This editing action identity is already used for different changes."); return this.revision(owner, project, id, op.revision, transaction); }
      requireWritableProject(projectRecord);
      if (current.revision !== command.expectedRevision) throw new WorkflowError("revision_conflict", "This video changed in another window. Keep your local changes and review the latest revision.");
      let composition;
      try { composition = command.command.kind === "restore" ? (await this.revision(owner, project, id, command.command.sourceRevision, transaction)).composition : applyEditCommand(current.composition, command.command); }
      catch (error) { if (error instanceof WorkflowError) throw error; throw new WorkflowError("invalid_settings", error instanceof Error ? error.message : "This editing action is invalid."); }
      const sources = await this.sources(owner, project, composition, transaction);
      if (command.command.kind === "copy_audio") { const itemId = command.command.itemId; const item = composition.items.find(candidate => candidate.id === itemId); const source = sources.find(version => version.id === item?.versionId); if (source?.metadata.state !== "verified" || source.metadata.audio !== "present") throw new WorkflowError("input_unavailable", "This clip does not have verified source audio to copy."); }
      const change: VideoEditChange = command.command.kind === "restore" ? { kind: "restore", restoredFrom: command.command.sourceRevision } : { kind: command.command.kind };
      const edit = VideoEditSchema.parse({ ...current, revision: current.revision + 1, composition, issues: await this.issues(project, composition, sources, transaction), change, updatedAt: this.now() });
      transaction.set(this.ref(project, id), edit); transaction.create(this.ref(project, id).collection("revisions").doc(String(edit.revision)), edit); transaction.create(opRef, { payloadHash, revision: edit.revision }); return edit;
    });
  }
  async sources(owner: string, project: string, composition: VideoEdit["composition"], transaction?: Transaction): Promise<MediaVersion[]> {
    const result: MediaVersion[] = [];
    for (const id of sourceVersionIds(composition)) { const version = await this.media.get(owner, project, id, transaction); if (version) result.push(version); }
    return result;
  }
  async issues(project: string, composition: VideoEdit["composition"], sources: MediaVersion[], transaction?: Transaction): Promise<VideoValidationIssue[]> {
    const frames = new Map<string, number>();
    for (const source of sources) {
      if (source.kind !== "video" && source.kind !== "export") continue;
      const ref = this.database.collection("creation_projects").doc(ProjectIdSchema.parse(project)).collection("video_source_frames").doc(source.id);
      const row = transaction ? await transaction.get(ref) : await ref.get();
      if (!row.exists) continue;
      const normalized = z.object({ objectHash: z.string(), frames: z.number().int().positive(), normalizationVersion: z.literal("vidra-cfr30/v1") }).parse(row.data());
      if (normalized.objectHash === sha256Hex(canonicalJson(source.object))) frames.set(source.id, normalized.frames);
    }
    return validateVideoComposition(composition, sources, frames);
  }
  async readOwned(transaction: Transaction, owner: string, project: string, id: string): Promise<VideoEdit> {
    await this.projects.readOwned(transaction, owner, project); const row = await transaction.get(this.ref(project, id));
    if (!row.exists) throw new WorkflowError("not_found", "This video edit is unavailable."); return this.owned(owner, project, id, row.data());
  }
  private ref(project: string, id: string): DocumentReference { return this.database.collection("creation_projects").doc(ProjectIdSchema.parse(project)).collection("video_edits").doc(EditIdSchema.parse(id)); }
  private owned(owner: string, project: string, id: string, value: unknown): VideoEdit {
    const scope = z.object({ ownerId: OwnerIdSchema, projectId: ProjectIdSchema, id: EditIdSchema }).parse(value);
    if (scope.ownerId !== owner || scope.projectId !== project || scope.id !== id) throw new WorkflowError("access_denied", "This video edit is unavailable."); return VideoEditSchema.parse(value);
  }
  private ownedRevision(owner: string, project: string, id: string, revision: number, value: unknown): VideoEdit { const edit = this.owned(owner, project, id, value); if (edit.revision !== revision) throw new WorkflowError("access_denied", "This saved edit revision is unavailable."); return edit; }
}
