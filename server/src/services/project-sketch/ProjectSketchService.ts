import type { Firestore } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { OwnerIdSchema, ProjectIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { ProjectAreaMaskSchema, ProjectSketchCaptureCommandSchema, ProjectSketchCaptureRecordSchema, type ProjectSketchCaptureRecord } from "@shared/schemas/workflow/sketch.schemas";
import type { MediaVersionIndex } from "@services/media-history/MediaVersionIndex";
import type { ProjectStore } from "@services/projects/ProjectStore";
import { requireWritableProject } from "@services/projects/projectAccess";
import { WorkflowError } from "@services/projects/WorkflowError";
import { sketchPictureMetadata, verifySketchPicture, type ProjectSketchStorage } from "./ProjectSketchStorage";
import { verifyAreaMask } from "./areaMask";

/** Project-native acceptance: no session, request, input assignment or preview regeneration. */
export class ProjectSketchService {
  constructor(private readonly database: Pick<Firestore, "collection" | "runTransaction">, private readonly projects: Pick<ProjectStore, "get" | "readOwned">, private readonly storage: ProjectSketchStorage, private readonly media: Pick<MediaVersionIndex, "get" | "publishInTransaction">) {}

  /**
   * Stores a painted area as a hidden media version tied to its exact picture, so a request can take it as its `mask` input.
   * The same area on the same picture always resolves to the same version; it never lists as a picture of its own.
   */
  async acceptAreaMask(owner: string, project: string, input: unknown): Promise<MediaVersion> {
    const ownerId = OwnerIdSchema.parse(owner);
    const projectId = ProjectIdSchema.parse(project);
    const command = ProjectAreaMaskSchema.parse(input);
    // Authorization (inside media.get) precedes decoding any user-controlled picture bytes.
    const picture = await verifyAreaMask(command, await this.media.get(ownerId, projectId, command.versionId));
    const identity = createHash("sha256").update(JSON.stringify({ ownerId, projectId, source: command.versionId, mask: picture.sha256 })).digest("hex");
    const object = await this.storage.put(`users/${ownerId}/previews/images/${projectId}-mask-${identity}.png`, picture, identity);
    return this.database.runTransaction(async transaction => {
      const currentProject = await this.projects.readOwned(transaction, ownerId, projectId);
      requireWritableProject(currentProject);
      return this.media.publishInTransaction(transaction, currentProject, {
        id: `version_mask_${identity.slice(0, 40)}`,
        ownerId,
        projectId,
        kind: "image",
        label: "Selected area",
        origin: { kind: "area-mask", versionId: command.versionId },
        sourceInputs: [],
        object,
        metadata: sketchPictureMetadata(picture),
        hidden: true,
        createdAt: new Date().toISOString(),
      }, { conflictMessage: "This area identity belongs to different bytes." });
    });
  }

  async accept(owner: string, project: string, input: unknown): Promise<MediaVersion> {
    const ownerId = OwnerIdSchema.parse(owner);
    const projectId = ProjectIdSchema.parse(project);
    const command = ProjectSketchCaptureCommandSchema.parse(input);
    // Authorization precedes decoding any user-controlled picture bytes.
    await this.projects.get(ownerId, projectId);
    const [output, drawing] = await Promise.all([verifySketchPicture(command.outputDataUri), verifySketchPicture(command.drawingDataUri)]);
    const inputs = { prompt: command.inputs.prompt, strength: command.inputs.strength, steps: command.inputs.steps, seed: command.inputs.seed };
    const intentHash = createHash("sha256").update(JSON.stringify({ ownerId, projectId, captureId: command.captureId, displayedFrameId: command.displayedFrameId, displayedAt: command.displayedAt, inputs, output: output.sha256, drawing: drawing.sha256 })).digest("hex");
    const captureRef = this.database.collection("creation_projects").doc(projectId).collection("sketch_captures").doc(command.captureId);
    const versionId = `version_sketch_${command.captureId.slice(8)}`;
    const validateRecord = (raw: unknown): ProjectSketchCaptureRecord => {
      const record = ProjectSketchCaptureRecordSchema.parse(raw);
      if (record.ownerId !== ownerId || record.projectId !== projectId || record.captureId !== command.captureId || record.versionId !== versionId) throw new WorkflowError("access_denied", "This Sketch capture is unavailable.");
      if (record.intentHash !== intentHash || record.displayedFrameId !== command.displayedFrameId || record.displayedAt !== command.displayedAt || record.outputSha256 !== output.sha256 || record.drawingSha256 !== drawing.sha256 || JSON.stringify(record.inputs) !== JSON.stringify(inputs)) throw new WorkflowError("submission_conflict", "This save belongs to a different displayed picture. Retry the original save.");
      return record;
    };
    const intent = await this.database.runTransaction(async transaction => {
      const currentProject = await this.projects.readOwned(transaction, ownerId, projectId);
      const existing = await transaction.get(captureRef);
      if (existing.exists) return validateRecord(existing.data());
      requireWritableProject(currentProject);
      const record = ProjectSketchCaptureRecordSchema.parse({ captureId: command.captureId, ownerId, projectId, versionId, displayedFrameId: command.displayedFrameId, displayedAt: command.displayedAt, inputs, intentHash, outputSha256: output.sha256, drawingSha256: drawing.sha256, state: "saving", createdAt: new Date().toISOString() });
      transaction.create(captureRef, record);
      return record;
    });
    const path = `users/${ownerId}/previews/images/${projectId}-sketch-${command.captureId}`;
    const [object, drawingObject] = await Promise.all([this.storage.put(`${path}-output.${output.mime.split("/")[1]}`, output, intentHash), this.storage.put(`${path}-drawing.${drawing.mime.split("/")[1]}`, drawing, intentHash)]);
    return this.database.runTransaction(async transaction => {
      const currentProject = await this.projects.readOwned(transaction, ownerId, projectId);
      const capture = await transaction.get(captureRef);
      validateRecord(capture.data());
      // A project trashed during storage retains its accepted bytes for recovery.
      return this.media.publishInTransaction(
        transaction,
        currentProject,
        {
          id: versionId,
          ownerId,
          projectId,
          kind: "image",
          label: "Sketch picture",
          origin: { kind: "sketch-capture", captureId: command.captureId },
          sourceInputs: [],
          object,
          metadata: sketchPictureMetadata(output),
          createdAt: intent.createdAt,
        },
        {
          conflictMessage: "This media identity belongs to another output.",
          verifyExisting: existing => {
            if (
              existing.origin.kind !== "sketch-capture" ||
              existing.origin.captureId !== command.captureId ||
              existing.object.identity !== "verified" ||
              existing.object.sha256 !== output.sha256 ||
              existing.object.storagePath !== object.storagePath ||
              (object.identity === "verified" && existing.object.generation !== object.generation)
            ) {
              throw new WorkflowError("submission_conflict", "This media identity belongs to another output.");
            }
          },
          afterCreate: () => {
            transaction.set(captureRef, ProjectSketchCaptureRecordSchema.parse({ ...intent, state: "saved", drawingObject }));
          },
        },
      );
    });
  }
}
