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
import {
  findUnresolvedSketchAcceptances,
  type AdmissionReceiptReaderPort,
} from "@services/admission/unresolvedAcceptances";
import type { OwnedPictureResolver } from "@services/owned-media";
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
  /**
   * Issue #125: re-mints a replayed acceptance's `imageUrl` from its durable
   * handle. Independently optional — acceptance still works without it, a
   * replay just keeps its stored (expiring) URL.
   */
  resolver?: OwnedPictureResolver | null | undefined;
  /**
   * Issue #134: the #128 receipts, so a refreshed client can find an
   * acceptance whose attachment never resolved. Satisfied by the same
   * idempotency store as `idempotency`; optional separately because recovery
   * being unavailable must not take the accept door down with it.
   */
  receipts?: AdmissionReceiptReaderPort | null | undefined;
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

      const { sessionService, mediaStore, idempotency, resolver } = deps;
      if (!sessionService || !mediaStore || !idempotency) {
        res.status(503).json({
          success: false,
          error:
            "Couldn’t use this picture — storage is unavailable right now. Nothing was saved.",
        });
        return;
      }

      const result = await acceptLiveOutput(
        {
          sessionService,
          mediaStore,
          idempotency,
          ...(resolver ? { resolver } : {}),
        },
        {
          userId: creatorId,
          accepted: parsed.data,
          model: FAL_I2I_MODEL_ENDPOINT,
        },
      );

      switch (result.state) {
        case "accepted":
          // Issue #134: nothing is reported as accepted until the outcome is
          // known. 201 Created is the answer only when the take actually
          // reached its session; a take that was admitted but not attached is
          // made-but-not-saved — still a 2xx, because the body IS the creator's
          // recovery record (the attachment fact a retry re-sends), but not a
          // 201, because nothing was created in the session the take names.
          res
            .status(result.result.attachment.state === "attached" ? 201 : 200)
            .json({ success: true, data: result.result });
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

  // Issue #134: recovery after refresh. The live editor keeps nothing
  // (ADR-0017), so a creator who lost the acceptance's response finds the
  // unresolved acceptance where it actually lives — the session the take was
  // minted into. The #128 receipts are the index; the session is the truth of
  // what is still owed. Attachment discovery only: never a re-render, never a
  // re-store, and the repair is #133's record-POST door, not a re-accept.
  router.get(
    "/accept/unresolved",
    asyncHandler(async (req: Request, res: Response) => {
      const creatorId = requireCreatorId(req, res);
      if (creatorId === null) return;

      const { sessionService, receipts } = deps;
      if (!sessionService || !receipts) {
        res.status(503).json({
          success: false,
          error: "Attachment recovery is not available",
        });
        return;
      }

      const rawSessionId = (req.query as { sessionId?: unknown }).sessionId;
      const sessionId =
        typeof rawSessionId === "string" && rawSessionId.trim().length > 0
          ? rawSessionId.trim()
          : null;
      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: "sessionId is required",
        });
        return;
      }

      try {
        const attachments = await findUnresolvedSketchAcceptances(
          { receipts, sessionService },
          { userId: creatorId, sessionId },
        );
        res.json({ success: true, data: { attachments } });
      } catch {
        // A session that is gone, or never was the caller's, has no debts to
        // show — the same answer the accept door gives a refused destination.
        res
          .status(404)
          .json({ success: false, error: "That session is not available." });
      }
    }),
  );

  return router;
}
