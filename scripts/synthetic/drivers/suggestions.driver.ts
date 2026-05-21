/**
 * Emits one `suggestions.completed` event per (prompt, highlight) pair
 * by invoking the live EnhancementV2Engine. Underlying `llm.call.completed`
 * events are emitted by the AIModelService telemetry hook — no fake records.
 *
 * Highlights are read directly from each fixture (validated at startup
 * against shared/taxonomy.ts) — no derivation. See
 * docs/superpowers/specs/2026-05-14-baseline-quality-improvement-design.md
 * for the Layer 5 false-signal context.
 */

import { EnhancementV2Engine } from "../../../server/src/services/enhancement/v2/EnhancementV2Engine.js";
import type {
  EnhancementV2RequestContext,
  EnhancementV2Execution,
} from "../../../server/src/services/enhancement/v2/types.js";
import { VideoPromptService } from "../../../server/src/services/video-prompt-analysis/index.js";
import { AIServiceVideoPromptLlmGateway } from "../../../server/src/services/video-prompt-analysis/services/llm/VideoPromptLlmGateway.js";
import { SuggestionDiversityEnforcer } from "../../../server/src/services/enhancement/services/SuggestionDeduplicator.js";
import type { AIModelService } from "../../../server/src/services/ai-model/index.js";
import type { SuggestionsTelemetryService } from "../../../server/src/services/observability/SuggestionsTelemetryService.js";
import { validateSuggestionsFixtures } from "../utils/fixture-validation.js";
import {
  runInSyntheticContext,
  syntheticDistinctId,
  type DriverSummary,
  type HarnessPrompt,
} from "../utils/request-helper.js";

interface DriverDeps {
  suggestions: SuggestionsTelemetryService;
  aiService: AIModelService;
  variantTag: string | null;
}

const POLICY_VERSION = "2026-03-v2a";

function buildContext(
  prompt: HarnessPrompt,
  highlightedText: string,
  highlightedCategory: string,
): EnhancementV2RequestContext {
  const idx = prompt.text.indexOf(highlightedText);
  const contextBefore = idx > 0 ? prompt.text.slice(0, idx) : "";
  const contextAfter =
    idx >= 0 ? prompt.text.slice(idx + highlightedText.length) : "";

  return {
    highlightedText,
    contextBefore,
    contextAfter,
    fullPrompt: prompt.text,
    originalUserPrompt: prompt.text,
    brainstormContext: null,
    highlightedCategory,
    highlightedCategoryConfidence: 1,
    isPlaceholder: false,
    isVideoPrompt: true,
    phraseRole: highlightedCategory,
    highlightWordCount: highlightedText.split(/\s+/).length,
    videoConstraints: null,
    modelTarget: null,
    promptSection: null,
    spanAnchors: "",
    nearbySpanHints: "",
    lockedSpanCategories: [],
    debug: false,
  };
}

export async function driveSuggestions(
  deps: DriverDeps,
  prompts: HarnessPrompt[],
): Promise<DriverSummary> {
  validateSuggestionsFixtures(prompts);

  const distinctId = syntheticDistinctId();
  let surfaceEvents = 0;

  const videoPromptService = new VideoPromptService({
    videoPromptLlmGateway: new AIServiceVideoPromptLlmGateway(deps.aiService),
  });
  const diversityEnforcer = new SuggestionDiversityEnforcer(deps.aiService);
  const v2Engine = new EnhancementV2Engine({
    aiService: deps.aiService,
    videoPromptService,
    diversityEnforcer,
    policyVersion: POLICY_VERSION,
  });

  for (const prompt of prompts) {
    for (let h = 0; h < prompt.highlights.length; h++) {
      const highlight = prompt.highlights[h]!;
      const requestId = `synthetic-suggestions-${prompt.id}-h${h}`;

      await runInSyntheticContext(requestId, async () => {
        const trace = deps.suggestions.startSuggestionsTrace(
          requestId,
          distinctId,
        );
        const context = buildContext(
          prompt,
          highlight.text,
          highlight.category,
        );

        try {
          const execution: EnhancementV2Execution =
            await v2Engine.execute(context);
          const suggestionTexts = execution.finalSuggestions.map((s) => s.text);

          trace.complete({
            outcome: "success",
            promptLength: prompt.text.length,
            suggestionCount: suggestionTexts.length,
            highlightedCategory: highlight.category,
            isVideoPrompt: true,
            isPlaceholder: false,
            modelTarget: null,
            promptSection: null,
            phraseRole: highlight.category,
            policyVersion: POLICY_VERSION,
            categoryId: execution.debug.categoryId,
            engineMode: execution.debug.mode,
            modelCallCount: execution.debug.modelCallCount,
            fallbackApplied: false,
            debug: false,
            highlightedText: highlight.text,
            fullPrompt: prompt.text,
            suggestions: suggestionTexts,
            sceneSummary: execution.debug.sceneSummary ?? null,
            modelVariant: deps.variantTag,
          });
          surfaceEvents++;
          const dbg = execution.debug;
          console.log(
            `[suggestions] ${prompt.id}/h${h} "${highlight.text}" (cat=${dbg.categoryId} mode=${dbg.mode}) → ${suggestionTexts.length} suggestions | stages=${JSON.stringify(dbg.stageCounts)} rejects=${JSON.stringify(dbg.rejectionSummary)}`,
          );
        } catch (err) {
          trace.complete({
            outcome: "error",
            promptLength: prompt.text.length,
            suggestionCount: 0,
            highlightedCategory: highlight.category,
            isVideoPrompt: true,
            isPlaceholder: false,
            modelTarget: null,
            promptSection: null,
            phraseRole: highlight.category,
            policyVersion: POLICY_VERSION,
            categoryId: null,
            engineMode: null,
            modelCallCount: 0,
            fallbackApplied: false,
            debug: false,
            highlightedText: highlight.text,
            fullPrompt: prompt.text,
            suggestions: [],
            modelVariant: deps.variantTag,
          });
          console.warn(
            `[suggestions] ${prompt.id}/h${h} errored: ${(err as Error).message}`,
          );
        }
      });
    }
  }

  return {
    surface: "suggestions",
    promptCount: prompts.length,
    surfaceEventsEmitted: surfaceEvents,
    llmEventsEmitted: 0,
  };
}
