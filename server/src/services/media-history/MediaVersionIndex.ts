import type { Firestore, Transaction } from "firebase-admin/firestore";
import { MediaVersionSchema, type MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { ProjectIdSchema, VersionIdSchema } from "@shared/schemas/workflow/identity.schemas";
import type { ProjectStore } from "@services/projects/ProjectStore";
import { WorkflowError } from "@services/projects/WorkflowError";

/** Reads the immutable media index; storage authorization remains in the media port. */
export class MediaVersionIndex {
  constructor(private readonly database: Firestore, private readonly projects: ProjectStore) {}

  async get(ownerId: string, project: string, version: string, transaction?: Transaction): Promise<MediaVersion | undefined> {
    const projectId = ProjectIdSchema.parse(project);
    const versionId = VersionIdSchema.parse(version);
    if (transaction) await this.projects.readOwned(transaction, ownerId, projectId); else await this.projects.get(ownerId, projectId);
    const ref = this.database.collection("creation_projects").doc(projectId).collection("media_versions").doc(versionId);
    const row = transaction ? await transaction.get(ref) : await ref.get();
    return row.exists ? this.owned(ownerId, projectId, row.id, row.data()) : undefined;
  }

  async list(ownerId: string, project: string): Promise<MediaVersion[]> {
    const projectId = ProjectIdSchema.parse(project);
    await this.projects.get(ownerId, projectId);
    const rows = await this.database.collection("creation_projects").doc(projectId).collection("media_versions").limit(200).get();
    return rows.docs.map(row => this.owned(ownerId, projectId, row.id, row.data())).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  private owned(ownerId: string, projectId: string, id: string, value: unknown): MediaVersion {
    const version = MediaVersionSchema.parse(value);
    if (version.ownerId !== ownerId || version.projectId !== projectId || version.id !== id) throw new WorkflowError("access_denied", "This exact media version is unavailable in this project.");
    return version;
  }
}
