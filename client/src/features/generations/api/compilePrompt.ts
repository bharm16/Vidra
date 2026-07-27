import { promptOptimizationApiV2 } from "@/services";
import { logger } from "@/services/LoggingService";
import { sanitizeError } from "@/utils/logging";

const log = logger.child("compilePrompt");
const OPERATION = "compileWanPrompt";

/**
 * Client deadline for one compile.
 *
 * Derived from the server's own budget, not guessed: a compile runs two
 * sequential Gemini calls (`VideoPromptAnalyzer.analyze`, then
 * `VideoPromptLLMRewriter.rewrite` — see BaseStrategy.transform). Their
 * configured LLM timeouts are `video_prompt_ir_extraction` 30_000ms and
 * `video_prompt_rewrite` 45_000ms (server/src/config/modelConfig.ts), so the
 * worst-case provider budget is 75_000ms. The remaining 15_000ms covers auth,
 * transfer and the server-side work around the two calls. Stays below the
 * server's 125s keep-alive timeout (server/src/server.ts).
 */
export const COMPILE_TIMEOUT_MS = 90_000;

export async function compileWanPrompt(
  prompt: string,
  signal: AbortSignal,
): Promise<string> {
  let compiledPrompt = prompt.trim();
  const compileAbortController = new AbortController();
  const abortCompile = () => compileAbortController.abort();
  const startedAt = Date.now();
  let deadlineExceeded = false;
  const timeoutId = window.setTimeout(() => {
    deadlineExceeded = true;
    compileAbortController.abort();
  }, COMPILE_TIMEOUT_MS);
  signal.addEventListener("abort", abortCompile, { once: true });
  try {
    const compiled = await promptOptimizationApiV2.compilePrompt({
      prompt: compiledPrompt,
      targetModel: "wan",
      signal: compileAbortController.signal,
    });
    if (!compileAbortController.signal.aborted) {
      const trimmed = compiled?.compiledPrompt?.trim();
      if (trimmed) compiledPrompt = trimmed;
    }
  } catch (error) {
    // Best-effort compile: the caller still gets a usable prompt. It is not
    // best-effort silent, though — an unreported failure here is a dead motion
    // step that looks like a successful no-op.
    const info = sanitizeError(error);
    const errObj = error instanceof Error ? error : new Error(info.message);
    const meta = {
      operation: OPERATION,
      durationMs: Date.now() - startedAt,
      deadlineMs: COMPILE_TIMEOUT_MS,
      promptLength: compiledPrompt.length,
    };

    if (signal.aborted) {
      // Caller cancelled — expected, not a failure.
      log.debug("Compile cancelled by caller", meta);
    } else if (deadlineExceeded) {
      log.error(
        "Compile exceeded its deadline; falling back to the raw prompt",
        errObj,
        meta,
      );
    } else {
      log.error("Compile failed; falling back to the raw prompt", errObj, meta);
    }
  } finally {
    window.clearTimeout(timeoutId);
    signal.removeEventListener("abort", abortCompile);
  }
  return compiledPrompt;
}
