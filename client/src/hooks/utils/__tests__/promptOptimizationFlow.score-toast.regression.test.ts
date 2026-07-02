import { afterEach, describe, expect, it, vi } from "vitest";
import * as fc from "fast-check";

/**
 * Regression: the prompt-score toast leaves the creator loop (ADR-0008,
 * decision 3 — frozen stacks never speak in the creator loop).
 *
 * 1. Failure boundary: creator-facing toast fired from the runOptimization
 *    flow seam.
 * 2. Mock boundary: analyzeAndOptimize (the LLM API round-trip) and the
 *    toast sink. runOptimization itself runs for real.
 * 3. Invariant: for any optimization outcome in a production build
 *    (DEV=false), no quality-score toast fires — the signal is dev-only,
 *    behind the same gate as the debug chrome.
 */

vi.mock("@/services/LoggingService", () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
    startTimer: vi.fn(),
    endTimer: vi.fn(() => 42),
  },
}));

import {
  runOptimization,
  type PromptOptimizerActions,
} from "../promptOptimizationFlow";

function createMockActions(): PromptOptimizerActions {
  return {
    setOptimizedPrompt: vi.fn(),
    setDisplayedPrompt: vi.fn(),
    setGenericOptimizedPrompt: vi.fn(),
    setArtifactKey: vi.fn(),
    setQualityScore: vi.fn(),
    setPreviewPrompt: vi.fn(),
    setPreviewAspectRatio: vi.fn(),
    bumpOptimizationResultVersion: vi.fn(),
    rollback: vi.fn(),
  };
}

function createMockToast(): {
  success: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warning: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
} {
  return { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
}

function createMockLog(): Record<string, ReturnType<typeof vi.fn>> {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

async function runWithScore(
  score: number,
  toast: ReturnType<typeof createMockToast>,
): Promise<void> {
  await runOptimization({
    promptToOptimize: "source prompt",
    selectedMode: "video",
    context: null,
    brainstormContext: null,
    abortController: new AbortController(),
    actions: createMockActions(),
    toast,
    log: createMockLog() as never,
    analyzeAndOptimize: vi.fn().mockResolvedValue({
      prompt: "optimized prompt",
    }),
    calculateQualityScore: vi.fn().mockReturnValue(score),
  });
}

describe("regression: quality-score toast never fires in the creator loop (production builds)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("for any quality score, production builds surface no score toast", async () => {
    vi.stubEnv("DEV", false);

    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 100 }), async (score) => {
        const toast = createMockToast();
        await runWithScore(score, toast);
        expect(toast.success).not.toHaveBeenCalled();
        expect(toast.info).not.toHaveBeenCalled();
        expect(toast.warning).not.toHaveBeenCalled();
      }),
      { numRuns: 50 },
    );
  });

  it("dev builds keep the score signal for dogfooding (same gate as debug chrome)", async () => {
    vi.stubEnv("DEV", true);

    const toast = createMockToast();
    await runWithScore(45, toast);

    expect(toast.warning).toHaveBeenCalledWith(
      expect.stringContaining("Prompt could be improved. Score: 45%"),
    );
  });
});
