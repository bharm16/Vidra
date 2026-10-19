import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";
import type { z } from "zod";
import { canonicalJson } from "@shared/workflow/canonicalJson";
import { ChangeMediaSchema } from "@shared/schemas/workflow/management.schemas";
import { MediaVersionSchema, type MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { OwnerIdSchema, ProjectIdSchema, VersionIdSchema } from "@shared/schemas/workflow/identity.schemas";
import type { Project } from "@shared/schemas/workflow/project.schemas";
import type { ProjectStore } from "@services/projects/ProjectStore";
import { requireWritableProject } from "@services/projects/projectAccess";
import { WorkflowError } from "@services/projects/WorkflowError";

export type MediaVersionPublishCandidate = Omit<z.input<typeof MediaVersionSchema>, "schemaVersion" | "association"> & {
  schemaVersion?: "vidra-workflow/v2";
  association?: MediaVersion["association"];
};

export interface PublishMediaVersionOptions {
  conflictMessage?: string;
  verifyExisting?: (existing: MediaVersion, candidate: MediaVersion) => void;
  beforeCreate?: () => void;
  afterCreate?: (version: MediaVersion) => void;
}

/** Matches the version panel: references, animation inputs and copies never imply an edit parent. */
export function relatedMediaVersions(versions: MediaVersion[], selectedId: string): MediaVersion[] {
  const byId = new Map<string, MediaVersion>(versions.map(version => [version.id, version]));
  const root = (version: MediaVersion): string => {
    let current = version;
    const seen = new Set<string>([current.id]);
    for (;;) {
      const parent = current.sourceInputs.find(
        input => (input.role === "primary" || input.role === "clip") && input.versionId !== current.id && byId.get(input.versionId)?.kind === current.kind,
      );
      if (!parent) return current.id;
      if (seen.has(parent.versionId)) return [...seen].sort()[0] ?? current.id;
      const next = byId.get(parent.versionId);
      if (!next) return current.id;
      seen.add(next.id);
      current = next;
    }
  };
  const selected = byId.get(selectedId);
  if (!selected) return [];
  const selectedRoot = root(selected);
  return versions.filter(version => root(version) === selectedRoot);
}

/** Authoritative persistence and read model for immutable MediaVersion records; storage authorization remains in the media port. */
export class MediaVersionIndex {
  constructor(private readonly database: Firestore, private readonly projects: ProjectStore) {}

  private versionRef(projectId: string, versionId: string): DocumentReference {
    return this.database.collection("creation_projects").doc(ProjectIdSchema.parse(projectId)).collection("media_versions").doc(VersionIdSchema.parse(versionId));
  }

  private recoveryRef(ownerId: string, versionId: string): DocumentReference {
    return this.database.collection("creation_recovery").doc(OwnerIdSchema.parse(ownerId)).collection("media_versions").doc(VersionIdSchema.parse(versionId));
  }

  async get(ownerId: string, project: string, version: string, transaction?: Transaction): Promise<MediaVersion | undefined> {
    const projectId = ProjectIdSchema.parse(project);
    const versionId = VersionIdSchema.parse(version);
    if (transaction) await this.projects.readOwned(transaction, ownerId, projectId); else await this.projects.get(ownerId, projectId);
    const ref = this.versionRef(projectId, versionId);
    const row = transaction ? await transaction.get(ref) : await ref.get();
    return row.exists ? this.owned(ownerId, projectId, row.id, row.data()) : undefined;
  }

  async list(ownerId: string, project: string): Promise<MediaVersion[]> {
    const projectId = ProjectIdSchema.parse(project);
    await this.projects.get(ownerId, projectId);
    const rows = await this.database.collection("creation_projects").doc(projectId).collection("media_versions").limit(200).get();
    return rows.docs.map(row => this.owned(ownerId, projectId, row.id, row.data())).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  async listRecoveries(owner: string): Promise<MediaVersion[]> {
    const ownerId = OwnerIdSchema.parse(owner);
    const rows = await this.database.collection("creation_recovery").doc(ownerId).collection("media_versions").limit(200).get();
    return rows.docs.map(row => {
      const version = MediaVersionSchema.parse(row.data());
      if (version.ownerId !== ownerId || version.id !== row.id) throw new WorkflowError("access_denied", "This result is unavailable.");
      return version;
    });
  }

  async publishInTransaction(
    transaction: Transaction,
    project: Project | undefined,
    candidate: MediaVersionPublishCandidate,
    options: PublishMediaVersionOptions = {},
  ): Promise<MediaVersion> {
    const linked = project?.ownerId === candidate.ownerId && project.status === "active" && (project.origin.kind === "new" || project.origin.authority === "workflow");
    const association = candidate.association ?? (linked ? "linked" : "recovery");
    const version = MediaVersionSchema.parse({
      schemaVersion: "vidra-workflow/v2",
      ...candidate,
      association,
    });
    const ref = this.versionRef(version.projectId, version.id);
    const row = await transaction.get(ref);
    if (row.exists) {
      const existing = MediaVersionSchema.parse(row.data());
      if (existing.ownerId !== version.ownerId || existing.projectId !== version.projectId || existing.id !== version.id) {
        throw new WorkflowError("submission_conflict", options.conflictMessage ?? "This media identity belongs to another output.");
      }
      if (options.verifyExisting) {
        options.verifyExisting(existing, version);
      } else if (canonicalJson(existing.origin) !== canonicalJson(version.origin) || canonicalJson(existing.object) !== canonicalJson(version.object)) {
        throw new WorkflowError("submission_conflict", options.conflictMessage ?? "This result identity already belongs to different stored bytes.");
      }
      if (version.association === "recovery") {
        transaction.set(this.recoveryRef(version.ownerId, version.id), existing);
      }
      return existing;
    }
    options.beforeCreate?.();
    transaction.create(ref, version);
    if (version.association === "recovery") {
      transaction.set(this.recoveryRef(version.ownerId, version.id), version);
    }
    options.afterCreate?.(version);
    return version;
  }

  async change(owner: string, projectId: string, versionId: string, command: unknown): Promise<MediaVersion> {
    const patch = ChangeMediaSchema.parse(command);
    return this.database.runTransaction(async transaction => {
      requireWritableProject(await this.projects.readOwned(transaction, owner, projectId));
      const current = await this.get(owner, projectId, versionId, transaction);
      if (!current) throw new WorkflowError("not_found", "This media is unavailable.");
      const next = MediaVersionSchema.parse({ ...current, ...patch });
      transaction.set(this.versionRef(current.projectId, current.id), next);
      return next;
    });
  }

  async selectPreferred(owner: string, projectId: string, versionId: string): Promise<MediaVersion[]> {
    const selectedId = VersionIdSchema.parse(versionId);
    return this.database.runTransaction(async transaction => {
      const project = await this.projects.readOwned(transaction, owner, projectId);
      requireWritableProject(project);
      const rows = await transaction.get(this.database.collection("creation_projects").doc(project.id).collection("media_versions").limit(401));
      if (rows.size > 400) throw new WorkflowError("capability_unavailable", "This project's version history is too large to update safely.");
      const versions = rows.docs.map(row => {
        const version = MediaVersionSchema.parse(row.data());
        if (version.ownerId !== owner || version.projectId !== project.id || version.id !== row.id) {
          throw new WorkflowError("access_denied", "This version history is unavailable.");
        }
        return version;
      });
      const selected = versions.find(version => version.id === selectedId);
      if (!selected || selected.association !== "linked") throw new WorkflowError("not_found", "This version is unavailable in the project.");
      const family = relatedMediaVersions(versions, selectedId).map(version => MediaVersionSchema.parse({ ...version, preferred: version.id === selectedId }));
      for (const version of family) transaction.set(this.versionRef(project.id, version.id), version);
      return family;
    });
  }

  private owned(ownerId: string, projectId: string, id: string, value: unknown): MediaVersion {
    const version = MediaVersionSchema.parse(value);
    if (version.ownerId !== ownerId || version.projectId !== projectId || version.id !== id) throw new WorkflowError("access_denied", "This exact media version is unavailable in this project.");
    return version;
  }
}
