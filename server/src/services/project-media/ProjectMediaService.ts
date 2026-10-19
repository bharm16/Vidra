import type { Firestore, DocumentReference, Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import { CopyMediaCommandSchema, ImportCommandSchema, ImportIdSchema, ImportRecordSchema, importedVersionId, type ImportRecord } from "@shared/schemas/workflow/import.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { OwnerIdSchema, ProjectIdSchema, VersionIdSchema } from "@shared/schemas/workflow/identity.schemas";
import type { ProjectStore } from "@services/projects/ProjectStore";
import type { MediaVersionIndex } from "@services/media-history/MediaVersionIndex";
import { WorkflowError } from "@services/projects/WorkflowError";
import { requireWritableProject } from "@services/projects/projectAccess";
import type { ProjectMediaStorage } from "./ProjectMediaStorage";

const StoredImportSchema = ImportRecordSchema.extend({ sessionUrl: z.url().optional(), recoveryPending: z.boolean().optional() });
type StoredImport = z.infer<typeof StoredImportSchema>;
const CopyIntentSchema = z.strictObject({ ownerId: OwnerIdSchema, targetProjectId: ProjectIdSchema, id: VersionIdSchema, sourceProjectId: ProjectIdSchema, sourceVersionId: VersionIdSchema });
const SafeOwnerSchema = OwnerIdSchema.refine(value => value !== "." && value !== ".." && !value.includes("\\") && ![...value].some(character => character.charCodeAt(0) < 32), "A storage owner must be one safe path segment");
function importStoragePath(owner: string, project: string, versionId: string, contentType: string): string {
  const safeOwner = SafeOwnerSchema.parse(owner); const safeProject = ProjectIdSchema.parse(project); const safeVersion = VersionIdSchema.parse(versionId);
  const category = contentType.startsWith("image/") ? "images" : contentType.startsWith("audio/") ? "audio" : "videos";
  const extension = contentType === "audio/mpeg" ? "mp3" : contentType === "audio/mp4" ? "m4a" : contentType.split("/")[1];
  return `users/${safeOwner}/previews/${category}/${safeProject}-upload-${safeVersion}.${extension}`;
}

export class ProjectMediaService {
  constructor(private readonly database: Firestore, private readonly projects: ProjectStore, private readonly media: MediaVersionIndex, private readonly storage: ProjectMediaStorage) {}
  private ref(project: string, id: string): DocumentReference {
    return this.database.collection("creation_projects").doc(ProjectIdSchema.parse(project)).collection("imports").doc(ImportIdSchema.parse(id));
  }
  private async read(owner: string, project: string, id: string, transaction?: Transaction): Promise<StoredImport> {
    if (transaction) await this.projects.readOwned(transaction, owner, project); else await this.projects.get(owner, project);
    const row = transaction ? await transaction.get(this.ref(project, id)) : await this.ref(project, id).get();
    if (!row.exists) throw new WorkflowError("not_found", "This upload is unavailable.");
    const record = StoredImportSchema.parse(row.data());
    if (record.ownerId !== owner || record.projectId !== project || record.id !== id) throw new WorkflowError("access_denied", "This upload is unavailable.");
    return record;
  }
  async list(owner: string, project: string): Promise<ImportRecord[]> {
    await this.projects.get(owner, project);
    const rows = await this.database.collection("creation_projects").doc(ProjectIdSchema.parse(project)).collection("imports").where("recoveryPending", "==", true).limit(200).get();
    return rows.docs.map(row => { const record = ImportRecordSchema.parse(ImportRecordSchema.strip().parse(row.data())); if (record.ownerId !== owner || record.projectId !== project || record.id !== row.id) throw new WorkflowError("access_denied", "This upload is unavailable."); return record; });
  }
  async begin(owner: string, project: string, input: unknown, origin?: string): Promise<{ record: ImportRecord; uploadUrl?: string; offset: number }> {
    const command = ImportCommandSchema.parse(input);
    const browserOrigin = origin === undefined ? undefined : z.url().parse(origin);
    requireWritableProject(await this.projects.get(owner, project));
    const versionId = importedVersionId(command.id);
    const storagePath = importStoragePath(owner, project, versionId, command.contentType);
    await this.database.runTransaction(async transaction => {
      requireWritableProject(await this.projects.readOwned(transaction, owner, project));
      const row = await transaction.get(this.ref(project, command.id));
      if (row.exists) {
        const existing = StoredImportSchema.parse(row.data());
        if (existing.ownerId !== owner || existing.projectId !== project || existing.id !== command.id) throw new WorkflowError("access_denied", "This upload is unavailable.");
        if (existing.sha256 !== command.sha256 || existing.bytes !== command.bytes || existing.contentType !== command.contentType) throw new WorkflowError("submission_conflict", "Choose the original file again. Different bytes need a new import.");
        return;
      }
      transaction.create(this.ref(project, command.id), { ...ImportRecordSchema.parse({ ...command, ownerId: owner, projectId: project, versionId, storagePath, state: "uploading", createdAt: new Date().toISOString() }), recoveryPending: true });
    });
    let current = await this.read(owner, project, command.id);
    if (current.state !== "uploading") return { record: ImportRecordSchema.parse(ImportRecordSchema.strip().parse(current)), offset: current.state === "ready" ? current.bytes : 0 };
    let offset = await this.storage.exists(current.storagePath) ? current.bytes : current.sessionUrl ? await this.storage.offset(current.sessionUrl, current.bytes) : undefined;
    if (offset === undefined) {
      const sessionUrl = await this.storage.start(current.storagePath, current.contentType, current.bytes, browserOrigin);
      // Concurrent starts adopt one session. An orphan grant cannot create a second logical item.
      current = await this.database.runTransaction(async transaction => {
        const latest = await this.read(owner, project, command.id, transaction);
        if (latest.state !== "uploading" || (latest.sessionUrl && latest.sessionUrl !== current.sessionUrl)) return latest;
        const next = { ...latest, sessionUrl };
        transaction.set(this.ref(project, command.id), next);
        return next;
      });
      offset = current.sessionUrl === sessionUrl ? 0 : current.sessionUrl ? await this.storage.offset(current.sessionUrl, current.bytes) : 0;
    }
    const record = ImportRecordSchema.strip().parse(current);
    return { record, ...(current.sessionUrl && current.state === "uploading" ? { uploadUrl: current.sessionUrl } : {}), offset: offset ?? 0 };
  }
  async finish(owner: string, project: string, id: string): Promise<MediaVersion> {
    const current = await this.read(owner, project, id);
    const recover = (version: MediaVersion): MediaVersion => {
      if (version.ownerId !== owner || version.projectId !== project || version.id !== current.versionId || version.origin.kind !== "upload" || version.object.storagePath !== current.storagePath) throw new WorkflowError("submission_conflict", "This media identity belongs to another import or copy.");
      return version;
    };
    const existing = await this.media.get(owner, project, current.versionId);
    if (existing) return recover(existing);
    if (current.state === "rejected") throw new WorkflowError("invalid_settings", current.reason ?? "This file isn't supported.");
    let verified;
    try { verified = await this.storage.inspect(current.storagePath, ImportCommandSchema.strip().parse(current)); }
    catch (error) {
      if (error instanceof WorkflowError && error.code === "invalid_settings") await this.database.runTransaction(async transaction => {
        const latest = await this.read(owner, project, id, transaction);
        if (latest.state === "uploading") transaction.set(this.ref(project, id), { ...latest, state: "rejected", reason: error.message, recoveryPending: false });
      });
      throw error;
    }
    return this.database.runTransaction(async transaction => {
      const latest = await this.read(owner, project, id, transaction);
      const targetProject = await this.projects.readOwned(transaction, owner, project);
      return this.media.publishInTransaction(
        transaction,
        targetProject,
        {
          id: latest.versionId,
          ownerId: owner,
          projectId: project,
          kind: latest.contentType.startsWith("image/") ? "image" : latest.contentType.startsWith("audio/") ? "audio" : "video",
          label: latest.filename,
          origin: { kind: "upload" },
          sourceInputs: [],
          object: { identity: "verified", assetId: latest.versionId, storagePath: latest.storagePath, generation: verified.generation, sha256: verified.sha256, bytes: verified.bytes },
          metadata: verified.metadata,
          createdAt: latest.createdAt,
        },
        {
          conflictMessage: "This media identity belongs to another import or copy.",
          verifyExisting: existingVersion => { recover(existingVersion); },
          afterCreate: () => {
            transaction.set(this.ref(project, id), { ...latest, state: latest.state === "cancelled" ? "cancelled" : "ready", recoveryPending: false });
          },
        },
      );
    });
  }
  async cancel(owner: string, project: string, id: string, input?: unknown): Promise<ImportRecord> {
    const cancelled = await this.database.runTransaction(async transaction => {
      await this.projects.readOwned(transaction, owner, project);
      const ref = this.ref(project, id);
      const row = await transaction.get(ref);
      let latest: StoredImport;
      if (row.exists) {
        latest = StoredImportSchema.parse(row.data());
        if (latest.ownerId !== owner || latest.projectId !== project || latest.id !== id) throw new WorkflowError("access_denied", "This upload is unavailable.");
      } else {
        const command = ImportCommandSchema.safeParse(input);
        if (!command.success || command.data.id !== id) throw new WorkflowError("not_found", "This upload is unavailable.");
        const versionId = VersionIdSchema.parse(`version_${id.slice(7)}`);
        latest = ImportRecordSchema.parse({ ...command.data, ownerId: owner, projectId: project, versionId, state: "cancelled", storagePath: importStoragePath(owner, project, versionId, command.data.contentType), createdAt: new Date().toISOString() });
      }
      const next = { ...latest, state: "cancelled" as const, recoveryPending: true };
      transaction.set(ref, next);
      return next;
    });
    if (cancelled.sessionUrl) await this.storage.cancelSession(cancelled.sessionUrl);
    if (await this.storage.exists(cancelled.storagePath)) {
      try { await this.finish(owner, project, id); }
      catch (error) { if (!(error instanceof WorkflowError && error.code === "invalid_settings")) throw error; }
    }
    await this.ref(project, id).update({ recoveryPending: false });
    return ImportRecordSchema.strip().parse(cancelled);
  }
  async visibility(owner: string, project: string, versionId: string, hidden: boolean): Promise<MediaVersion> {
    return this.media.change(owner, project, versionId, { hidden });
  }
  async copy(owner: string, project: string, versionId: string, input: unknown): Promise<MediaVersion> {
    const command = CopyMediaCommandSchema.parse(input);
    if (command.targetProjectId === project) throw new WorkflowError("invalid_settings", "Choose another project.");
    const source = await this.media.get(owner, project, versionId);
    if (!source) throw new WorkflowError("not_found", "This media is unavailable.");
    requireWritableProject(await this.projects.get(owner, command.targetProjectId));
    const recover = (copy: MediaVersion): MediaVersion => {
      if (copy.ownerId !== owner || copy.projectId !== command.targetProjectId || copy.id !== command.id || copy.origin.kind !== "copy" || copy.origin.projectId !== project || copy.origin.versionId !== versionId) throw new WorkflowError("submission_conflict", "This copy identity is already used.");
      return copy;
    };
    const existing = await this.media.get(owner, command.targetProjectId, command.id);
    if (existing) return recover(existing);
    const intentRef = this.database.collection("creation_projects").doc(command.targetProjectId).collection("media_copy_intents").doc(command.id);
    const intent = CopyIntentSchema.parse({ ownerId: owner, targetProjectId: command.targetProjectId, id: command.id, sourceProjectId: project, sourceVersionId: versionId });
    await this.database.runTransaction(async transaction => {
      await this.projects.readOwned(transaction, owner, project);
      requireWritableProject(await this.projects.readOwned(transaction, owner, command.targetProjectId));
      const row = await transaction.get(intentRef);
      if (row.exists) {
        const prior = CopyIntentSchema.parse(row.data());
        if (prior.ownerId !== intent.ownerId || prior.targetProjectId !== intent.targetProjectId || prior.id !== intent.id || prior.sourceProjectId !== intent.sourceProjectId || prior.sourceVersionId !== intent.sourceVersionId) throw new WorkflowError("submission_conflict", "This copy identity is already used for another item.");
      } else transaction.create(intentRef, intent);
    });
    const extension = /\.([a-zA-Z0-9]{1,8})$/.exec(source.object.storagePath)?.[1] ?? "bin";
    const category = source.kind === "image" ? "images" : source.kind === "audio" ? "audio" : "videos";
    const storagePath = `users/${SafeOwnerSchema.parse(owner)}/previews/${category}/${command.targetProjectId}-copy-${command.id}.${extension}`;
    const generation = await this.storage.copy(source.object.storagePath, storagePath, source.object.identity === "verified" ? source.object.generation : undefined);
    return this.database.runTransaction(async transaction => {
      await this.projects.readOwned(transaction, owner, project);
      const targetProject = await this.projects.readOwned(transaction, owner, command.targetProjectId);
      requireWritableProject(targetProject);
      const object = source.object.identity === "verified" ? { ...source.object, assetId: command.id, storagePath, generation } : { identity: "unknown" as const, assetId: command.id, storagePath };
      return this.media.publishInTransaction(
        transaction,
        targetProject,
        { ...source, id: command.id, projectId: command.targetProjectId, origin: { kind: "copy", projectId: project, versionId }, sourceInputs: [], hidden: false, association: "linked", object, createdAt: new Date().toISOString() },
        { conflictMessage: "This copy identity is already used.", verifyExisting: existingCopy => { recover(existingCopy); } },
      );
    });
  }
}
