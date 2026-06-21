import type { DIContainer } from "@infrastructure/DIContainer";
import type { PromptSpanProvider } from "@llm/span-labeling/ports/PromptSpanProvider";
import type { AIModelService } from "@services/ai-model/AIModelService";
import { ModelIntelligenceService } from "@services/model-intelligence/ModelIntelligenceService";
import { AvailabilityGateService } from "@services/model-intelligence/services/AvailabilityGateService";
import { AIServiceRequirementsClassifier } from "@services/model-intelligence/services/RequirementsClassifier";
import type { VideoGenerationService } from "@services/video-generation/VideoGenerationService";
import type { UserCreditService } from "@services/credits/UserCreditService";
import type { BillingProfileStore } from "@services/payment/BillingProfileStore";

export function registerModelIntelligenceServices(
  container: DIContainer,
): void {
  container.register(
    "modelIntelligenceAvailabilityGate",
    (
      videoGenerationService: VideoGenerationService | null,
      creditService: UserCreditService,
      billingProfileStore: BillingProfileStore,
    ) =>
      new AvailabilityGateService(
        videoGenerationService,
        creditService,
        billingProfileStore,
      ),
    ["videoGenerationService", "userCreditService", "billingProfileStore"],
  );

  container.register(
    "modelIntelligenceService",
    (
      promptSpanProvider: PromptSpanProvider,
      availabilityGate: AvailabilityGateService,
      aiService: AIModelService,
    ) =>
      new ModelIntelligenceService({
        promptSpanProvider,
        availabilityGate,
        requirementsClassifier: new AIServiceRequirementsClassifier(aiService),
      }),
    ["spanLabelingProvider", "modelIntelligenceAvailabilityGate", "aiService"],
  );
}
