/**
 * Emits one `optimize.completed` event per prompt by invoking the live
 * PromptOptimizationService. Underlying `llm.call.completed` events emit
 * via the AIModelService telemetry hook — no fake records here.
 */

import { CacheService } from "../../../server/src/services/cache/CacheService.js";
import { ImageObservationService } from "../../../server/src/services/image-observation/ImageObservationService.js";
import { TemplateService } from "../../../server/src/services/prompt-optimization/services/TemplateService.js";
import { PromptOptimizationService } from "../../../server/src/services/prompt-optimization/PromptOptimizationService.js";
import { VideoPromptService } from "../../../server/src/services/video-prompt-analysis/index.js";
import { AIServiceVideoPromptLlmGateway } from "../../../server/src/services/video-prompt-analysis/services/llm/VideoPromptLlmGateway.js";
import type { AIModelService } from "../../../server/src/services/ai-model/index.js";
import type { OptimizeTelemetryService } from "../../../server/src/services/observability/OptimizeTelemetryService.js";
import {
  runInSyntheticContext,
  syntheticDistinctId,
  type DriverSummary,
  type HarnessPrompt,
} from "../utils/request-helper.js";

interface DriverDeps {
  optimize: OptimizeTelemetryService;
  aiService: AIModelService;
  variantTag: string | null;
}

const TARGET_MODELS = ["sora", "veo", "kling", "luma", "runway"] as const;

export async function driveOptimize(
  deps: DriverDeps,
  prompts: HarnessPrompt[],
): Promise<DriverSummary> {
  const distinctId = syntheticDistinctId();
  let surfaceEvents = 0;

  const cacheService = new CacheService({});
  const videoPromptService = new VideoPromptService({
    videoPromptLlmGateway: new AIServiceVideoPromptLlmGateway(deps.aiService),
  });
  const imageObservationService = new ImageObservationService(
    deps.aiService,
    cacheService,
  );
  const templateService = new TemplateService();
  const optimizer = new PromptOptimizationService(
    deps.aiService,
    cacheService,
    videoPromptService,
    imageObservationService,
    templateService,
  );

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i]!;
    const requestId = `synthetic-optimize-${prompt.id}`;
    const targetModel = TARGET_MODELS[i % TARGET_MODELS.length]!;

    await runInSyntheticContext(requestId, async () => {
      const trace = deps.optimize.startOptimizeTrace(requestId, distinctId);

      try {
        const response = await optimizer.optimize({
          prompt: prompt.text,
          mode: "video",
          targetModel,
          // C3 (2026-05-22): aligned with prod. The constitutional review
          // feature is dormant — no production caller sets it (see the JSDoc
          // at server/src/services/prompt-optimization/workflows/constitutional
          // Review.ts). Setting it true here made the synthetic harness
          // measure a non-production code path, diverging from what real
          // users would see. Sub-projects C/B2/D measurements all ran
          // through the constitutional-review pipeline. Fix: false to match
          // prod. If the feature is reactivated in prod (per the JSDoc's
          // "To re-enable" instructions), set this back to true to keep
          // synthetic mirroring prod.
          useConstitutionalAI: false,
        });

        const outputPrompt = response.prompt;
        trace.complete({
          outcome: "success",
          targetModel,
          mode: "video",
          promptLength: prompt.text.length,
          outputLength: outputPrompt.length,
          lockedSpanCount: 0,
          hasContext: false,
          hasBrainstormContext: false,
          hasShotPlan: false,
          useConstitutionalAI: false,
          inputPrompt: prompt.text,
          outputPrompt,
          modelVariant: deps.variantTag,
        });
        surfaceEvents++;
        console.log(
          `[optimize] ${prompt.id} (target=${targetModel}) emitted (${outputPrompt.length} chars)`,
        );
      } catch (err) {
        trace.complete({
          outcome: "error",
          targetModel,
          mode: "video",
          promptLength: prompt.text.length,
          outputLength: 0,
          lockedSpanCount: 0,
          hasContext: false,
          hasBrainstormContext: false,
          hasShotPlan: false,
          useConstitutionalAI: false,
          inputPrompt: prompt.text,
          outputPrompt: "",
          modelVariant: deps.variantTag,
        });
        console.warn(
          `[optimize] ${prompt.id} errored: ${(err as Error).message}`,
        );
      }
    });
  }

  return {
    surface: "optimize",
    promptCount: prompts.length,
    surfaceEventsEmitted: surfaceEvents,
    llmEventsEmitted: 0,
  };
}
