import { Router, type Request } from "express";
import { z } from "zod";
import { handle } from "@middleware/intake";
import { respond } from "@middleware/respond";
import { ChangeProjectCommandSchema, CreateConversationCommandSchema, CreateProjectCommandSchema } from "@shared/schemas/workflow/project.schemas";
import { CreateDraftCommandSchema, RestoreDraftCommandSchema, SaveDraftCommandSchema } from "@shared/schemas/workflow/draft.schemas";
import { ConversationIdSchema, DraftIdSchema, ProjectIdSchema, RevisionSchema } from "@shared/schemas/workflow/identity.schemas";
import type { ProjectStore } from "@services/projects/ProjectStore";
import type { ConversationStore } from "@services/projects/ConversationStore";
import type { CreationDraftStore } from "@services/creation-drafts/CreationDraftStore";

export interface ProjectRouteServices {
  projects: ProjectStore;
  conversations: ConversationStore;
  drafts: CreationDraftStore;
}

function param(req: Request, key: string): string {
  return z.string().parse(req.params[key]);
}

/** New workflow records are additive; legacy sessions keep their own routes. */
export function createProjectRoutes({ projects, conversations, drafts }: ProjectRouteServices): Router {
  const router = Router();
  for (const [name, schema] of [["projectId", ProjectIdSchema], ["conversationId", ConversationIdSchema], ["draftId", DraftIdSchema]] as const) {
    router.param(name, (req, res, next, value: string): void => {
      if (!schema.safeParse(value).success) { respond.fail(res, req, 400, { error: "The requested identity is invalid.", code: "INVALID_REQUEST" }); return; }
      next();
    });
  }
  router.get("/", handle({}, ({ creatorId }) => projects.list(creatorId)));
  router.post("/", handle({ body: CreateProjectCommandSchema }, async ({ creatorId, body, req, res }) => {
    respond.ok(res, req, await projects.create(creatorId, body), 201);
  }));
  router.get("/:projectId", handle({}, ({ creatorId, req }) => projects.get(creatorId, param(req, "projectId"))));
  router.patch("/:projectId", handle({ body: ChangeProjectCommandSchema }, ({ creatorId, req, body }) => projects.change(creatorId, param(req, "projectId"), body)));
  router.get("/:projectId/conversations", handle({}, ({ creatorId, req }) => conversations.list(creatorId, param(req, "projectId"))));
  router.post("/:projectId/conversations", handle({ body: CreateConversationCommandSchema }, async ({ creatorId, req, res, body }) => {
    respond.ok(res, req, await conversations.create(creatorId, param(req, "projectId"), body), 201);
  }));
  router.get("/:projectId/conversations/:conversationId", handle({}, ({ creatorId, req }) => conversations.get(creatorId, param(req, "projectId"), param(req, "conversationId"))));
  router.get("/:projectId/conversations/:conversationId/drafts", handle({}, ({ creatorId, req }) => drafts.list(creatorId, param(req, "projectId"), param(req, "conversationId"))));
  router.post("/:projectId/conversations/:conversationId/drafts", handle({ body: CreateDraftCommandSchema }, async ({ creatorId, req, res, body }) => {
    respond.ok(res, req, await drafts.create(creatorId, param(req, "projectId"), param(req, "conversationId"), body), 201);
  }));
  router.get("/:projectId/drafts/:draftId", handle({}, ({ creatorId, req }) => drafts.get(creatorId, param(req, "projectId"), param(req, "draftId"))));
  router.patch("/:projectId/drafts/:draftId", handle({ body: SaveDraftCommandSchema }, ({ creatorId, req, body }) => drafts.save(creatorId, param(req, "projectId"), param(req, "draftId"), body)));
  router.post("/:projectId/drafts/:draftId/restore", handle({ body: RestoreDraftCommandSchema }, ({ creatorId, req, body }) => drafts.restore(creatorId, param(req, "projectId"), param(req, "draftId"), body)));
  router.get("/:projectId/drafts/:draftId/revisions", handle({}, ({ creatorId, req }) => drafts.revisions(creatorId, param(req, "projectId"), param(req, "draftId"))));
  router.get("/:projectId/drafts/:draftId/conflicts", handle({}, ({ creatorId, req }) => drafts.conflicts(creatorId, param(req, "projectId"), param(req, "draftId"))));
  router.post("/:projectId/drafts/:draftId/status", handle({ body: z.strictObject({ expectedRevision: RevisionSchema, status: z.enum(["open", "parked", "discarded"]) }) }, ({ creatorId, req, body }) => drafts.setStatus(creatorId, param(req, "projectId"), param(req, "draftId"), body.expectedRevision, body.status)));
  return router;
}
