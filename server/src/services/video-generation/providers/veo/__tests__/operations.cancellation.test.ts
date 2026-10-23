import { afterEach, expect, it, vi } from "vitest";
import { startVeoGeneration, waitForVeoOperation } from "../operations";

afterEach(() => vi.unstubAllGlobals());

it("propagates execution cancellation to Veo's provider-start HTTP request", async () => {
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    entered();
    return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true }));
  });
  vi.stubGlobal("fetch", fetchMock);
  const controller = new AbortController();
  const pending = startVeoGeneration("https://controlled.example.test", "provider-fixture", { prompt: "A lighthouse" }, "veo-model", controller.signal);
  const rejected = expect(pending).rejects.toThrow("Cancelled start");
  await started;
  controller.abort(new Error("Cancelled start"));
  await rejected;
  expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
});

it("cancels Veo polling sleep promptly and performs no subsequent poll", async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ name: "operations/controlled", done: false }), { headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  const controller = new AbortController();
  const pending = waitForVeoOperation("https://controlled.example.test", "provider-fixture", "operations/controlled", { pollIntervalMs: 10_000, timeoutMs: 60_000, signal: controller.signal });
  const rejected = expect(pending).rejects.toThrow(/abort/i);
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  await rejected;
  expect(fetchMock).toHaveBeenCalledOnce();
});
