import express, { type Request, type Response, type Router } from "express";
import { z } from "zod";
import { asyncHandler } from "@middleware/asyncHandler";

/**
 * Realtime-sketch frame relay (spec: docs/superpowers/specs/2026-07-09-realtime-sketch-spike-design.md,
 * ADR-0016 as amended). fal retired its realtime-WebSocket i2i runners, so
 * frames flow browser → this relay → fal.run over HTTP sync; FAL_KEY and the
 * model choice both live here, never in the browser. fal's response is
 * mirrored verbatim (the client's anti-corruption schema consumes it).
 *
 * Model measured 2026-07-09: z-image turbo i2i ≈ 190ms inference / ~600ms
 * total at 512² — the quality/speed frontier point. Swapping models is a
 * one-constant change here.
 */
export const FAL_I2I_MODEL_ENDPOINT = "fal-ai/z-image/turbo/image-to-image";
const FAL_RUN_URL = `https://fal.run/${FAL_I2I_MODEL_ENDPOINT}`;

const SketchFrameSchema = z.object({
  prompt: z.string().min(1),
  image_url: z.string().min(1),
  strength: z.number().min(0).max(1),
  num_inference_steps: z.number().int().min(1).max(20),
  seed: z.number().int(),
});

interface FalI2iRouterDeps {
  falKey: string | undefined;
  fetchFn?: (url: string, init?: RequestInit) => Promise<globalThis.Response>;
  /** Backstop for hung upstream calls; the client's 8s watchdog normally wins. */
  upstreamTimeoutMs?: number;
}

export function createFalI2iRouter(deps: FalI2iRouterDeps): Router {
  const { falKey, fetchFn = fetch, upstreamTimeoutMs = 10_000 } = deps;
  const router = express.Router();

  router.post(
    "/i2i",
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = SketchFrameSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ detail: "Invalid sketch frame" });
        return;
      }
      if (!falKey) {
        res.status(503).json({ detail: "FAL_KEY not configured" });
        return;
      }
      // A frame nobody is waiting for must stop billing: abort the upstream
      // call when the browser disconnects (watchdog abort, tab close) or when
      // fal hangs past the backstop deadline.
      const controller = new AbortController();
      let abortCause: "client-gone" | "timeout" | null = null;
      const timeoutHandle = setTimeout(() => {
        abortCause ??= "timeout";
        controller.abort();
      }, upstreamTimeoutMs);
      const onResClose = (): void => {
        if (!res.writableEnded) {
          abortCause ??= "client-gone";
          controller.abort();
        }
      };
      res.on("close", onResClose);
      try {
        const upstream = await fetchFn(FAL_RUN_URL, {
          method: "POST",
          headers: {
            Authorization: `Key ${falKey}`,
            "Content-Type": "application/json",
          },
          // output_format pinned here with the model (ADR-0016): fal's default
          // is png — 192KB/frame vs 25KB as webp, measured 2026-07-27.
          body: JSON.stringify({
            ...parsed.data,
            sync_mode: true,
            output_format: "webp",
          }),
          signal: controller.signal,
        });
        const bodyText = await upstream.text();
        res.status(upstream.status).type("application/json").send(bodyText);
      } catch (error) {
        if (abortCause === "client-gone") {
          return;
        }
        if (abortCause === "timeout") {
          res.status(504).json({ detail: "fal upstream timed out" });
          return;
        }
        throw error;
      } finally {
        clearTimeout(timeoutHandle);
        res.off("close", onResClose);
      }
    }),
  );

  return router;
}
