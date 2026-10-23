import { z } from "zod";
import { createWorkflowClient } from "@/features/project-workspace/api/workflowApi";
import { MediaVersionSchema, type MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { ProjectIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { ProjectAreaMaskSchema, ProjectSketchCaptureCommandSchema, type ProjectAreaMask, type ProjectSketchCaptureCommand } from "@shared/schemas/workflow/sketch.schemas";

export async function acceptProjectSketch(ownerId: string, projectId: string, command: ProjectSketchCaptureCommand): Promise<MediaVersion> {
  const project = ProjectIdSchema.parse(projectId);
  const body = ProjectSketchCaptureCommandSchema.parse(command);
  const response = await createWorkflowClient(ownerId).rawRequest(`/projects/${encodeURIComponent(project)}/sketch/captures`, { method: "POST", body });
  const wire: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const failure = z.object({ error: z.string().optional(), message: z.string().optional() }).safeParse(wire);
    throw new Error(failure.success ? failure.data.message ?? failure.data.error ?? "The picture could not be saved. Retry the same save." : "The picture could not be saved. Retry the same save.");
  }
  const version = z.strictObject({ success: z.literal(true), data: MediaVersionSchema, requestId: z.string().optional() }).parse(wire).data;
  if (version.ownerId !== ownerId || version.projectId !== projectId || version.origin.kind !== "sketch-capture" || version.origin.captureId !== command.captureId) throw new Error("The saved picture does not belong to this captured output.");
  return version;
}

/** Saves a painted area as the hidden mask version for its exact picture; the server rejects an area drawn at another size. */
export async function acceptAreaMask(ownerId: string, projectId: string, mask: ProjectAreaMask): Promise<MediaVersion> {
  const project = ProjectIdSchema.parse(projectId);
  const body = ProjectAreaMaskSchema.parse(mask);
  const response = await createWorkflowClient(ownerId).rawRequest(`/projects/${encodeURIComponent(project)}/sketch/area-masks`, { method: "POST", body });
  const wire: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const failure = z.object({ error: z.string().optional(), message: z.string().optional() }).safeParse(wire);
    throw new Error(failure.success ? failure.data.message ?? failure.data.error ?? "The area could not be saved. Try Done again." : "The area could not be saved. Try Done again.");
  }
  const version = z.strictObject({ success: z.literal(true), data: MediaVersionSchema, requestId: z.string().optional() }).parse(wire).data;
  if (version.ownerId !== ownerId || version.projectId !== projectId || version.origin.kind !== "area-mask" || version.origin.versionId !== body.versionId) throw new Error("The saved area does not belong to this picture.");
  return version;
}
