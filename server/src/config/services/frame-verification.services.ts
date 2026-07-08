import type { DIContainer } from "@infrastructure/DIContainer";
import type { AIModelService } from "@services/ai-model/AIModelService";
import { FrameVerificationService } from "@services/frame-verification/FrameVerificationService";
import { SpanVerdictService } from "@services/frame-verification/services/SpanVerdictService";

export function registerFrameVerificationServices(
  container: DIContainer,
): void {
  container.register(
    "frameVerificationService",
    (aiService: AIModelService) =>
      new FrameVerificationService(new SpanVerdictService(aiService)),
    ["aiService"],
  );
}
