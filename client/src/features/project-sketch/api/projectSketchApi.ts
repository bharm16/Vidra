import { OwnedRequest, requireRequestOwner } from "@/services/http/OwnedRequest";
import { MediaVersionSchema, type MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { ProjectIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { ProjectAreaMaskSchema, ProjectSketchCaptureCommandSchema, type ProjectAreaMask, type ProjectSketchCaptureCommand } from "@shared/schemas/workflow/sketch.schemas";

export async function acceptProjectSketch(ownerId: string, projectId: string, command: ProjectSketchCaptureCommand): Promise<MediaVersion> {
  const project = ProjectIdSchema.parse(projectId);
  const body = ProjectSketchCaptureCommandSchema.parse(command);
  return new OwnedRequest(ownerId).request(`/projects/${encodeURIComponent(project)}/sketch/captures`, MediaVersionSchema.refine(version => version.ownerId === ownerId && version.projectId === project && version.origin.kind === "sketch-capture" && version.origin.captureId === body.captureId, "The saved picture does not belong to this captured output."), "POST", body);
}

/** The hidden mask stays bound to the exact picture the creator painted. */
export async function acceptAreaMask(ownerId: string, projectId: string, mask: ProjectAreaMask): Promise<MediaVersion> {
  const project = ProjectIdSchema.parse(projectId);
  const body = ProjectAreaMaskSchema.parse(mask);
  return new OwnedRequest(ownerId).request(`/projects/${encodeURIComponent(project)}/sketch/area-masks`, MediaVersionSchema.refine(version => version.ownerId === ownerId && version.projectId === project && version.origin.kind === "area-mask" && version.origin.versionId === body.versionId, "The saved area does not belong to this picture."), "POST", body);
}

/** Reads the saved pixels for the exact picture, without exposing transfer details to the workspace view. */
export async function readProjectAreaMask(source: MediaVersion, maskId: string, access: (versionId: string) => Promise<{ url: string }>): Promise<ProjectAreaMask> {
  requireRequestOwner(source.ownerId);
  const resource = await access(maskId);
  const response = await fetch(resource.url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error("The saved area could not be read.");
  const blob = await response.blob();
  const dataUri = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("The saved area could not be read."));
    reader.onerror = () => reject(new Error("The saved area could not be read.")); reader.readAsDataURL(blob);
  });
  requireRequestOwner(source.ownerId);
  const size = source.metadata.state === "verified" ? source.metadata : undefined;
  return ProjectAreaMaskSchema.parse({ versionId: source.id, width: size?.width, height: size?.height, transform: "identity", dataUri });
}
