import { afterEach, describe, expect, it, vi } from "vitest";

const { FakeCircuitBreaker, mockLogger, mockMetricsService } = vi.hoisted(
  () => {
    class FakeCircuitBreaker {
      public opened = false;
      public halfOpen = false;
      public stats = { fires: 0 };
      public readonly options: Record<string, unknown>;
      private readonly fn: (...args: unknown[]) => Promise<unknown>;
      private handlers = new Map<string, () => void>();

      constructor(
        fn: (...args: unknown[]) => Promise<unknown>,
        options: Record<string, unknown>,
      ) {
        this.fn = fn;
        this.options = options;
      }

      fire(...args: unknown[]) {
        this.stats.fires += 1;
        return this.fn(...args);
      }

      on(event: string, handler: () => void) {
        this.handlers.set(event, handler);
        return this;
      }

      emit(event: string) {
        this.handlers.get(event)?.();
      }
    }

    const mockLogger = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    };

    const mockMetricsService = {
      recordClaudeAPICall: vi.fn(),
      updateCircuitBreakerState: vi.fn(),
    };

    return { FakeCircuitBreaker, mockLogger, mockMetricsService };
  },
);

vi.mock("opossum", () => ({
  default: FakeCircuitBreaker,
}));

vi.mock("@infrastructure/Logger", () => ({
  logger: mockLogger,
}));

import { LLMClient, ClientAbortError, TimeoutError } from "@clients/LLMClient";

const createAdapter = (overrides: Record<string, unknown> = {}) => ({
  complete: vi.fn().mockResolvedValue({ text: "ok", metadata: {} }),
  ...overrides,
});

describe("LLMClient", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("error handling", () => {
    // "throws when adapter lacks a complete method" died with the runtime
    // guard it covered. `complete` is required by LLMAdapter, so an adapter
    // without one is now a compile error — the old test could only reach the
    // guard by defeating the type with `{} as never`.

    it("requires onChunk for streaming", async () => {
      const adapter = createAdapter({ streamComplete: vi.fn() });
      const client = new LLMClient({ adapter, providerName: "test" });

      await expect(
        client.streamComplete("Prompt", {} as never),
      ).rejects.toThrow("onChunk callback is required for streaming");
    });

    it("wraps queue timeouts from concurrency limiter", async () => {
      const adapter = createAdapter();
      const concurrencyLimiter = {
        execute: vi
          .fn()
          .mockRejectedValue(
            Object.assign(new Error("timeout"), { code: "QUEUE_TIMEOUT" }),
          ),
      };
      const client = new LLMClient({
        adapter,
        providerName: "test",
        concurrencyLimiter,
      });

      await expect(client.complete("Prompt", {})).rejects.toBeInstanceOf(
        TimeoutError,
      );
    });
  });

  describe("edge cases", () => {
    it("surfaces adapter health check results", async () => {
      const adapter = createAdapter({
        healthCheck: vi
          .fn()
          .mockResolvedValue({ healthy: false, responseTime: 42 }),
      });
      const client = new LLMClient({ adapter, providerName: "test" });

      const result = await client.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.provider).toBe("test");
      expect(result.responseTime).toBe(42);
    });

    it("ignores ClientAbortError in circuit breaker error filter", () => {
      const adapter = createAdapter();
      const client = new LLMClient({ adapter, providerName: "test" });
      const breaker = (
        client as unknown as {
          breaker: InstanceType<typeof FakeCircuitBreaker>;
        }
      ).breaker;
      const errorFilter = breaker.options.errorFilter as (
        err: Error,
      ) => boolean;

      expect(errorFilter(new ClientAbortError("client aborted"))).toBe(true);
      expect(errorFilter(new Error("other"))).toBe(false);
    });
  });

  describe("core behavior", () => {
    it("applies default model and timeout and returns adapter response", async () => {
      const adapter = createAdapter();
      const client = new LLMClient({
        adapter,
        providerName: "test",
        defaultModel: "model-a",
        defaultTimeout: 1234,
        metricsService: mockMetricsService,
      });

      const response = await client.complete("Prompt", {});

      expect(response.text).toBe("ok");
      expect(
        (adapter.complete as ReturnType<typeof vi.fn>).mock.calls[0]?.[1],
      ).toEqual(
        expect.objectContaining({
          model: "model-a",
          timeout: 1234,
        }),
      );
      expect(mockMetricsService.recordClaudeAPICall).toHaveBeenCalledWith(
        "test-chat/completions",
        expect.any(Number),
        true,
      );
    });
  });
});
