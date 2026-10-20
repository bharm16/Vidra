import type { PromptOptimizationService } from "@services/prompt-optimization/PromptOptimizationService";

export type PromptOptimizationServiceContract = Pick<
  PromptOptimizationService,
  "optimize" | "compilePrompt"
>;

export interface OptimizeServices {
  promptOptimizationService: PromptOptimizationServiceContract;
}
