import type Replicate from "replicate";
import { afterEach, expect, it, vi } from "vitest";
import { runCancellableVideoPrediction } from "../replicateVideoPrediction";

type Prediction = Awaited<ReturnType<Replicate["predictions"]["create"]>>;
const prediction = (status: Prediction["status"], extra: Partial<Prediction> = {}): Prediction => ({ id: "prediction_immutable", status, output: status === "succeeded" ? "https://output.example.test/clip.mp4" : null, ...extra }) as Prediction;
const log = { warn: vi.fn() };
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

function client() {
  const create = vi.fn(async (_options: unknown) => prediction("processing"));
  const get = vi.fn(async (_id: string, _options: { signal?: AbortSignal }) => prediction("succeeded"));
  const cancel = vi.fn(async (_id: string, _options: { signal?: AbortSignal }) => prediction("canceled"));
  return { create, get, cancel, sdk: { predictions: { create, get, cancel } } as unknown as Replicate };
}

it.each(["owner/model", "owner/model:version-hash"])("preserves %s mapping, input, 500ms polling and one immutable accepted identity", async identifier => {
  vi.useFakeTimers();
  const provider = client();
  provider.get.mockResolvedValueOnce(prediction("processing"));
  const controller = new AbortController();
  const input = { prompt: "Exact words", seed: 123 };
  const pending = runCancellableVideoPrediction(provider.sdk, identifier, input, controller.signal, log);
  await vi.advanceTimersByTimeAsync(0);
  expect(provider.get).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(499);
  expect(provider.get).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  await expect(pending).resolves.toBe("https://output.example.test/clip.mp4");
  expect(provider.create).toHaveBeenCalledExactlyOnceWith({ ...(identifier.includes(":") ? { version: "version-hash" } : { model: "owner/model" }), input, wait: true, signal: controller.signal });
  expect(provider.get.mock.calls.every(([id, context]) => id === "prediction_immutable" && context.signal === controller.signal)).toBe(true);
  controller.abort();
  expect(provider.cancel).not.toHaveBeenCalled();
  expect(input).toEqual({ prompt: "Exact words", seed: 123 });
});

it.each(["failed", "canceled", "aborted"] as const)("stops at terminal %s without polling or a second create", async status => {
  const provider = client();
  provider.create.mockResolvedValueOnce(prediction(status, { error: "Controlled provider failure" }));
  await expect(runCancellableVideoPrediction(provider.sdk, "owner/model", {}, new AbortController().signal, log)).rejects.toThrow(`Prediction ${status}`);
  expect(provider.create).toHaveBeenCalledOnce();
  expect(provider.get).not.toHaveBeenCalled();
});

it("aborts an active poll and makes one bounded best-effort cancel for its known prediction", async () => {
  const provider = client();
  let entered!: () => void;
  const polling = new Promise<void>(resolve => { entered = resolve; });
  provider.get.mockImplementationOnce(async (_id, context) => {
    entered();
    return new Promise<Prediction>((_resolve, reject) => context.signal?.addEventListener("abort", () => reject(context.signal?.reason), { once: true }));
  });
  const controller = new AbortController();
  const pending = runCancellableVideoPrediction(provider.sdk, "owner/model", {}, controller.signal, log);
  const rejected = expect(pending).rejects.toThrow("Execution ended");
  await polling;
  controller.abort(new Error("Execution ended"));
  await rejected;
  expect(provider.create).toHaveBeenCalledOnce();
  expect(provider.get).toHaveBeenCalledOnce();
  expect(provider.cancel).toHaveBeenCalledOnce();
  expect(provider.cancel.mock.calls[0]?.[0]).toBe("prediction_immutable");
  const cancelSignal = provider.cancel.mock.calls[0]?.[1].signal;
  expect(cancelSignal).toBeInstanceOf(AbortSignal);
  expect(cancelSignal).not.toBe(controller.signal);
  expect(cancelSignal?.aborted).toBe(false);
});

it("never retries unknown acceptance, and cancels only if a late create response establishes its identity", async () => {
  const provider = client();
  let complete!: (value: Prediction) => void;
  provider.create.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const controller = new AbortController();
  const pending = runCancellableVideoPrediction(provider.sdk, "owner/model", {}, controller.signal, log);
  const rejected = expect(pending).rejects.toThrow("Lease ended");
  controller.abort(new Error("Lease ended"));
  expect(provider.cancel).not.toHaveBeenCalled();
  complete(prediction("processing"));
  await rejected;
  expect(provider.create).toHaveBeenCalledOnce();
  expect(provider.get).not.toHaveBeenCalled();
  expect(provider.cancel).toHaveBeenCalledOnce();
});

it("never polls a different identity supplied in an unexpected provider response", async () => {
  const provider = client();
  provider.get.mockResolvedValueOnce(prediction("processing", { id: "prediction_other" }));
  await expect(runCancellableVideoPrediction(provider.sdk, "owner/model", {}, new AbortController().signal, log)).rejects.toThrow("identity changed");
  expect(provider.get).toHaveBeenCalledExactlyOnceWith("prediction_immutable", expect.any(Object));
  expect(provider.create).toHaveBeenCalledOnce();
});
