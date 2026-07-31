/**
 * The one place an inbound request becomes the values a handler is allowed to
 * trust.
 *
 * Before this module every route re-derived "who is the Creator" for itself:
 * eight implementations of the same question, three of which disagreed about
 * what the answer even was (`null`, the string `"anonymous"`, or a
 * self-verified Firebase token), and ~34 copies of the same
 * `req as RequestWithUser` cast at the call sites. Body validation was in the
 * same state — a `validateRequest` middleware, twelve route files hand-rolling
 * `safeParse(req.body)` with a bespoke 400 each, and two routes that shipped
 * raw Zod issue arrays in `details` even though the shared contract types it
 * `string`.
 *
 * A handler now DECLARES what it needs and receives it:
 *
 *   router.post("/", handle({ auth: "required", body: CreateSchema },
 *     async ({ creatorId, body }) => service.create(creatorId, body)));
 *
 * Everything this module emits goes through `respond` (respond.ts), so there
 * is exactly one 401 body and exactly one 400 body on the whole server.
 *
 * ## The cast lives here
 *
 * Express types `req` without the fields `apiAuthMiddleware` attaches. That
 * bridge is an unsafe cast wherever it happens; it happens once, in
 * `creatorIdOf`, and nowhere else.
 *
 * ## Auth is fail-closed
 *
 * `auth` defaults to `"required"`. A route that genuinely serves
 * unauthenticated callers must say `auth: "anonymous"` out loud, and its
 * handler is then handed `creatorId: string | null` — the compiler makes the
 * null case impossible to forget. Note what `"anonymous"` does NOT mean: it is
 * the ABSENCE of a Creator, never the literal string `"anonymous"`. That
 * string is `extractUserId`'s fallback (utils/requestHelpers.ts), where it is
 * a telemetry label; `isCreatorId` below rejects it outright so the label can
 * never be mistaken for an identity.
 */

import { isIP } from "node:net";
import type { Request, RequestHandler, Response } from "express";
import type { output, ZodType } from "zod";
import { logger } from "@infrastructure/Logger";
import { formatValidationDetails } from "@utils/apiResponseHelpers";
import { respond } from "./respond.js";

/**
 * Whether a route needs an authenticated Creator.
 *
 * `"anonymous"` means "unauthenticated callers are allowed through" — it is a
 * deliberate declaration, not a default anyone falls into.
 */
export type AuthMode = "required" | "anonymous";

/**
 * The shape `apiAuthMiddleware` and `payment/auth.ts` attach to the request.
 * Deliberately not exported: the cast it enables is this module's job.
 */
type RequestWithUser = Request & { user?: { uid?: string } };

/**
 * Read the authenticated Creator's id, or `null` when the request carries no
 * identity. The single bridge between Express's untyped `Request` and the auth
 * middleware's contract.
 */
export function creatorIdOf(req: Request): string | null {
  return (req as RequestWithUser).user?.uid ?? null;
}

/**
 * Is this value a usable Creator identity?
 *
 * `apiAuth.ts` only ever sets `req.user.uid` from `decoded.uid` or from
 * `api-key:<key>`, so the two rejected shapes below cannot be produced by the
 * auth middleware as it stands. They are rejected anyway because they WERE
 * reachable through the other identity helpers this module replaces:
 * `extractUserId` substitutes the literal `"anonymous"` for a missing user,
 * and an IP address is what a request-scoped rate-limit key looks like. Four
 * preview handlers and `storage.routes.ts` each carried a private copy of this
 * exact guard; the other ~30 authenticated routes carried none. Rather than
 * delete five guards (a loosening) or leave thirty routes without one, the
 * strict definition becomes the only definition.
 */
function isCreatorId(value: string | null): value is string {
  if (value === null || value.trim().length === 0) return false;
  if (value === "anonymous") return false;
  // A uid shaped like an IP address is a rate-limit key that leaked into the
  // identity slot, never a Firebase uid.
  return isIP(value) === 0;
}

/**
 * Resolve the Creator's id, or write THE canonical 401 and return `null`.
 *
 * Kept as a standalone export so routes that cannot adopt `handle` (streaming
 * handlers, multipart uploads, anything that must run middleware between the
 * auth check and the body) still emit the same 401 as everything else.
 */
export function requireCreatorId(req: Request, res: Response): string | null {
  const id = creatorIdOf(req);
  if (!isCreatorId(id)) {
    respond.fail(res, req, 401, {
      error: "Authentication required",
      code: "AUTH_REQUIRED",
    });
    return null;
  }
  return id;
}

/** Result of a body parse — `ok: false` means the 400 has already been sent. */
export type BodyOutcome<T> = { ok: true; value: T } | { ok: false };

/**
 * Validate `req.body`, or write THE canonical 400 and return `{ ok: false }`.
 *
 * Every issue is reported, not just the first. A body with four bad fields
 * used to tell the Creator about one of them, which turns fixing a request
 * into four round trips; `config/env.ts` already made the opposite choice for
 * environment validation and it is the right one here too.
 */
export function requireBody<T>(
  schema: ZodType<T>,
  req: Request,
  res: Response,
): BodyOutcome<T> {
  const result = schema.safeParse(req.body);
  if (result.success) {
    return { ok: true, value: result.data };
  }

  const details = formatValidationDetails(result.error.issues);
  logger.warn("Request validation failed", {
    requestId: (req as Request & { id?: string }).id,
    path: req.path,
    details,
  });

  respond.fail(res, req, 400, {
    error: "Invalid request",
    code: "INVALID_REQUEST",
    details,
  });
  return { ok: false };
}

/** What a route declares it needs before its handler runs. */
export interface IntakeSpec<
  TSchema extends ZodType | undefined,
  TAuth extends AuthMode,
> {
  /** Defaults to `"required"`. Spell out `"anonymous"` to open a route up. */
  readonly auth?: TAuth;
  /** Omit for routes with no request body. */
  readonly body?: TSchema;
}

type BodyOf<TSchema> = TSchema extends ZodType ? output<TSchema> : undefined;

type CreatorOf<TAuth extends AuthMode> = TAuth extends "anonymous"
  ? string | null
  : string;

/** What the handler receives once intake has run. */
export interface IntakeContext<
  TSchema extends ZodType | undefined,
  TAuth extends AuthMode,
> {
  readonly req: Request;
  readonly res: Response;
  /** `string` under `auth: "required"`; `string | null` under `"anonymous"`. */
  readonly creatorId: CreatorOf<TAuth>;
  /** The schema's OUTPUT type — parsed and defaulted, never the raw body. */
  readonly body: BodyOf<TSchema>;
}

/**
 * Build an Express handler that validates, authorizes, and delegates.
 *
 * The handler owns its own success response, with one shortcut: return
 * `undefined` when you have already written to `res`, or return a value and
 * intake sends it through `respond.ok`. Both forms exist because route success
 * shapes on this server are genuinely not uniform — 201 Created, 204 No
 * Content, NDJSON turn streams, and the fal relay's verbatim passthrough are
 * all real — and this seam must not change any of them.
 *
 * Rejections are forwarded to the error middleware, exactly as `asyncHandler`
 * does, so wrapping a `handle(...)` in `asyncHandler` is redundant.
 */
export function handle<
  TSchema extends ZodType | undefined = undefined,
  TAuth extends AuthMode = "required",
>(
  spec: IntakeSpec<TSchema, TAuth>,
  handler: (ctx: IntakeContext<TSchema, TAuth>) => Promise<unknown> | unknown,
): RequestHandler {
  return (req, res, next) => {
    const run = async (): Promise<void> => {
      let creatorId: string | null;
      if (spec.auth === "anonymous") {
        const candidate = creatorIdOf(req);
        creatorId = isCreatorId(candidate) ? candidate : null;
      } else {
        creatorId = requireCreatorId(req, res);
        if (creatorId === null) return;
      }

      let body: unknown;
      if (spec.body !== undefined) {
        const parsed = requireBody(spec.body, req, res);
        if (!parsed.ok) return;
        body = parsed.value;
      }

      const result = await handler({
        req,
        res,
        creatorId,
        body,
      } as IntakeContext<TSchema, TAuth>);

      if (result !== undefined && !res.headersSent) {
        respond.ok(res, req, result);
      }
    };

    void run().catch(next);
  };
}
