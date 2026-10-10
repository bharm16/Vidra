import type { PreviewRoutesServices } from "@routes/types";
import type { VideoGenerationOptions } from "@services/video-generation/types";
import type { ApiErrorCode } from "@shared/types/api";
import type { MotionContext } from "./motion";

export type VideoGenerateServices = Pick<
  PreviewRoutesServices,
  | "videoGenerationService"
  | "videoJobStore"
  | "userCreditService"
  | "storageService"
  | "requestIdempotencyService"
  | "sessionService"
>;

export interface VideoErrorPayload {
  error: string;
  code: ApiErrorCode;
  details?: string;
}

export interface VideoErrorResult {
  status: number;
  payload: VideoErrorPayload;
}

export interface VideoRequestPlan {
  normalizedParams: Record<string, unknown> | null;
  motionContext: MotionContext;
  normalizedMotionMeta: {
    hasCameraMotion: boolean;
    cameraMotionId: string | null;
    hasSubjectMotion: boolean;
    subjectMotionLength: number;
  };
  options: VideoGenerationOptions;
  videoCost: number;
}

export interface VideoRequestPlanArgs {
  generationParams: unknown;
  model?: string | undefined;
  operation: string;
  requestId: string;
  userId: string;
  costModel?: string | undefined;
  cleanedPrompt: string;
  resolvedStartImage?: string | undefined;
  inputReference?: string | undefined;
  endImage?: string | undefined;
  referenceImages?: Array<{ url: string; type: "asset" | "style" }> | undefined;
  extendVideoUrl?: string | undefined;
  aspectRatio?: string | undefined;
  characterAssetId?: string | undefined;
  faceSwapAlreadyApplied: boolean;
  swappedImageUrl: string | null;
}
