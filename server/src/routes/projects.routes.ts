import { Router, type Request } from "express";
import { z } from "zod";
import { handle } from "@middleware/intake";
import { respond } from "@middleware/respond";
import { ChangeProjectCommandSchema, ConversationListingSchema, CreateConversationCommandSchema, CreateProjectCommandSchema } from "@shared/schemas/workflow/project.schemas";
import { CreateDraftCommandSchema, RestoreDraftCommandSchema, SaveDraftCommandSchema } from "@shared/schemas/workflow/draft.schemas";
import { ConversationIdSchema, DraftIdSchema, ProjectIdSchema, RevisionSchema } from "@shared/schemas/workflow/identity.schemas";
import type { ProjectStore } from "@services/projects/ProjectStore";
import type { ConversationStore } from "@services/projects/ConversationStore";
import type { CreationDraftStore } from "@services/creation-drafts/CreationDraftStore";
import type { RequestHistoryStore } from "@services/media-history/RequestHistoryStore";
import type { MediaVersionIndex } from "@services/media-history/MediaVersionIndex";
import { VersionIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { WorkflowError } from "@services/projects/WorkflowError";
import type { ProjectMediaService } from "@services/project-media/ProjectMediaService";
import { ImportCommandSchema, ImportIdSchema, CopyMediaCommandSchema } from "@shared/schemas/workflow/import.schemas";

import { ChangeMediaSchema } from "@shared/schemas/workflow/management.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";

export interface ProjectRouteServices {
  mediaActions?: { changeMedia(ownerId: string, projectId: string, versionId: string, patch: z.output<typeof ChangeMediaSchema>): Promise<MediaVersion> };
  projects: ProjectStore;
  conversations: ConversationStore;
  drafts: CreationDraftStore;
  history?: RequestHistoryStore;
  media?: MediaVersionIndex;
  library?: ProjectMediaService;
  mediaAccess?: (ownerId: string, storagePath: string) => Promise<{ viewUrl: string; expiresAt: string }>;
}

function param(req: Request, key: string): string {
  return z.string().parse(req.params[key]);
}

/** New workflow records are additive; legacy sessions keep their own routes. */
export function createProjectRoutes({ projects, conversations, drafts, history, media, mediaAccess, library, mediaActions }: ProjectRouteServices): Router {
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
  router.post("/library", handle({ body: z.strictObject({}) }, ({ creatorId }) => projects.ensureLibrary(creatorId)));
  router.get("/:projectId", handle({}, ({ creatorId, req }) => projects.get(creatorId, param(req, "projectId"))));
  router.patch("/:projectId", handle({ body: ChangeProjectCommandSchema }, ({ creatorId, req, body }) => projects.change(creatorId, param(req, "projectId"), body)));
  router.get("/:projectId/conversations", handle({}, async ({ creatorId, req }) => {
    const projectId = param(req, "projectId");
    const [rows, counts] = await Promise.all([conversations.list(creatorId, projectId), history?.conversationMediaCounts(creatorId, projectId)]);
    return counts ? rows.map(row => ConversationListingSchema.parse({ ...row, media: counts.get(row.id) ?? { pictures: 0, clips: 0 } })) : rows;
  }));
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
  if (history) router.get("/:projectId/conversations/:conversationId/requests", handle({}, ({ creatorId, req }) => history.list(creatorId, param(req, "projectId"), param(req, "conversationId"))));
  if (media) {
    router.get("/:projectId/media", handle({}, ({ creatorId, req }) => media.list(creatorId, param(req, "projectId"))));
    router.get("/:projectId/media/:versionId/access", handle({}, async ({ creatorId, req }) => {
      const versionId = VersionIdSchema.safeParse(req.params.versionId);
      if (!versionId.success) throw new WorkflowError("invalid_settings", "This media identity is invalid.");
      const version = await media.get(creatorId, param(req, "projectId"), versionId.data);
      if (!version) throw new WorkflowError("not_found", "This stored version is unavailable.");
      if (!mediaAccess) throw new WorkflowError("capability_unavailable", "Media access is unavailable. Keep this version and try again.");
      const access = await mediaAccess(creatorId, version.object.storagePath);
      return { url: access.viewUrl, expiresAt: access.expiresAt };
    }));
  }
  if (library) {
    router.param("importId", (req, res, next, value: string): void => { if (!ImportIdSchema.safeParse(value).success) { respond.fail(res, req, 400, { error: "The upload identity is invalid.", code: "INVALID_REQUEST" }); return; } next(); });
    router.param("versionId", (req, res, next, value: string): void => { if (!VersionIdSchema.safeParse(value).success) { respond.fail(res, req, 400, { error: "The media identity is invalid.", code: "INVALID_REQUEST" }); return; } next(); });
    router.get("/:projectId/imports", handle({}, ({ creatorId, req }) => library.list(creatorId, param(req, "projectId"))));
    router.post("/:projectId/imports", handle({ body: ImportCommandSchema }, ({ creatorId, req, body }) => library.begin(creatorId, param(req, "projectId"), body, req.header("origin"))));
    router.post("/:projectId/imports/:importId/finish", handle({}, ({ creatorId, req }) => library.finish(creatorId, param(req, "projectId"), param(req, "importId"))));
    router.post("/:projectId/imports/:importId/cancel", handle({ body: z.union([ImportCommandSchema, z.strictObject({})]) }, ({ creatorId, req, body }) => library.cancel(creatorId, param(req, "projectId"), param(req, "importId"), body)));
    router.patch("/:projectId/media/:versionId", handle({ body: ChangeMediaSchema }, ({ creatorId, req, body }) => { if (mediaActions) return mediaActions.changeMedia(creatorId, param(req, "projectId"), param(req, "versionId"), body); if (media) return media.change(creatorId, param(req, "projectId"), param(req, "versionId"), body); if (body.hidden !== undefined && body.label === undefined && body.favorite === undefined) return library.visibility(creatorId, param(req, "projectId"), param(req, "versionId"), body.hidden); throw new WorkflowError("capability_unavailable", "This media change is unavailable."); }));
    router.post("/:projectId/media/:versionId/copy", handle({ body: CopyMediaCommandSchema }, ({ creatorId, req, body }) => library.copy(creatorId, param(req, "projectId"), param(req, "versionId"), body)));
  }
  return router;
}
