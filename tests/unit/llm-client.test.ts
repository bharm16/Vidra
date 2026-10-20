import { afterEach, describe, expect, it, vi } from "vitest";

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@infrastructure/Logger", () => ({
  logger: mockLogger,
}));

import { LLMClient } from "@clients/LLMClient";

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

    it("propagates adapter failures unchanged", async () => {
      const failure = Object.assign(new Error("upstream 500"), {
        statusCode: 500,
      });
      const adapter = createAdapter({
        complete: vi.fn().mockRejectedValue(failure),
      });
      const client = new LLMClient({ adapter, providerName: "test" });

      await expect(client.complete("Prompt", {})).rejects.toBe(failure);
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
    });
  });
});
