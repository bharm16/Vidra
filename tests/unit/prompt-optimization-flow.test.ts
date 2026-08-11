import { beforeEach, describe, expect, it, vi } from "vitest";

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
} from "@hooks/utils/promptOptimizationFlow";

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

function createMockToast() {
  return { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
}

function createMockLog() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe("runOptimization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("propagates optimize errors", async () => {
    const analyzeAndOptimize = vi.fn().mockRejectedValue(new Error("API down"));

    await expect(
      runOptimization({
        promptToOptimize: "test prompt",
        selectedMode: "video",
        context: null,
        brainstormContext: null,
        abortController: new AbortController(),
        actions: createMockActions(),
        toast: createMockToast(),
        log: createMockLog() as never,
        analyzeAndOptimize,
        calculateQualityScore: vi.fn(),
      }),
    ).rejects.toThrow("API down");
  });

  it("commits the final prompt, metadata, and result version", async () => {
    const actions = createMockActions();
    const analyzeAndOptimize = vi.fn().mockResolvedValue({
      prompt: "optimized prompt",
      artifactKey: "artifact-123",
      genericPrompt: "generic prompt",
      previewPrompt: "preview prompt",
      aspectRatio: "16:9",
    });

    const result = await runOptimization({
      promptToOptimize: "source prompt",
      selectedMode: "video",
      selectedModel: "sora-2",
      context: { tone: "cinematic" },
      brainstormContext: { notes: "keep motion" },
      abortController: new AbortController(),
      skipCache: true,
      actions,
      toast: createMockToast(),
      log: createMockLog() as never,
      analyzeAndOptimize,
      calculateQualityScore: vi.fn().mockReturnValue(88),
    });

    expect(analyzeAndOptimize).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "source prompt",
        targetModel: "sora-2",
        skipCache: true,
      }),
    );
    expect(actions.setOptimizedPrompt).toHaveBeenCalledWith("optimized prompt");
    expect(actions.setDisplayedPrompt).toHaveBeenCalledWith("optimized prompt");
    expect(actions.setGenericOptimizedPrompt).toHaveBeenCalledWith(
      "generic prompt",
    );
    expect(actions.setArtifactKey).toHaveBeenCalledWith("artifact-123");
    expect(actions.setPreviewPrompt).toHaveBeenCalledWith("preview prompt");
    expect(actions.setPreviewAspectRatio).toHaveBeenCalledWith("16:9");
    expect(actions.setQualityScore).toHaveBeenCalledWith(88);
    expect(actions.bumpOptimizationResultVersion).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ optimized: "optimized prompt", score: 88 });
  });

  it("records a low score without speaking in the creator loop", async () => {
    // ADR-0008 decision 3: the frozen quality stack never toasts here —
    // the score is computed and persisted, silently.
    const toast = createMockToast();
    const actions = createMockActions();

    await runOptimization({
      promptToOptimize: "source prompt",
      selectedMode: "video",
      context: null,
      brainstormContext: null,
      abortController: new AbortController(),
      actions,
      toast,
      log: createMockLog() as never,
      analyzeAndOptimize: vi.fn().mockResolvedValue({
        prompt: "optimized prompt",
      }),
      calculateQualityScore: vi.fn().mockReturnValue(45),
    });

    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
    expect(actions.setQualityScore).toHaveBeenCalledWith(45);
  });
});
