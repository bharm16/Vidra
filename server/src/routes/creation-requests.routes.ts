import { Router } from "express";
import { z } from "zod";
import { handle } from "@middleware/intake";
import { SubmissionCommandSchema } from "@shared/schemas/workflow/request.schemas";
import { DraftIdSchema, ProjectIdSchema, RequestIdSchema, SubmissionIdSchema } from "@shared/schemas/workflow/identity.schemas";
import type { ActionPreparationService } from "@services/creation-requests/preparation/ActionPreparationService";
import type { RequestIdempotencyService } from "@services/admission/idempotency/RequestIdempotencyService";
import type { WorkflowCapabilityCatalog } from "@services/creation-requests/preparation/WorkflowCapabilityCatalog";
import { WorkflowError } from "@services/projects/WorkflowError";
import type { WorkflowExecutionService } from "@services/creation-requests/execution/WorkflowExecutionService";

export function createCreationRequestRoutes({ preparation, receipts, execution }: { preparation: ActionPreparationService; receipts: Pick<RequestIdempotencyService, "acceptWorkflow" | "getWorkflowRequest">; execution?: WorkflowExecutionService }): Router {
  const router = Router();
  router.post("/prepare", handle({ body: z.strictObject({ projectId: ProjectIdSchema, draftId: DraftIdSchema }) }, ({ creatorId, body }) => preparation.prepare(creatorId, body.projectId, body.draftId)));
  router.post("/", handle({ body: SubmissionCommandSchema.extend({ projectId: ProjectIdSchema }) }, async ({ creatorId, body }) => {
    const { projectId, ...command } = body;
    const request = await receipts.acceptWorkflow({ ownerId: creatorId, projectId, command, prepare: transaction => preparation.prepareInTransaction(transaction, creatorId, projectId, command.draftId) });
    if (execution) await execution.start(creatorId, request.id);
    return request;
  }));
  if (execution) {
    router.get("/recovery", handle({}, ({ creatorId }) => execution.recovery(creatorId)));
    const requestId = (value: unknown): string => { const parsed = RequestIdSchema.safeParse(value); if (!parsed.success) throw new WorkflowError("invalid_settings", "This request identity is invalid."); return parsed.data; };
    router.get("/:requestId", handle({}, ({ creatorId, req }) => execution.get(creatorId, requestId(req.params.requestId))));
    router.post("/:requestId/cancel", handle({ body: z.strictObject({}) }, ({ creatorId, req }) => execution.cancel(creatorId, requestId(req.params.requestId))));
    router.post("/:requestId/reconcile", handle({ body: z.strictObject({}) }, ({ creatorId, req }) => execution.reconcile(creatorId, requestId(req.params.requestId))));
    router.post("/:requestId/retry", handle({ body: z.strictObject({}) }, ({ creatorId, req }) => execution.reconcile(creatorId, requestId(req.params.requestId))));
  }
  router.get("/submissions/:submissionId", handle({}, async ({ creatorId, req }) => {
    const submission = SubmissionIdSchema.safeParse(req.params.submissionId);
    if (!submission.success) throw new WorkflowError("invalid_settings", "This submission identity is invalid.");
    return (await receipts.getWorkflowRequest(creatorId, submission.data)) ?? null;
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
