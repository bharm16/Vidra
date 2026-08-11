import { throwIfAborted } from "./abort";
import { applyIntentLockPolicy } from "../services/intentLockPolicy";
import { finishPrompt } from "../services/finishPrompt";
import type { CompilationState, OptimizationResponse } from "../types";
import type { MetadataMap, OptimizeFlowArgs } from "./types";

const compileSkipped = (
  sourceKind: CompilationState["sourceKind"],
): CompilationState => ({
  status: "compile-skipped",
  usedFallback: false,
  sourceKind,
  structuredArtifactReused: false,
  analyzerBypassed: false,
  compiledFor: null,
});

export const runOptimizeFlow = async ({
  request,
  log,
  optimizationCache,
  shotInterpreter,
  strategy,
  compilationService,
  applyConstitutionalAI,
  logOptimizationMetrics,
  intentLock,
  promptLint,
  telemetry: t,
}: OptimizeFlowArgs): Promise<OptimizationResponse> => {
  const startTime = performance.now();
  const operation = "optimize";

  const {
    prompt,
    mode = "video",
    context = null,
    brainstormContext = null,
    generationParams = null,
    skipCache = false,
    lockedSpans = [],
    shotPlan = null,
    shotPlanAttempted = false,
    useConstitutionalAI = false,
    signal,
    targetModel,
  } = request;

  const inputSummary = {
    promptLength: prompt.length,
    lockedSpanCount: lockedSpans.length,
    targetModel: targetModel ?? null,
    mode: mode as "video",
    hasContext: !!context,
    hasBrainstormContext: !!brainstormContext,
    hasShotPlan: !!shotPlan,
    useConstitutionalAI: !!useConstitutionalAI,
    inputPrompt: prompt,
  };

  const originalUserPrompt =
    typeof brainstormContext?.originalUserPrompt === "string" &&
    brainstormContext.originalUserPrompt.trim().length > 0
      ? brainstormContext.originalUserPrompt.trim()
      : prompt;

  log.debug("Starting operation.", {
    operation,
    mode,
    promptLength: prompt.length,
    hasContext: !!context,
    hasBrainstormContext: !!brainstormContext,
    hasGenerationParams: !!generationParams,
    hasShotPlan: !!shotPlan,
    shotPlanAttempted,
    useConstitutionalAI,
    skipCache,
    lockedSpanCount: lockedSpans.length,
  });

  throwIfAborted(signal);

  const cacheKey = optimizationCache.buildCacheKey(
    prompt,
    mode,
    context,
    brainstormContext,
    targetModel,
    generationParams,
    lockedSpans,
  );

  /**
   * Single exit for a successful optimization: cache the response as one
   * record, log, and close the trace. Both branches below route through it, so
   * neither can forget a step the other does.
   */
  const complete = (response: OptimizationResponse): OptimizationResponse => {
    void optimizationCache.cacheOutcome(cacheKey, response).catch((err) => {
      // Stable event tag — alerting hooks off this so operators retain the
      // back-pressure signal that the previous awaited write produced.
      log.warn("Failed to write optimization result to cache", {
        event: "optimization_cache_write_failed",
        operation,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    logOptimizationMetrics(prompt, response.prompt, mode);

    log.info("Operation completed.", {
      operation,
      duration: Math.round(performance.now() - startTime),
      mode,
      inputLength: prompt.length,
      outputLength: response.prompt.length,
      useConstitutionalAI,
      intentLockPassed: response.quality.intentLock.passed,
      promptLintOk: response.quality.lint.ok,
    });

    t.complete({
      outcome: "success",
      outputLength: response.prompt.length,
      outputPrompt: response.prompt,
      intentLockPassed: response.quality.intentLock.passed,
      intentLockRepaired: response.quality.intentLock.repaired,
      promptLintOk: response.quality.lint.ok,
      promptLintOverBudget: Boolean(response.quality.lint.overBudget),
      ...(response.previewPrompt
        ? { previewPrompt: response.previewPrompt }
        : {}),
      ...inputSummary,
    });

    return response;
  };

  if (!skipCache) {
    // One record, so a hit returns exactly the shape a miss would.
    const cached = await optimizationCache.getCachedOutcome(cacheKey);
    if (cached) {
      log.debug("Returning cached optimization result", {
        operation,
        mode,
        duration: Math.round(performance.now() - startTime),
      });
      t.recordCacheHit();
      t.complete({
        outcome: "success",
        outputLength: cached.prompt.length,
        outputPrompt: cached.prompt,
        intentLockPassed: cached.quality.intentLock.passed,
        intentLockRepaired: cached.quality.intentLock.repaired,
        promptLintOk: cached.quality.lint.ok,
        promptLintOverBudget: Boolean(cached.quality.lint.overBudget),
        ...(cached.previewPrompt
          ? { previewPrompt: cached.previewPrompt }
          : {}),
        ...inputSummary,
      });
      return cached;
    }
  } else {
    log.debug("Skipping optimization cache", { operation, mode });
  }

  let interpretedShotPlan = shotPlan;
  if (!interpretedShotPlan && !shotPlanAttempted) {
    const shotStart = performance.now();
    try {
      throwIfAborted(signal);
      interpretedShotPlan = await shotInterpreter.interpret(prompt, signal);
      t.recordLlmCall();
    } catch (interpError) {
      log.warn(
        "Shot interpretation (single-stage) failed, proceeding without plan",
        {
          operation,
          error: (interpError as Error).message,
        },
      );
    } finally {
      t.recordStage("shot_interpreter", performance.now() - shotStart);
    }
  }

  try {
    // -----------------------------------------------------------------------
    // Step 1: Structured optimization, rendered to the generic prompt
    // -----------------------------------------------------------------------
    const strategyRequest = {
      prompt,
      context,
      brainstormContext,
      generationParams,
      shotPlan: interpretedShotPlan,
      lockedSpans,
      ...(signal ? { signal } : {}),
    };

    const strategyStart = performance.now();
    let structuredArtifact;
    let optimizedPrompt: string;
    try {
      structuredArtifact = await strategy.optimizeStructured(strategyRequest);
      t.recordLlmCall();
      optimizedPrompt = strategy.renderStructuredPrompt(
        structuredArtifact.structuredPrompt,
      );
    } catch (err) {
      t.recordError("strategy", err);
      throw err;
    } finally {
      t.recordStage("strategy", performance.now() - strategyStart);
    }

    const artifactKey = optimizationCache.buildStructuredArtifactKeyFromInputs({
      prompt,
      sourcePrompt: structuredArtifact.sourcePrompt,
      shotPlan: interpretedShotPlan,
      generationParams,
      lockedSpans,
    });
    await optimizationCache.cacheStructuredArtifact(
      artifactKey,
      structuredArtifact,
    );

    if (useConstitutionalAI) {
      const constitutionalStart = performance.now();
      try {
        optimizedPrompt = await applyConstitutionalAI(
          optimizedPrompt,
          mode,
          signal,
        );
        t.recordLlmCall();
      } catch (err) {
        t.recordError("constitutional", err);
        throw err;
      } finally {
        t.recordStage(
          "constitutional",
          performance.now() - constitutionalStart,
        );
      }
    }

    // -----------------------------------------------------------------------
    // Step 2: No target model — finish here (intent repair, then lint)
    // -----------------------------------------------------------------------
    if (!targetModel || !compilationService) {
      const intentStart = performance.now();
      const finished = finishPrompt({
        prompt: optimizedPrompt,
        originalPrompt: originalUserPrompt,
        shotPlan: interpretedShotPlan,
        phase: "generic",
        modelId: null,
        intentLock,
        promptLint,
      });
      t.recordStage("intent_lock", performance.now() - intentStart);

      const response: OptimizationResponse = {
        prompt: finished.prompt,
        previewPrompt: structuredArtifact.previewPrompt,
        ...(structuredArtifact.aspectRatio
          ? { aspectRatio: structuredArtifact.aspectRatio }
          : {}),
        genericPrompt: finished.prompt,
        artifactKey,
        compilation: compileSkipped("artifact"),
        quality: finished.quality,
      };

      return complete(response);
    }

    // -----------------------------------------------------------------------
    // Step 3: Intent lock the generic prompt BEFORE compiling, so compilation
    // receives intent-correct input, then compile for the target model.
    //
    // The intent policy is called directly rather than through finishPrompt
    // because this is not the finish: linting here would measure the generic
    // prompt against the target model's word budget, and compilation is about to
    // rewrite it anyway. Step 4 finishes what compilation produces.
    // -----------------------------------------------------------------------
    const intentStart = performance.now();
    const genericIntent = applyIntentLockPolicy({
      intentLock,
      originalPrompt: originalUserPrompt,
      optimizedPrompt,
      shotPlan: interpretedShotPlan,
      phase: "generic",
    });
    t.recordStage("intent_lock", performance.now() - intentStart);
    const genericPrompt = genericIntent.prompt;

    let compiled: {
      prompt: string;
      metadata: MetadataMap | null;
      compilation: CompilationState;
      artifactKey?: string;
    };
    const compilationStart = performance.now();
    try {
      compiled = await compilationService.compile({
        operation,
        targetModel,
        source: { kind: "artifact", artifact: structuredArtifact },
        fallbackPrompt: genericPrompt,
        artifactKey,
      });
      t.recordLlmCall();
    } catch (err) {
      t.recordError("compilation", err);
      throw err;
    } finally {
      t.recordStage("compilation", performance.now() - compilationStart);
    }

    // -----------------------------------------------------------------------
    // Step 4: Finish the compiled prompt — validate-only intent (a repair here
    // would flatten model-specific structure), then lint.
    // -----------------------------------------------------------------------
    const lintStart = performance.now();
    const finished = finishPrompt({
      prompt: compiled.prompt,
      originalPrompt: originalUserPrompt,
      shotPlan: interpretedShotPlan,
      phase: "post-compile",
      modelId: targetModel,
      intentLock,
      promptLint,
      compilation: compiled.compilation,
    });
    t.recordStage("prompt_lint", performance.now() - lintStart);

    if (!finished.quality.intentLock.passed) {
      log.warn("Post-compilation intent validation failed (not repaired)", {
        operation,
        targetModel,
        required: finished.quality.intentLock.required,
      });
    }

    const response: OptimizationResponse = {
      prompt: finished.prompt,
      previewPrompt: structuredArtifact.previewPrompt,
      ...(structuredArtifact.aspectRatio
        ? { aspectRatio: structuredArtifact.aspectRatio }
        : {}),
      genericPrompt,
      artifactKey: compiled.artifactKey ?? artifactKey,
      ...(finished.compilation ? { compilation: finished.compilation } : {}),
      quality: finished.quality,
      ...(compiled.metadata ? { metadata: compiled.metadata } : {}),
    };

    return complete(response);
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      t.complete({
        outcome: "aborted",
        outputLength: 0,
        outputPrompt: null,
        ...inputSummary,
      });
      log.info("Operation aborted.", {
        operation,
        duration: Math.round(performance.now() - startTime),
        mode,
      });
      throw error;
    }
    t.complete({
      outcome: "error",
      outputLength: 0,
      outputPrompt: null,
      ...inputSummary,
    });
    log.error("Operation failed.", error as Error, {
      operation,
      duration: Math.round(performance.now() - startTime),
      mode,
      promptLength: prompt.length,
    });
    throw error;
  }
};
