import { Router, type Request } from "express";
import { z } from "zod";
import { handle } from "@middleware/intake";
import { ProjectIdSchema, ConversationIdSchema, VersionIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { ChangeConversationSchema, DeriveFrameSchema } from "@shared/schemas/workflow/management.schemas";
import { PublishVersionSchema, WorkflowShareIdSchema } from "@shared/schemas/workflow/sharing.schemas";
import type { WorkflowManagementService } from "@services/workflow-sharing/WorkflowManagementService";
import { WorkflowError } from "@services/projects/WorkflowError";

/** Mount before projects.routes so organizational mutations retain their one owner. */
export function createWorkflowManagementRoutes(service: WorkflowManagementService): Router {
  const router = Router();
  const param = (req: Request, name: string, schema: z.ZodType<string>): string => { const parsed = schema.safeParse(req.params[name]); if (!parsed.success) throw new WorkflowError("invalid_settings", "The requested identity is invalid."); return parsed.data; };
  const project = (req: Request): string => param(req, "projectId", ProjectIdSchema);
  const version = (req: Request): string => param(req, "versionId", VersionIdSchema);
  router.patch("/:projectId/conversations/:conversationId", handle({ body: ChangeConversationSchema }, ({ creatorId, req, body }) => service.conversation(creatorId, project(req), param(req, "conversationId", ConversationIdSchema), body)));
  router.post("/:projectId/media/:versionId/preferred", handle({ body: z.strictObject({}) }, ({ creatorId, req }) => service.preferred(creatorId, project(req), version(req))));
  router.get("/:projectId/media/:versionId/download", handle({}, ({ creatorId, req }) => service.download(creatorId, project(req), version(req))));
  router.post("/:projectId/media/:versionId/frame", handle({ body: DeriveFrameSchema }, ({ creatorId, req, body }) => service.frame(creatorId, project(req), version(req), body)));
  router.get("/:projectId/shares", handle({}, ({ creatorId, req }) => service.shares(creatorId, project(req))));
  router.post("/:projectId/shares", handle({ body: PublishVersionSchema }, ({ creatorId, req, body }) => service.publish(creatorId, project(req), body)));
  router.post("/:projectId/shares/:shareId/revoke", handle({ body: z.strictObject({}) }, ({ creatorId, req }) => service.revoke(creatorId, project(req), param(req, "shareId", WorkflowShareIdSchema))));
  return router;
}
