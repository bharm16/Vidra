import { Router } from "express";
import { z } from "zod";
import { handle } from "@middleware/intake";
import { SubmissionCommandSchema } from "@shared/schemas/workflow/request.schemas";
import { DraftIdSchema, ProjectIdSchema, RequestIdSchema, SubmissionIdSchema } from "@shared/schemas/workflow/identity.schemas";
import type { CreationRequestLifecycle } from "@services/creation-requests/lifecycle";
import type { WorkflowCapabilityCatalog } from "@services/creation-requests/catalog";
import { WorkflowError } from "@services/projects/WorkflowError";

export function createCreationRequestRoutes(lifecycle: CreationRequestLifecycle): Router {
  const router = Router();
  router.post("/prepare", handle({ body: z.strictObject({ projectId: ProjectIdSchema, draftId: DraftIdSchema }) }, ({ creatorId, body }) => lifecycle.prepare(creatorId, body.projectId, body.draftId)));
  router.post("/", handle({ body: SubmissionCommandSchema.extend({ projectId: ProjectIdSchema }) }, async ({ creatorId, body }) => {
    const { projectId, ...command } = body;
    return lifecycle.accept(creatorId, projectId, command);
  }));
  {
    router.get("/recovery", handle({}, ({ creatorId }) => lifecycle.recovery(creatorId)));
    const requestId = (value: unknown): string => { const parsed = RequestIdSchema.safeParse(value); if (!parsed.success) throw new WorkflowError("invalid_settings", "This request identity is invalid."); return parsed.data; };
    router.get("/:requestId", handle({}, ({ creatorId, req }) => lifecycle.status(creatorId, requestId(req.params.requestId))));
    router.post("/:requestId/cancel", handle({ body: z.strictObject({}) }, ({ creatorId, req }) => lifecycle.cancel(creatorId, requestId(req.params.requestId))));
    router.post("/:requestId/reconcile", handle({ body: z.strictObject({}) }, ({ creatorId, req }) => lifecycle.reconcile(creatorId, requestId(req.params.requestId))));
    router.post("/:requestId/retry", handle({ body: z.strictObject({}) }, ({ creatorId, req }) => lifecycle.reconcile(creatorId, requestId(req.params.requestId))));
  }
  router.get("/submissions/:submissionId", handle({}, async ({ creatorId, req }) => {
    const submission = SubmissionIdSchema.safeParse(req.params.submissionId);
    if (!submission.success) throw new WorkflowError("invalid_settings", "This submission identity is invalid.");
    return (await lifecycle.recover(creatorId, submission.data)) ?? null;
  }));
  return router;
}

export function createWorkflowCatalogRoutes(catalog: WorkflowCapabilityCatalog): Router {
  const router = Router();
  router.get("/profiles", handle({}, () => catalog.list()));
  return router;
}

/** The model list is static configuration, so signed-out visitors can set up a request before signing in. */
export function createPublicWorkflowCatalogRoutes(catalog: WorkflowCapabilityCatalog): Router {
  const router = Router();
  router.get("/profiles", handle({ auth: "anonymous" }, () => catalog.list()));
  return router;
}
