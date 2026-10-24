import { listOptions } from "@services/firestore/WorkflowLists";
import { Router } from "express";
import { z } from "zod";
import { handle } from "@middleware/intake";
import { respond } from "@middleware/respond";
import { ChangeFolderCommandSchema, CreateFolderCommandSchema } from "@shared/schemas/workflow/project.schemas";
import { FolderIdSchema } from "@shared/schemas/workflow/identity.schemas";
import type { FolderStore } from "@services/projects/FolderStore";

/** Named projects that library conversations are filed into. */
export function createFolderRoutes(folders: Pick<FolderStore, "create" | "get" | "page" | "list" | "change">): Router {
  const router = Router();
  router.param("folderId", (req, res, next, value: string): void => {
    if (!FolderIdSchema.safeParse(value).success) { respond.fail(res, req, 400, { error: "The requested identity is invalid.", code: "INVALID_REQUEST" }); return; }
    next();
  });
  router.get("/", handle({}, ({ creatorId, req }) => req.query.page === "true" ? folders.page(creatorId, listOptions(req.query)) : folders.list(creatorId)));
  router.post("/", handle({ body: CreateFolderCommandSchema }, async ({ creatorId, body, req, res }) => {
    respond.ok(res, req, await folders.create(creatorId, body), 201);
  }));
  router.get("/:folderId", handle({}, ({ creatorId, req }) => folders.get(creatorId, z.string().parse(req.params.folderId))));
  router.patch("/:folderId", handle({ body: ChangeFolderCommandSchema }, ({ creatorId, body, req }) => folders.change(creatorId, z.string().parse(req.params.folderId), body)));
  return router;
}
