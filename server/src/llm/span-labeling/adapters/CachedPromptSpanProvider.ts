import { labelSpans } from "../SpanLabelingService";
import { computeCachedSpans } from "../spanCache";
import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import type { SpanLabelingCacheService } from "@services/cache/SpanLabelingCacheService";
import type { PromptSpanProvider } from "../ports/PromptSpanProvider";
import type { LLMSpan, LabelSpansParams, LabelSpansResult } from "../types";

/**
 * Production adapter for the PromptSpanProvider port.
 *
 * Wraps `labelSpans` and consults `SpanLabelingCacheService.getOrCompute` so
 * the underlying LLM call is single-flight coalesced and cached. Falls back
 * to a direct `labelSpans` invocation when no cache is configured.
 */
export class CachedPromptSpanProvider implements PromptSpanProvider {
  constructor(
    private readonly aiService: AIExecutionPort,
    private readonly cache: SpanLabelingCacheService | null,
  ) {}

  async label(
    prompt: string,
    options: Omit<LabelSpansParams, "text"> = {},
  ): Promise<LLMSpan[]> {
    const result = await this.labelFull(prompt, options);
    return Array.isArray(result.spans) ? result.spans : [];
  }

  async labelFull(
    prompt: string,
    options: Omit<LabelSpansParams, "text"> = {},
  ): Promise<LabelSpansResult> {
    const params: LabelSpansParams = { text: prompt, ...options };

    if (!this.cache) {
      return labelSpans(params, this.aiService);
    }

    const { result } = await computeCachedSpans({
      cache: this.cache,
      aiService: this.aiService,
      text: prompt,
      policy: options.policy ?? null,
      templateVersion: options.templateVersion ?? null,
      compute: () => labelSpans(params, this.aiService),
    });

    return result;
  }
}
