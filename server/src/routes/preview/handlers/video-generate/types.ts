import type { ILogger } from "@interfaces/ILogger";
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
  | "keyframeService"
  | "faceSwapService"
  | "assetService"
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

export interface VideoCreditLedger {
  videoCost: number;
  keyframeCost: number;
  faceSwapCost: number;
}

export interface RefundManager {
  ledger: VideoCreditLedger;
  setVideoCost(amount: number): void;
  setKeyframeCost(amount: number): void;
  setFaceSwapCost(amount: number): void;
  refundVideoCredits(reason: string): Promise<void>;
  refundKeyframeCredits(reason: string): Promise<void>;
  refundFaceSwapCredits(reason: string): Promise<void>;
}

export interface TriggerResolutionSuccess {
  cleanedPrompt: string;
  characterAssetId?: string;
  resolvedAssetCount: number;
  resolvedCharacterCount: number;
  promptExpandedFromTrigger: boolean;
}

export interface TriggerResolutionArgs {
  cleanedPrompt: string;
  hasPromptTriggers: boolean;
  uniquePromptTriggerCount: number;
  userId: string;
  requestId?: string | undefined;
  characterAssetId?: string | undefined;
  assetService: VideoGenerateServices["assetService"];
  log: ILogger;
}

export interface PreprocessingArgs {
  requestId?: string | undefined;
  userId: string;
  startImage?: string | undefined;
  characterAssetId?: string | undefined;
  autoKeyframe: boolean;
  faceSwapAlreadyApplied: boolean;
  aspectRatio?: string | undefined;
  cleanedPrompt: string;
  services: {
    userCreditService: NonNullable<VideoGenerateServices["userCreditService"]>;
    keyframeService: VideoGenerateServices["keyframeService"];
    faceSwapService: VideoGenerateServices["faceSwapService"];
    assetService: VideoGenerateServices["assetService"];
  };
  refunds: RefundManager;
  log: ILogger;
}

export interface PreprocessingResult {
  resolvedStartImage?: string | undefined;
  generatedKeyframeUrl: string | null;
  swappedImageUrl: string | null;
  characterAssetId?: string | undefined;
  error?: VideoErrorResult;
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
