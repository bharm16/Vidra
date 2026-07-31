import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { z } from "zod";
import { respond } from "@middleware/respond";
import { formatValidationDetails } from "@utils/apiResponseHelpers";
import type { UserCreditService } from "@services/credits/UserCreditService";
import type { ContinuitySessionService } from "@services/continuity/ContinuitySessionService";
import type {
  ContinuitySession,
  ContinuityShot,
} from "@services/continuity/types";
import { CreditCostCalculator } from "@services/continuity/CreditCostCalculator";
import { GENERATION_ERROR_CODES } from "@routes/generationErrorCodes";
import { buildRefundKey, refundWithGuard } from "@services/credits/refundGuard";
import { requireUserId, type RequestWithUser } from "@middleware/requireUserId";
import {
  CreateSceneProxySchema,
  CreateShotSchema,
  PreviewSceneProxySchema,
  UpdatePrimaryStyleReferenceSchema,
  UpdateSessionSettingsSchema,
  UpdateShotSchema,
  UpdateStyleReferenceSchema,
} from "@server/schemas/continuity.schemas";

export { requireUserId, type RequestWithUser };
export {
  CreateSceneProxySchema,
  CreateShotSchema,
  PreviewSceneProxySchema,
  UpdatePrimaryStyleReferenceSchema,
  UpdateSessionSettingsSchema,
  UpdateShotSchema,
  UpdateStyleReferenceSchema,
};
export const ContinuitySessionInputSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    sourceVideoId: z.string().optional().nullable(),
    sourceImageUrl: z.string().optional().nullable(),
    initialPrompt: z.string().optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .strip();

/**
 * Resolve the caller's continuity session, or write the canonical error and
 * return null.
 *
 * This used to take a `canonicalErrors?: boolean` that selected between two
 * envelopes, with every branch written twice. Both branches now collapse onto
 * `respond.fail`: the only difference was that the legacy arm omitted `code`
 * and `requestId`, and both are additive on the wire.
 */
export async function requireSessionForUser(
  service: ContinuitySessionService,
  req: Request,
  res: Response,
): Promise<ContinuitySession | null> {
  const userId = (req as RequestWithUser).user?.uid ?? null;
  if (!userId) {
    respond.fail(res, req, 401, {
      error: "Authentication required",
      code: GENERATION_ERROR_CODES.AUTH_REQUIRED,
    });
    return null;
  }

  const sessionId = req.params.sessionId;
  if (!sessionId || Array.isArray(sessionId)) {
    respond.fail(res, req, 400, {
      error: "Invalid sessionId",
      code: GENERATION_ERROR_CODES.INVALID_REQUEST,
    });
    return null;
  }

  const session = await service.getSession(sessionId);
  if (!session) {
    respond.fail(res, req, 404, {
      error: "Session not found",
      code: GENERATION_ERROR_CODES.INVALID_REQUEST,
    });
    return null;
  }
  if (session.userId !== userId) {
    respond.fail(res, req, 403, {
      error: "Access denied",
      code: GENERATION_ERROR_CODES.AUTH_REQUIRED,
    });
    return null;
  }
  return session;
}

const sendValidationError = (
  res: Response,
  req: Request,
  error: z.ZodError,
) => {
  respond.fail(res, req, 400, {
    error: "Invalid request",
    code: GENERATION_ERROR_CODES.INVALID_REQUEST,
    details: formatValidationDetails(error.issues),
  });
};

const buildCameraInput = (
  camera?: z.infer<typeof CreateShotSchema>["camera"],
): {
  camera?: { yaw?: number; pitch?: number; roll?: number; dolly?: number };
} => {
  if (!camera) return {};
  return {
    camera: {
      ...(camera.yaw !== undefined ? { yaw: camera.yaw } : {}),
      ...(camera.pitch !== undefined ? { pitch: camera.pitch } : {}),
      ...(camera.roll !== undefined ? { roll: camera.roll } : {}),
      ...(camera.dolly !== undefined ? { dolly: camera.dolly } : {}),
    },
  };
};

const buildCreateShotInput = (input: z.infer<typeof CreateShotSchema>) => ({
  prompt: input.prompt,
  ...(input.continuityMode ? { continuityMode: input.continuityMode } : {}),
  ...(input.generationMode ? { generationMode: input.generationMode } : {}),
  ...(input.styleReferenceId !== undefined
    ? { styleReferenceId: input.styleReferenceId }
    : {}),
  ...(input.styleStrength !== undefined
    ? { styleStrength: input.styleStrength }
    : {}),
  ...(input.sourceVideoId ? { sourceVideoId: input.sourceVideoId } : {}),
  ...(input.modelId ? { modelId: input.modelId } : {}),
  ...(input.characterAssetId
    ? { characterAssetId: input.characterAssetId }
    : {}),
  ...(input.faceStrength !== undefined
    ? { faceStrength: input.faceStrength }
    : {}),
  ...buildCameraInput(input.camera),
});

const buildUpdateShotCameraInput = (
  camera?: z.infer<typeof UpdateShotSchema>["camera"],
): {
  camera?: { yaw?: number; pitch?: number; roll?: number; dolly?: number };
} => {
  if (!camera) return {};
  return {
    camera: {
      ...(camera.yaw !== undefined ? { yaw: camera.yaw } : {}),
      ...(camera.pitch !== undefined ? { pitch: camera.pitch } : {}),
      ...(camera.roll !== undefined ? { roll: camera.roll } : {}),
      ...(camera.dolly !== undefined ? { dolly: camera.dolly } : {}),
    },
  };
};

export interface ShotGenerationReservation {
  shotId: string;
  cost: ReturnType<typeof CreditCostCalculator.calculateShotCost>;
  requestId?: string;
  operationToken: string;
  unusedRetriesRefundKey: string;
  failedActualCostRefundKey: string;
  catchAllRefundKey: string;
}

export async function reserveShotGenerationCredits(
  session: ContinuitySession,
  req: Request,
  res: Response,
  userCreditService?: UserCreditService | null,
): Promise<ShotGenerationReservation | null> {
  if (!userCreditService) {
    respond.fail(res, req, 503, {
      error: "Credit service unavailable",
      code: GENERATION_ERROR_CODES.SERVICE_UNAVAILABLE,
    });
    return null;
  }

  const shotId = req.params.shotId;
  if (!shotId || Array.isArray(shotId)) {
    respond.fail(res, req, 400, {
      error: "Invalid shotId",
      code: GENERATION_ERROR_CODES.INVALID_REQUEST,
    });
    return null;
  }

  const shot = session.shots.find((s) => s.id === shotId);
  if (!shot) {
    respond.fail(res, req, 404, {
      error: "Shot not found",
      code: GENERATION_ERROR_CODES.INVALID_REQUEST,
    });
    return null;
  }

  const cost = CreditCostCalculator.calculateShotCost(shot, session);
  const requestId = (req as Request & { id?: string }).id;
  const operationToken =
    requestId ??
    buildRefundKey([
      "continuity-shot",
      session.id,
      shotId,
      session.userId,
      Date.now(),
      randomUUID().slice(0, 8),
    ]);
  const unusedRetriesRefundKey = buildRefundKey([
    "continuity-shot",
    operationToken,
    "unusedRetries",
  ]);
  const failedActualCostRefundKey = buildRefundKey([
    "continuity-shot",
    operationToken,
    "failedActualCost",
  ]);
  const catchAllRefundKey = buildRefundKey([
    "continuity-shot",
    operationToken,
    "catchAll",
  ]);

  const reserved = await userCreditService.reserveCredits(
    session.userId,
    cost.totalCost,
  );
  if (!reserved) {
    respond.fail(res, req, 402, {
      error: "Insufficient credits",
      code: GENERATION_ERROR_CODES.INSUFFICIENT_CREDITS,
      details: `This generation requires up to ${cost.totalCost} credits (including possible retries).`,
    });
    return null;
  }

  return {
    shotId,
    cost,
    ...(requestId ? { requestId } : {}),
    operationToken,
    unusedRetriesRefundKey,
    failedActualCostRefundKey,
    catchAllRefundKey,
  };
}

export async function settleSuccessfulShotGeneration(
  session: ContinuitySession,
  userCreditService: UserCreditService,
  reservation: ShotGenerationReservation,
  result: ContinuityShot,
): Promise<void> {
  const actualRetries = result.retryCount ?? 0;
  const actualCost = reservation.cost.perAttemptCost * (actualRetries + 1);
  const refundAmount = reservation.cost.totalCost - actualCost;
  if (refundAmount > 0) {
    await refundWithGuard({
      userCreditService,
      userId: session.userId,
      amount: refundAmount,
      refundKey: reservation.unusedRetriesRefundKey,
      reason: "continuity shot unused retry budget",
      metadata: {
        ...(reservation.requestId ? { requestId: reservation.requestId } : {}),
        sessionId: session.id,
        shotId: reservation.shotId,
      },
    });
  }
  if (result.status === "failed") {
    await refundWithGuard({
      userCreditService,
      userId: session.userId,
      amount: actualCost,
      refundKey: reservation.failedActualCostRefundKey,
      reason: "continuity shot failed actual cost",
      metadata: {
        ...(reservation.requestId ? { requestId: reservation.requestId } : {}),
        sessionId: session.id,
        shotId: reservation.shotId,
      },
    });
  }
}

export async function settleExceptionalShotGeneration(
  session: ContinuitySession,
  userCreditService: UserCreditService,
  reservation: ShotGenerationReservation,
): Promise<void> {
  await refundWithGuard({
    userCreditService,
    userId: session.userId,
    amount: reservation.cost.totalCost,
    refundKey: reservation.catchAllRefundKey,
    reason: "continuity shot generation exception",
    metadata: {
      ...(reservation.requestId ? { requestId: reservation.requestId } : {}),
      sessionId: session.id,
      shotId: reservation.shotId,
    },
  });
}

export async function handleCreateShot(
  service: ContinuitySessionService,
  req: Request,
  res: Response,
  options: { sessionId: string; status?: number },
): Promise<void> {
  const parsed = CreateShotSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, req, parsed.error);
    return;
  }

  const shot = await service.addShot({
    sessionId: options.sessionId,
    ...buildCreateShotInput(parsed.data),
  });

  res.status(options.status ?? 201).json({ success: true, data: shot });
}

export async function handleUpdateShot(
  service: ContinuitySessionService,
  req: Request,
  res: Response,
  options: { sessionId: string; shotId: string },
): Promise<void> {
  const parsed = UpdateShotSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, req, parsed.error);
    return;
  }

  const updates = {
    ...(parsed.data.prompt !== undefined ? { prompt: parsed.data.prompt } : {}),
    ...(parsed.data.continuityMode !== undefined
      ? { continuityMode: parsed.data.continuityMode }
      : {}),
    ...(parsed.data.generationMode !== undefined
      ? { generationMode: parsed.data.generationMode }
      : {}),
    ...(parsed.data.styleReferenceId !== undefined
      ? { styleReferenceId: parsed.data.styleReferenceId }
      : {}),
    ...(parsed.data.styleStrength !== undefined
      ? { styleStrength: parsed.data.styleStrength }
      : {}),
    ...(parsed.data.modelId !== undefined
      ? { modelId: parsed.data.modelId }
      : {}),
    ...(parsed.data.characterAssetId !== undefined
      ? { characterAssetId: parsed.data.characterAssetId }
      : {}),
    ...(parsed.data.faceStrength !== undefined
      ? { faceStrength: parsed.data.faceStrength }
      : {}),
    ...buildUpdateShotCameraInput(parsed.data.camera),
    ...(parsed.data.versions !== undefined
      ? {
          versions: parsed.data
            .versions as unknown as ContinuityShot["versions"],
        }
      : {}),
  };
  const shot = await service.updateShot(
    options.sessionId,
    options.shotId,
    updates,
  );
  res.json({ success: true, data: shot });
}

export async function handleGenerateShot(
  service: ContinuitySessionService,
  session: ContinuitySession,
  req: Request,
  res: Response,
  userCreditService?: UserCreditService | null,
): Promise<void> {
  const reservation = await reserveShotGenerationCredits(
    session,
    req,
    res,
    userCreditService,
  );
  if (!reservation || !userCreditService) return;

  try {
    const result = await service.generateShot(session.id, reservation.shotId);
    await settleSuccessfulShotGeneration(
      session,
      userCreditService,
      reservation,
      result,
    );
    res.json({ success: true, data: result });
  } catch (error) {
    await settleExceptionalShotGeneration(
      session,
      userCreditService,
      reservation,
    );

    const statusCode =
      typeof (error as { statusCode?: unknown })?.statusCode === "number"
        ? ((error as { statusCode?: number }).statusCode as number)
        : 500;

    respond.fail(res, req, statusCode, {
      error: "Shot generation failed",
      code:
        statusCode === 503
          ? GENERATION_ERROR_CODES.SERVICE_UNAVAILABLE
          : GENERATION_ERROR_CODES.GENERATION_FAILED,
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function handleUpdateStyleReference(
  service: ContinuitySessionService,
  req: Request,
  res: Response,
  options: { sessionId: string; shotId: string },
): Promise<void> {
  const parsed = UpdateStyleReferenceSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, req, parsed.error);
    return;
  }

  const { styleReferenceId } = parsed.data;
  const normalizedStyleReferenceId =
    styleReferenceId === null || styleReferenceId === "primary"
      ? null
      : styleReferenceId;

  const shot = await service.updateShotStyleReference(
    options.sessionId,
    options.shotId,
    normalizedStyleReferenceId,
  );
  res.json({ success: true, data: shot });
}

export async function handleUpdateSessionSettings(
  service: ContinuitySessionService,
  req: Request,
  res: Response,
  options: { sessionId: string },
): Promise<void> {
  const parsed = UpdateSessionSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, req, parsed.error);
    return;
  }

  const updatedSession = await service.updateSessionSettings(
    options.sessionId,
    parsed.data.settings,
  );
  res.json({ success: true, data: updatedSession });
}

export async function handleUpdatePrimaryStyleReference(
  service: ContinuitySessionService,
  req: Request,
  res: Response,
  options: { sessionId: string },
): Promise<void> {
  const parsed = UpdatePrimaryStyleReferenceSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, req, parsed.error);
    return;
  }

  const updatedSession = await service.updatePrimaryStyleReference(
    options.sessionId,
    parsed.data.sourceVideoId,
    parsed.data.sourceImageUrl,
  );
  res.json({ success: true, data: updatedSession });
}

export async function handleCreateSceneProxy(
  service: ContinuitySessionService,
  req: Request,
  res: Response,
  options: { sessionId: string; status?: number },
): Promise<void> {
  const parsed = CreateSceneProxySchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, req, parsed.error);
    return;
  }

  const updatedSession = await service.createSceneProxy(
    options.sessionId,
    parsed.data.sourceShotId,
    parsed.data.sourceVideoId,
  );
  res
    .status(options.status ?? 201)
    .json({ success: true, data: updatedSession });
}

export async function handlePreviewSceneProxy(
  service: ContinuitySessionService,
  req: Request,
  res: Response,
  options: { sessionId: string; shotId: string },
): Promise<void> {
  const parsed = PreviewSceneProxySchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, req, parsed.error);
    return;
  }

  const shot = await service.previewSceneProxy(
    options.sessionId,
    options.shotId,
    parsed.data.camera,
  );
  res.json({ success: true, data: shot });
}
