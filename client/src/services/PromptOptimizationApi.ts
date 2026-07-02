/**
 * PromptOptimizationApi - JSON-based prompt optimization service.
 */

import { ApiClient } from "./ApiClient";
import { trackPromptOptimize } from "./analytics";
import { calculateQualityScore as scorePromptQuality } from "./prompt-optimization/qualityScore";
import {
  buildOfflineResult,
  shouldUseOfflineFallback,
} from "./prompt-optimization/offlineFallback";
import {
  CompileResponseSchema,
  OptimizeResponseSchema,
} from "./prompt-optimization/types";
import type {
  CompileOptions,
  CompileResult,
  OptimizeOptions,
  OptimizeResult,
} from "./prompt-optimization/types";

export class PromptOptimizationApi {
  constructor(private readonly client: ApiClient) {}

  async optimize({
    prompt,
    mode,
    targetModel,
    context = null,
    brainstormContext = null,
    generationParams,
    skipCache,
    lockedSpans,
    startImage,
    sourcePrompt,
    signal,
  }: OptimizeOptions): Promise<OptimizeResult> {
    try {
      const requestOptions = signal ? { signal } : {};
      trackPromptOptimize(mode);
      const raw = await this.client.post(
        "/optimize",
        {
          prompt,
          mode,
          ...(targetModel ? { targetModel } : {}),
          context,
          brainstormContext,
          ...(generationParams ? { generationParams } : {}),
          ...(skipCache ? { skipCache } : {}),
          ...(lockedSpans && lockedSpans.length > 0 ? { lockedSpans } : {}),
          ...(startImage ? { startImage } : {}),
          ...(sourcePrompt ? { sourcePrompt } : {}),
        },
        requestOptions,
      );
      // Canonical envelope: non-2xx responses surface as thrown ApiErrors,
      // so the parsed body is always the success shape — unwrap `data`.
      return OptimizeResponseSchema.parse(raw).data as OptimizeResult;
    } catch (error) {
      if (shouldUseOfflineFallback(error)) {
        return buildOfflineResult(
          { prompt, mode, context, brainstormContext },
          error,
        );
      }

      throw error;
    }
  }

  async compilePrompt({
    prompt,
    artifactKey,
    targetModel,
    context = null,
    signal,
  }: CompileOptions): Promise<CompileResult> {
    const requestOptions = signal ? { signal } : {};
    const raw = await this.client.post(
      "/optimize-compile",
      {
        ...(prompt ? { prompt } : {}),
        ...(artifactKey ? { artifactKey } : {}),
        targetModel,
        ...(context ? { context } : {}),
      },
      requestOptions,
    );
    return CompileResponseSchema.parse(raw).data as CompileResult;
  }

  calculateQualityScore(inputPrompt: string, outputPrompt: string): number {
    return scorePromptQuality(inputPrompt, outputPrompt);
  }
}

import { apiClient } from "./ApiClient";
export const promptOptimizationApiV2 = new PromptOptimizationApi(apiClient);
