import type { Request, Response } from "express";
import { createSseChannel } from "@routes/optimize/sse";
import type { ContinuitySessionService } from "@services/continuity/ContinuitySessionService";
import type {
  ContinuitySession,
  ContinuityShot,
} from "@services/continuity/types";
import type { RouteCreditService } from "@services/credits/ports";
import type { ShotGenerationObserver } from "@services/continuity/ShotGenerationProgress";
import {
  reserveShotGenerationCredits,
  settleExceptionalShotGeneration,
  settleSuccessfulShotGeneration,
} from "./continuityRouteShared";

interface StreamErrorPayload {
  success: false;
  error: string;
}

const toErrorPayload = (error: unknown): StreamErrorPayload => ({
  success: false,
  error: error instanceof Error ? error.message : String(error),
});

const safeSend = (
  sendEvent: (eventType: string, data: unknown) => void,
  event: string,
  data: unknown,
): void => {
  try {
    sendEvent(event, data);
  } catch {
    // Ignore write failures from disconnected/broken SSE streams.
  }
};

export async function handleGenerateShotStream(
  service: ContinuitySessionService,
  session: ContinuitySession,
  req: Request,
  res: Response,
  userCreditService?: RouteCreditService | null,
): Promise<void> {
  const reservation = await reserveShotGenerationCredits(
    session,
    req,
    res,
    userCreditService,
  );
  if (!reservation || !userCreditService) return;

  const sse = createSseChannel(req, res);
  sse.markProcessingStarted();

  const keepalive = setInterval(() => {
    safeSend(sse.sendEvent, "ping", { timestamp: Date.now() });
  }, 15_000);

  const observer: ShotGenerationObserver = {
    onStage: (event) => {
      safeSend(sse.sendEvent, "stage", event);
    },
  };

  let result: ContinuityShot | null = null;
  let thrown: unknown = null;

  try {
    result = await service.generateShot(
      session.id,
      reservation.shotId,
      observer,
    );
  } catch (error) {
    thrown = error;
  } finally {
    try {
      if (result) {
        await settleSuccessfulShotGeneration(
          session,
          userCreditService,
          reservation,
          result,
        );
        safeSend(sse.sendEvent, "result", {
          success: true,
          data: result,
        });
      } else if (thrown) {
        await settleExceptionalShotGeneration(
          session,
          userCreditService,
          reservation,
        );
        safeSend(sse.sendEvent, "error", toErrorPayload(thrown));
      }
    } finally {
      clearInterval(keepalive);
      sse.close();
    }
  }
}
