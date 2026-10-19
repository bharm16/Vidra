import { Router, type Router as ExpressRouter } from "express";
import { handle } from "@middleware/intake";
import type { AccountUsageService } from "@services/account/AccountUsageService";

/** Mounted behind apiAuthMiddleware at /api/account. */
export function createAccountRoutes(usage: Pick<AccountUsageService, "get">): ExpressRouter {
  const router = Router();
  router.get("/usage", handle({ auth: "required" }, async ({ creatorId }) => usage.get(creatorId)));
  return router;
}
