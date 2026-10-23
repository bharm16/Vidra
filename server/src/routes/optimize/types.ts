import type { PromptOptimizationService } from "@services/prompt-optimization/PromptOptimizationService";

export type PromptOptimizationServiceContract = Pick<
  PromptOptimizationService,
  "optimize" | "compilePrompt"
>;

export interface OptimizeServices {
  promptOptimizationService: PromptOptimizationServiceContract;
  /** A generation profile's wording guidance, bound at registration. */
  wordingGuidance?: (profileId: string) => string | undefined;
}
