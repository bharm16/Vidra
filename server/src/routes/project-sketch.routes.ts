import { Router } from "express";
import { handle } from "@middleware/intake";
import { ProjectIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { ProjectAreaMaskSchema, ProjectSketchCaptureCommandSchema } from "@shared/schemas/workflow/sketch.schemas";
import type { ProjectSketchService } from "@services/project-sketch/ProjectSketchService";
import { WorkflowError } from "@services/projects/WorkflowError";

export function createProjectSketchRoutes(service: Pick<ProjectSketchService, "accept" | "acceptAreaMask">): Router {
  const router = Router();
  router.post("/:projectId/sketch/captures", handle({ body: ProjectSketchCaptureCommandSchema }, ({ creatorId, body, req }) => {
    const project = ProjectIdSchema.safeParse(req.params.projectId);
    if (!project.success) throw new WorkflowError("invalid_settings", "This project identity is invalid.");
    return service.accept(creatorId, project.data, body);
  }));
  router.post("/:projectId/sketch/area-masks", handle({ body: ProjectAreaMaskSchema }, ({ creatorId, body, req }) => {
    const project = ProjectIdSchema.safeParse(req.params.projectId);
    if (!project.success) throw new WorkflowError("invalid_settings", "This project identity is invalid.");
    return service.acceptAreaMask(creatorId, project.data, body);
  }));
  return router;
}
