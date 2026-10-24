import { allDocuments } from "@services/firestore/WorkflowLists";
import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { DeriveFrameSchema } from "@shared/schemas/workflow/management.schemas";
import { OwnerIdSchema, ProjectIdSchema, VersionIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { PublishVersionSchema, PublicVersionSchema, VersionShareSchema, WorkflowShareIdSchema, type PublicVersion, type VersionShare } from "@shared/schemas/workflow/sharing.schemas";
import type { Conversation } from "@shared/schemas/workflow/project.schemas";
import { ProjectSchema } from "@shared/schemas/workflow/project.schemas";
import type { ProjectStore } from "@services/projects/ProjectStore";
import type { ConversationStore } from "@services/projects/ConversationStore";
import type { MediaVersionIndex } from "@services/media-history/MediaVersionIndex";
import { requireWritableProject } from "@services/projects/projectAccess";
import { WorkflowError } from "@services/projects/WorkflowError";
import { sha256Hex } from "@utils/hash";
import { canonicalJson } from "@shared/workflow/canonicalJson";
import { StoredShareSchema, FrameOperationSchema, type StoredShare, type WorkflowContent, type WorkflowManagementStorage } from "./types";
import { deriveNativeFrame } from "./NativeFrameDeriver";

export class WorkflowManagementService {
  private activeFrames = 0;
  constructor(private readonly database: Firestore, private readonly projects: ProjectStore, private readonly conversations: ConversationStore, private readonly media: MediaVersionIndex, private readonly objects: WorkflowManagementStorage, private readonly now: () => string = () => new Date().toISOString()) {}

  async conversation(owner: string, project: string, conversation: string, command: unknown): Promise<Conversation> { return this.conversations.change(owner, project, conversation, command); }

  async changeMedia(owner: string, projectId: string, versionId: string, command: unknown): Promise<MediaVersion> {
    return this.media.change(owner, projectId, versionId, command);
  }

  async preferred(owner: string, projectId: string, versionId: string): Promise<MediaVersion[]> {
    return this.media.selectPreferred(owner, projectId, versionId);
  }

  async shares(owner: string, projectId: string): Promise<VersionShare[]> {
    const project = await this.projects.get(owner, projectId);
    const rows = { docs: await allDocuments(this.database.collection("creation_projects").doc(project.id).collection("shares")) };
    return rows.docs.map(row => { const share = StoredShareSchema.parse(row.data()); if (share.ownerId !== owner || share.projectId !== project.id || share.id !== row.id) throw new WorkflowError("access_denied", "This publication is unavailable."); return VersionShareSchema.strip().parse({ ...share, revoked: share.revoked || share.sharingEpoch !== project.sharingEpoch || project.status !== "active" }); });
  }

  async publish(owner: string, projectId: string, input: unknown): Promise<VersionShare> {
    const command = PublishVersionSchema.parse(input);
    return this.database.runTransaction(async transaction => {
      const project = await this.projects.readOwned(transaction, owner, projectId); requireWritableProject(project);
      const ref = this.database.collection("workflow_publications").doc(command.id);
      const prior = await transaction.get(ref);
      const legacy = await transaction.get(this.database.collection("shares").doc(command.id));
      if (legacy.exists) throw new WorkflowError("submission_conflict", "This publication identity already belongs to another public link.");
      const version = await this.media.get(owner, project.id, command.versionId, transaction);
      if (prior.exists) {
        const existing = StoredShareSchema.parse(prior.data());
        if (existing.ownerId !== owner || existing.projectId !== project.id || existing.versionId !== command.versionId) throw new WorkflowError("submission_conflict", "This publication identity already names another stored version.");
        return VersionShareSchema.strip().parse({ ...existing, revoked: existing.revoked || existing.sharingEpoch !== project.sharingEpoch });
      }
      if (!version || version.association !== "linked" || version.kind === "audio" || version.object.identity !== "verified" || version.metadata.state !== "verified") throw new WorkflowError("input_unavailable", "Choose a stored picture, clip or exported video before publishing.");
      const share = StoredShareSchema.parse({ id: command.id, ownerId: owner, projectId: project.id, versionId: version.id, sharingEpoch: project.sharingEpoch, revoked: false, createdAt: this.now(), kind: version.kind, label: version.label, object: version.object });
      transaction.create(ref, share);
      transaction.create(this.database.collection("creation_projects").doc(project.id).collection("shares").doc(share.id), share);
      return VersionShareSchema.strip().parse(share);
    });
  }

  async revoke(owner: string, projectId: string, id: string): Promise<VersionShare> {
    const shareId = WorkflowShareIdSchema.parse(id);
    return this.database.runTransaction(async transaction => {
      const project = await this.projects.readOwned(transaction, owner, projectId);
      const ref = this.database.collection("workflow_publications").doc(shareId);
      const row = await transaction.get(ref);
      if (!row.exists) throw new WorkflowError("not_found", "This publication is unavailable.");
      const share = StoredShareSchema.parse(row.data());
      if (share.ownerId !== owner || share.projectId !== project.id) throw new WorkflowError("access_denied", "This publication is unavailable.");
      const next = StoredShareSchema.parse({ ...share, revoked: true });
      transaction.set(ref, next); transaction.set(this.database.collection("creation_projects").doc(project.id).collection("shares").doc(shareId), next);
      return VersionShareSchema.strip().parse(next);
    });
  }

  private async publicAuthority(id: string): Promise<StoredShare> {
    const parsed = WorkflowShareIdSchema.safeParse(id);
    if (!parsed.success) throw new WorkflowError("not_found", "This shared media is unavailable.");
    return this.database.runTransaction(async transaction => {
      const row = await transaction.get(this.database.collection("workflow_publications").doc(parsed.data));
      if (!row.exists) throw new WorkflowError("not_found", "This shared media is unavailable.");
      const share = StoredShareSchema.parse(row.data());
      const projectRow = await transaction.get(this.database.collection("creation_projects").doc(share.projectId));
      const project = projectRow.exists ? ProjectSchema.parse(projectRow.data()) : undefined;
      if (share.revoked || !project || project.ownerId !== share.ownerId || project.status !== "active" || project.sharingEpoch !== share.sharingEpoch || (project.origin.kind !== "new" && project.origin.authority !== "workflow")) throw new WorkflowError("not_found", "This shared media is unavailable.");
      return share;
    });
  }

  async publicVersion(id: string, publicBaseUrl: string): Promise<PublicVersion> {
    const share = await this.publicAuthority(id);
    return PublicVersionSchema.parse({ id: share.id, kind: share.kind, label: share.label, url: new URL(`/api/public/workflow-shares/${share.id}/content`, publicBaseUrl).href, expiresAt: new Date(Date.parse(this.now()) + 60_000).toISOString(), createdAt: share.createdAt });
  }
  async publicContent(id: string, range?: string): Promise<WorkflowContent> { return this.objects.content(await this.publicAuthority(id), range); }

  async download(owner: string, projectId: string, versionId: string): Promise<{ url: string; expiresAt: string }> {
    const version = await this.media.get(owner, projectId, versionId);
    if (!version) throw new WorkflowError("not_found", "This media is unavailable.");
    return this.objects.downloadAccess(owner, version);
  }

  async frame(owner: string, projectId: string, versionId: string, input: unknown): Promise<MediaVersion> {
    const command = DeriveFrameSchema.parse(input); const ownerId = OwnerIdSchema.parse(owner); const project = ProjectIdSchema.parse(projectId); const sourceId = VersionIdSchema.parse(versionId);
    const acquired = await this.database.runTransaction(async transaction => {
      requireWritableProject(await this.projects.readOwned(transaction, ownerId, project));
      const source = await this.media.get(ownerId, project, sourceId, transaction);
      const existing = await this.media.get(ownerId, project, command.id, transaction);
      const ref = this.database.collection("creation_projects").doc(project).collection("frame_derivations").doc(command.id);
      const row = await transaction.get(ref);
      if (!source || (source.kind !== "video" && source.kind !== "export") || source.object.identity !== "verified" || source.metadata.state !== "verified" || source.association !== "linked" || source.object.bytes > 512 * 1024 * 1024 || command.timestampSeconds >= source.metadata.durationSeconds) throw new WorkflowError("input_unavailable", "Choose a playable frame before the end of this stored clip.");
      const payloadHash = sha256Hex(canonicalJson({ ownerId, projectId: project, sourceId, source: source.object, command }));
      if (existing) {
        if (existing.origin.kind !== "frame" || existing.origin.versionId !== source.id || existing.origin.timestampSeconds !== command.timestampSeconds) throw new WorkflowError("submission_conflict", "This frame identity already names different media.");
        return { existing };
      }
      if (row.exists) {
        const prior = FrameOperationSchema.parse(row.data());
        if (prior.ownerId !== ownerId || prior.projectId !== project || prior.payloadHash !== payloadHash) throw new WorkflowError("submission_conflict", "This frame identity already names a different source or time.");
        if (Date.parse(prior.leaseUntil) > Date.parse(this.now())) return { source, operation: prior, claimed: false };
      }
      const operation = FrameOperationSchema.parse({ ownerId, projectId: project, sourceVersionId: sourceId, id: command.id, timestampSeconds: command.timestampSeconds, payloadHash, token: randomUUID(), leaseUntil: new Date(Date.parse(this.now()) + 180_000).toISOString(), createdAt: this.now() });
      transaction.set(ref, operation);
      return { source, operation, claimed: true };
    });
    if (acquired.existing) return acquired.existing;
    const { source, operation } = acquired;
    if (!source || !operation) throw new WorkflowError("input_unavailable", "This clip is unavailable.");
    let stored = await this.objects.existingFrame(operation);
    if (!stored) {
      if (!acquired.claimed) throw new WorkflowError("read_only", "This frame is already being made. Retry to recover the same picture.");
      try {
        if (this.activeFrames >= 2) throw new WorkflowError("capability_unavailable", "Frame capture is busy. Try again shortly.");
        this.activeFrames += 1;
        try { stored = await deriveNativeFrame(this.objects, operation, source); }
        finally { this.activeFrames -= 1; }
      } catch (error) {
        await this.database.runTransaction(async transaction => {
          const ref = this.database.collection("creation_projects").doc(project).collection("frame_derivations").doc(command.id);
          const current = FrameOperationSchema.parse((await transaction.get(ref)).data());
          if (current.token === operation.token) transaction.set(ref, { ...current, leaseUntil: this.now() });
        });
        throw error;
      }
    }
    return this.database.runTransaction(async transaction => {
      const parent = await this.projects.readOwned(transaction, ownerId, project);
      const ref = this.database.collection("creation_projects").doc(project).collection("frame_derivations").doc(command.id);
      const current = FrameOperationSchema.parse((await transaction.get(ref)).data());
      return this.media.publishInTransaction(
        transaction,
        parent,
        {
          id: command.id,
          ownerId,
          projectId: project,
          kind: "image",
          label: "Frame",
          origin: { kind: "frame", versionId: source.id, timestampSeconds: command.timestampSeconds },
          sourceInputs: [{ role: "clip", state: "resolved", versionId: source.id }],
          ...stored,
          createdAt: operation.createdAt,
        },
        {
          conflictMessage: "This frame identity already belongs to different media.",
          verifyExisting: prior => {
            if (prior.origin.kind !== "frame" || prior.origin.versionId !== source.id || prior.origin.timestampSeconds !== command.timestampSeconds) {
              throw new WorkflowError("submission_conflict", "This frame identity already belongs to different media.");
            }
          },
          beforeCreate: () => {
            if (current.token !== operation.token) throw new WorkflowError("revision_conflict", "This frame attempt was replaced. Retry to recover the stored picture.");
          },
        },
      );
    });
  }
}
