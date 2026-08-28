import { randomUUID } from "node:crypto";
import type { RouteCreditService } from "@services/credits/ports";
import { buildRefundKey, refundWithGuard } from "@services/credits/refundGuard";
import type { RefundManager } from "./types";

interface CreateVideoRefundManagerArgs {
  userCreditService: RouteCreditService;
  userId: string;
  requestId?: string | undefined;
  cleanedPrompt: string;
  model?: string | undefined;
}

export const createVideoRefundManager = ({
  userCreditService,
  userId,
  requestId,
  cleanedPrompt,
  model,
}: CreateVideoRefundManagerArgs): RefundManager => {
  const ledger = {
    videoCost: 0,
    keyframeCost: 0,
    faceSwapCost: 0,
  };
  const refundOperationToken =
    requestId ??
    buildRefundKey([
      "preview-video",
      userId,
      cleanedPrompt,
      model ?? "auto",
      Date.now(),
      randomUUID().slice(0, 8),
    ]);
  const faceSwapRefundKey = buildRefundKey([
    "preview-video",
    refundOperationToken,
    userId,
    "faceSwap",
  ]);
  const keyframeRefundKey = buildRefundKey([
    "preview-video",
    refundOperationToken,
    userId,
    "keyframe",
  ]);
  const videoRefundKey = buildRefundKey([
    "preview-video",
    refundOperationToken,
    userId,
    "video",
  ]);

  const refundFaceSwapCredits = async (reason: string): Promise<void> => {
    if (ledger.faceSwapCost <= 0) {
      return;
    }
    await refundWithGuard({
      userCreditService,
      userId,
      amount: ledger.faceSwapCost,
      refundKey: faceSwapRefundKey,
      reason,
      metadata: {
        requestId,
        route: "preview/video/generate",
      },
    });
  };

  const refundKeyframeCredits = async (reason: string): Promise<void> => {
    if (ledger.keyframeCost <= 0) {
      return;
    }
    await refundWithGuard({
      userCreditService,
      userId,
      amount: ledger.keyframeCost,
      refundKey: keyframeRefundKey,
      reason,
      metadata: {
        requestId,
        route: "preview/video/generate",
      },
    });
  };

  const refundVideoCredits = async (reason: string): Promise<void> => {
    if (ledger.videoCost <= 0) {
      return;
    }
    await refundWithGuard({
      userCreditService,
      userId,
      amount: ledger.videoCost,
      refundKey: videoRefundKey,
      reason,
      metadata: {
        requestId,
        route: "preview/video/generate",
      },
    });
  };

  return {
    ledger,
    setVideoCost: (amount: number) => {
      ledger.videoCost = amount;
    },
    setKeyframeCost: (amount: number) => {
      ledger.keyframeCost = amount;
    },
    setFaceSwapCost: (amount: number) => {
      ledger.faceSwapCost = amount;
    },
    refundVideoCredits,
    refundKeyframeCredits,
    refundFaceSwapCredits,
  };
};
