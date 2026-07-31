import type { Request, Response } from "express";
import { requireCreatorId } from "./intake.js";

/**
 * The request shape the auth middleware attaches. Still exported because ~34
 * call sites name it in the `req as RequestWithUser` cast; `intake.handle`
 * removes the need for that cast, and this type goes away with the last one.
 */
export type RequestWithUser = Request & { user?: { uid?: string } };

/**
 * Resolve the authenticated Creator's id, or write the canonical 401.
 *
 * Now a one-line alias for `intake.requireCreatorId` — the same 401 body as
 * before, but the identity RULE is shared rather than reimplemented. That
 * matters: this used to accept any truthy `uid`, while `storage.routes.ts` and
 * four preview handlers separately rejected `"anonymous"` and IP-shaped ids.
 * Routing through intake gives every caller the stricter rule.
 */
export function requireUserId(
  req: RequestWithUser,
  res: Response,
): string | null {
  return requireCreatorId(req, res);
}
