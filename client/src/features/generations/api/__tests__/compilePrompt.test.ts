import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { compileWanPrompt, COMPILE_TIMEOUT_MS } from "../compilePrompt";
import { promptOptimizationApiV2 } from "@/services";
import type { CompileResult } from "@/services/prompt-optimization/types";

vi.mock("@/services", () => ({
  promptOptimizationApiV2: {
    compilePrompt: vi.fn(),
  },
}));

const mockCompileResult = (
  overrides: Partial<CompileResult> = {},
): CompileResult => ({
  compiledPrompt: "default compiled prompt",
  ...overrides,
});

describe("compileWanPrompt", () => {
  let abortController: AbortController;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    abortController = new AbortController();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("error handling", () => {
    it("returns original trimmed prompt when API call fails", async () => {
      vi.mocked(promptOptimizationApiV2.compilePrompt).mockRejectedValue(
        new Error("API error"),
      );

      const resultPromise = compileWanPrompt(
        "  my prompt  ",
        abortController.signal,
      );
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe("my prompt");
    });

    it("returns original prompt when timeout fires before API responds", async () => {
      // Mock that properly respects abort signal
      vi.mocked(promptOptimizationApiV2.compilePrompt).mockImplementation(
        ({ signal }) =>
          new Promise((_, reject) => {
            signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      );

      const resultPromise = compileWanPrompt(
        "original prompt",
        abortController.signal,
      );

      // Advance timer past the compile deadline
      await vi.advanceTimersByTimeAsync(COMPILE_TIMEOUT_MS + 1);

      const result = await resultPromise;
      expect(result).toBe("original prompt");
    });

    it("returns original prompt when external abort signal is triggered", async () => {
      // Mock that properly respects abort signal
      vi.mocked(promptOptimizationApiV2.compilePrompt).mockImplementation(
        ({ signal }) =>
          new Promise((_, reject) => {
            signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      );

      const resultPromise = compileWanPrompt(
        "original prompt",
        abortController.signal,
      );

      // Abort externally
      abortController.abort();
      await vi.runAllTimersAsync();

      const result = await resultPromise;
      expect(result).toBe("original prompt");
    });
  });

  describe("edge cases", () => {
    it("returns original when compiled result is empty string", async () => {
      vi.mocked(promptOptimizationApiV2.compilePrompt).mockResolvedValue(
        mockCompileResult({ compiledPrompt: "   " }),
      );

      const resultPromise = compileWanPrompt(
        "original",
        abortController.signal,
      );
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe("original");
    });
  });

  describe("core behavior", () => {
    it("trims whitespace from compiled result", async () => {
      vi.mocked(promptOptimizationApiV2.compilePrompt).mockResolvedValue(
        mockCompileResult({ compiledPrompt: "  compiled with spaces  " }),
      );

      const resultPromise = compileWanPrompt("test", abortController.signal);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe("compiled with spaces");
    });
  });
});
