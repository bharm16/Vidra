import express, { type Request, type Response, type Router } from "express";
import { asyncHandler } from "@middleware/asyncHandler";
import { requireCreatorId } from "@middleware/intake";
import {
  acceptLiveOutput,
  type AcceptLiveOutputSessionPort,
} from "@services/admission/acceptLiveOutput";
import type {
  AdmissionIdempotencyPort,
  AdmissionMediaStore,
} from "@services/admission/admitPictureTake";
import { SketchAcceptRequestSchema } from "@shared/schemas/sketch.schemas";
import { FAL_I2I_MODEL_ENDPOINT } from "./fal-i2i.routes";

/**
 * "Use this" — the Live editor's one accept door (ADR-0022 decision 5, #87).
 *
 * Its own router rather than a second verb on the frame relay: the relay holds
 * FAL_KEY and runs at drawing cadence under a burst lane, while this runs once
 * per press and touches the creator's sessions and storage. Sharing a file
 * would put those two under one set of dependencies and one rate limit.
 *
 * The handler is only a translator. Every decision — the ordering, the
 * provenance, what a failure leaves behind — is `acceptLiveOutput`'s, which is
 * HTTP-free precisely so those decisions are testable without a server.
 */

interface SketchAcceptRouterDeps {
  /**
   * All three nullable together: without them acceptance is unavailable, and
   * saying so with a 503 beats an unmounted route's 404 — a creator who
   * pressed Use this deserves the reason, not a missing page.
   */
  sessionService: AcceptLiveOutputSessionPort | null | undefined;
  mediaStore: AdmissionMediaStore | null | undefined;
  idempotency: AdmissionIdempotencyPort | null | undefined;
}

export function createSketchAcceptRouter(deps: SketchAcceptRouterDeps): Router {
  const router = express.Router();

  router.post(
    "/accept",
    asyncHandler(async (req: Request, res: Response) => {
      const creatorId = requireCreatorId(req, res);
      if (creatorId === null) return;

      const parsed = SketchAcceptRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ success: false, error: "Invalid acceptance request." });
        return;
      }

      const { sessionService, mediaStore, idempotency } = deps;
      if (!sessionService || !mediaStore || !idempotency) {
        res.status(503).json({
          success: false,
          error:
            "Couldn’t use this picture — storage is unavailable right now. Nothing was saved.",
        });
        return;
      }

      const result = await acceptLiveOutput(
        { sessionService, mediaStore, idempotency },
        {
          userId: creatorId,
          accepted: parsed.data,
          model: FAL_I2I_MODEL_ENDPOINT,
        },
      );

      switch (result.state) {
        case "accepted":
          res.status(201).json({ success: true, data: result.result });
          return;
        case "invalid":
          res.status(400).json({
            success: false,
            error: `Couldn’t read that picture — ${result.reason}.`,
          });
          return;
        case "refused":
          res
            .status(404)
            .json({ success: false, error: "That session is not available." });
          return;
        case "unavailable":
          res.status(503).json({
            success: false,
            error: `Couldn’t use this picture — ${result.reason}. Nothing was saved.`,
          });
          return;
        case "in_progress":
          res.status(409).json({
            success: false,
            error: "This picture is already being added.",
          });
          return;
        case "conflict":
          res.status(409).json({
            success: false,
            error: "That acceptance was already used for another picture.",
          });
          return;
      }
    }),
  );

  return router;
}
