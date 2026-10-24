import { afterEach, expect, it, vi } from "vitest";
import { GeminiAdapter } from "../GeminiAdapter";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("keeps the provider deadline active while consuming the response body", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => ({ ok: true, json: (): Promise<unknown> => new Promise((_resolve, reject) => { options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }); }) })));
  const adapter = new GeminiAdapter({ apiKey: "test", defaultModel: "test" });
  const operation = adapter.complete("test", { timeout: 1000 });
  const result = expect(operation).rejects.toThrow("timeout");
  await vi.advanceTimersByTimeAsync(1500); await result;
});
