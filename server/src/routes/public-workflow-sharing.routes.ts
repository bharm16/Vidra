import { Router } from "express";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { asyncHandler } from "@middleware/asyncHandler";
import { respond } from "@middleware/respond";
import type { WorkflowManagementService } from "@services/workflow-sharing/WorkflowManagementService";
import { UnsatisfiableRangeError } from "@services/workflow-sharing/types";

/** Every GET/Range request rechecks revocation and project epoch; no grant URL escapes the proxy. */
export function createPublicWorkflowSharingRoutes(service: WorkflowManagementService, options: { publicBaseUrl: string }): Router {
  const publicBaseUrl = z.url().parse(options.publicBaseUrl);
  const router = Router();
  router.get("/:id", asyncHandler(async (req, res) => { res.setHeader("Cache-Control", "private, no-store, max-age=0"); respond.ok(res, req, await service.publicVersion(z.string().parse(req.params.id), publicBaseUrl)); }));
  router.get("/:id/content", asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store, max-age=0"); res.setHeader("X-Content-Type-Options", "nosniff");
    let content;
    try { content = await service.publicContent(z.string().parse(req.params.id), req.header("range")); }
    catch (error) { if (error instanceof UnsatisfiableRangeError) { res.setHeader("Content-Range", `bytes */${error.bytes}`); res.status(416).end(); return; } throw error; }
    res.setHeader("Accept-Ranges", "bytes"); res.setHeader("Content-Type", content.contentType);
    if (content.range) { res.status(206); res.setHeader("Content-Range", `bytes ${content.range.start}-${content.range.end}/${content.bytes}`); res.setHeader("Content-Length", content.range.end - content.range.start + 1); }
    else res.setHeader("Content-Length", content.bytes);
    try { await pipeline(content.stream, res); } catch (error) { if (!res.destroyed) throw error; }
  }));
  return router;
}
