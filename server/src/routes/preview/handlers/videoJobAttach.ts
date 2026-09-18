import type { Request, Response } from "express";
import { isIP } from "node:net";
import { logger } from "@infrastructure/Logger";
import type { PreviewRoutesServices } from "@routes/types";
import { attachCompletedJobToSession } from "@services/video-generation/jobs/attachJobToSession";

type VideoJobAttachServices = Pick<
  PreviewRoutesServices,
  "videoJobStore" | "sessionService"
>;

/**
 * Retry the attachment of an already-completed clip — ADR-0022 decision 6
 * ("its retry", and the "made but not saved" surface's retry affordance).
 *
 * The creator's side of the same function the worker runs. Nothing about the
 * clip crosses the wire: the job already holds the record its session is owed,
 * so this cannot be used to write a take the server did not produce. It reruns
 * no generation, changes no job status, and reaches no credit surface — the
 * clip is durable and was paid for long before this route is reachable.
 */
export const createVideoJobAttachHandler =
  ({ videoJobStore, sessionService }: VideoJobAttachServices) =>
  async (req: Request, res: Response): Promise<Response | void> => {
    if (!videoJobStore || !sessionService) {
      return res.status(503).json({
        success: false,
        error: "Session attachment is not available",
      });
    }

    const userId =
      (req as Request & { user?: { uid?: string } }).user?.uid ?? null;
    if (!userId || userId === "anonymous" || isIP(userId) !== 0) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
        message: "You must be logged in to attach a clip to a session.",
      });
    }

    const { jobId } = req.params as { jobId?: string };
    if (!jobId) {
      return res
        .status(400)
        .json({ success: false, error: "jobId is required" });
    }

    const job = await videoJobStore.getJob(jobId);
    if (!job) {
      return res
        .status(404)
        .json({ success: false, error: "Video job not found" });
    }
    if (job.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: "Access denied",
        message: "This job does not belong to the authenticated user.",
      });
    }

    if (job.status !== "completed") {
      // 409: well-formed, but there is no take to attach yet. The generation
      // outcome is not this route's to change.
      return res.status(409).json({
        success: false,
        error: "This clip has not finished rendering",
      });
    }

    if (!job.sessionId || !job.promptVersionId) {
      return res.status(400).json({
        success: false,
        error: "This clip names no session to attach to",
      });
    }

    const attachment = await attachCompletedJobToSession({
      job,
      jobStore: videoJobStore,
      sessionService,
      log: logger,
      logPrefix: "Retried clip",
    });

    return res.json({ success: true, attachment });
  };
