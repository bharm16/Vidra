import express, { type Request, type Response, type Router } from "express";
import { asyncHandler } from "@middleware/asyncHandler";

/**
 * Realtime-sketch token mint (spec: docs/superpowers/specs/2026-07-09-realtime-sketch-spike-design.md,
 * transport: ADR-0016), speaking the fal proxy dialect the installed
 * @fal-ai/client@1.8.4 requires: the browser client is configured with
 * `proxyUrl` pointing here and auto-mints its own realtime tokens through us
 * (client auth.js expects fal's raw response body, so the house
 * {success,data} envelope deliberately does not apply on this route).
 *
 * This is NOT a general fal proxy. It forwards exactly one request shape —
 * the token mint — and overwrites the client-supplied body with the
 * server-side allowlist, so the JWT can never reach a model that isn't
 * approved here. Widening FAL_TOKEN_ALLOWED_APPS is an ADR-0016 revisit,
 * not a config tweak.
 */
export const FAL_TOKEN_ALLOWED_APPS = ["fal-ai/fast-lightning-sdxl"] as const;
export const FAL_TOKEN_EXPIRATION_SECONDS = 120;
const FAL_TOKEN_MINT_URL = "https://rest.alpha.fal.ai/tokens/";
const TARGET_URL_HEADER = "x-fal-target-url";

interface FalTokenRouterDeps {
  falKey: string | undefined;
  fetchFn?: (url: string, init?: RequestInit) => Promise<globalThis.Response>;
}

export function createFalTokenRouter(deps: FalTokenRouterDeps): Router {
  const { falKey, fetchFn = fetch } = deps;
  const router = express.Router();

  router.post(
    "/proxy",
    asyncHandler(async (req: Request, res: Response) => {
      const targetUrl = req.header(TARGET_URL_HEADER);
      if (targetUrl !== FAL_TOKEN_MINT_URL) {
        res.status(403).json({
          detail: "This proxy only mints realtime tokens",
        });
        return;
      }
      if (!falKey) {
        res.status(503).json({ detail: "FAL_KEY not configured" });
        return;
      }
      const upstream = await fetchFn(FAL_TOKEN_MINT_URL, {
        method: "POST",
        headers: {
          Authorization: `Key ${falKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          allowed_apps: [...FAL_TOKEN_ALLOWED_APPS],
          token_expiration: FAL_TOKEN_EXPIRATION_SECONDS,
        }),
      });
      const bodyText = await upstream.text();
      res.status(upstream.status).type("application/json").send(bodyText);
    }),
  );

  return router;
}
