import { Router, type Request } from "express";
import { z } from "zod";
import { handle } from "@middleware/intake";
import { respond } from "@middleware/respond";
import { EditIdSchema, ProjectIdSchema, VersionIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { CreateVideoEditSchema, CreateVideoExportSchema, ExportIdSchema, SaveVideoEditSchema } from "@shared/schemas/workflow/video-edit.schemas";
import type { VideoPreviewService } from "@services/video-editing/VideoPreviewService";
import type { VideoEditStore } from "@services/video-editing/VideoEditStore";
import type { VideoExportService } from "@services/video-export/VideoExportService";
import type { ProjectStore } from "@services/projects/ProjectStore";
import { videoFontPath } from "@services/video-export/CaptionRasterizer";
function param(req: Request, key: string): string { return z.string().parse(req.params[key]); }
/** Mounted under /api/projects alongside project routes; auth intake remains fail-closed. */
export function createVideoEditRoutes({ edits, exports, projects, previews }: { edits: VideoEditStore; exports: VideoExportService; projects: ProjectStore; previews?: VideoPreviewService }): Router {
  const router = Router();
  for (const [name, schema] of [["projectId", ProjectIdSchema], ["editId", EditIdSchema], ["exportId", ExportIdSchema]] as const) router.param(name, (req, res, next, value: string): void => { if (!schema.safeParse(value).success) { respond.fail(res, req, 400, { error: "This identity is invalid.", code: "INVALID_REQUEST" }); return; } next(); });
  if (previews) router.get("/:projectId/media/:versionId/editor-preview", handle({}, ({ creatorId, req }) => previews.access(creatorId, param(req, "projectId"), VersionIdSchema.parse(req.params.versionId))));
  router.get("/:projectId/video-edits", handle({}, ({ creatorId, req }) => edits.list(creatorId, param(req, "projectId"))));
  router.post("/:projectId/video-edits", handle({ body: CreateVideoEditSchema }, ({ creatorId, req, body }) => edits.create(creatorId, param(req, "projectId"), body)));
  router.get("/:projectId/video-edits/:editId", handle({}, ({ creatorId, req }) => edits.get(creatorId, param(req, "projectId"), param(req, "editId"))));
  router.get("/:projectId/video-edits/:editId/revisions", handle({}, ({ creatorId, req }) => edits.revisions(creatorId, param(req, "projectId"), param(req, "editId"))));
  router.post("/:projectId/video-edits/:editId/commands", handle({ body: SaveVideoEditSchema }, ({ creatorId, req, body }) => edits.save(creatorId, param(req, "projectId"), param(req, "editId"), body)));
  router.post("/:projectId/video-edits/:editId/exports", handle({ body: CreateVideoExportSchema }, ({ creatorId, req, body }) => exports.create(creatorId, param(req, "projectId"), param(req, "editId"), body)));
  router.get("/:projectId/exports", handle({}, ({ creatorId, req }) => exports.list(creatorId, param(req, "projectId"))));
  router.get("/:projectId/exports/:exportId", handle({}, ({ creatorId, req }) => exports.get(creatorId, param(req, "projectId"), param(req, "exportId"))));
  router.post("/:projectId/exports/:exportId/resume", handle({}, ({ creatorId, req }) => exports.resume(creatorId, param(req, "projectId"), param(req, "exportId"))));
  router.post("/:projectId/exports/:exportId/cancel", handle({}, ({ creatorId, req }) => exports.cancel(creatorId, param(req, "projectId"), param(req, "exportId"))));
  router.get("/:projectId/exports/:exportId/access", handle({}, ({ creatorId, req }) => exports.access(creatorId, param(req, "projectId"), param(req, "exportId"))));
  router.get("/:projectId/video-fonts/:weight", handle({}, async ({ creatorId, req, res }) => { await projects.get(creatorId, param(req, "projectId")); const weight = z.union([z.literal("400"), z.literal("500"), z.literal("600")]).parse(req.params.weight); res.type("font/ttf"); res.setHeader("Cache-Control", "private, max-age=31536000, immutable"); res.sendFile(videoFontPath(weight === "400" ? 400 : weight === "500" ? 500 : 600)); }));
  return router;
}
