import { Readable } from "node:stream";
import type Replicate from "replicate";
import { afterEach, expect, it, vi } from "vitest";
import { VideoGenerationService } from "../VideoGenerationService";
import { ReplicateVideoProvider } from "../providers/ReplicateVideoProvider";
import type { VideoAssetStore } from "../storage";
import * as network from "@services/owned-media/PublicNetworkTransport";
import { VeoVideoProvider } from "../providers/VeoVideoProvider";
import * as veoOperations from "../providers/veo/operations";
import { setTimeoutPolicyConfig } from "../providers/timeoutPolicy";
import type { VideoProviderMap } from "../providers/types";

vi.mock("@infrastructure/Logger", () => ({ logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  setTimeoutPolicyConfig({ pollTimeoutMs: 270_000, workflowTimeoutMs: 300_000 });
});

const assets = {
  storeFromBuffer: vi.fn(), storeFromStream: vi.fn(), getStream: vi.fn(),
  getPublicUrl: vi.fn(), cleanupExpired: vi.fn(),
} as unknown as VideoAssetStore;

function stalledInput(kind: "replicate" | "veo") {
  const body = new Readable({ read(): void {} });
  let entered!: () => void;
  const reading = new Promise<void>(resolve => { entered = resolve; });
  vi.spyOn(network, "requestPublicMedia").mockImplementation(async () => {
    entered();
    return { status: 200, statusText: "OK", headers: new Headers({ "content-type": "image/png" }), body };
  });
  const run = vi.fn(async () => { throw new Error("Provider must not start after cancellation"); });
  const startVeo = vi.spyOn(veoOperations, "startVeoGeneration").mockRejectedValue(new Error("Provider must not start after cancellation"));
  const providers: VideoProviderMap = kind === "replicate"
    ? { replicate: new ReplicateVideoProvider({ replicate: { run, predictions: { create: run } } as unknown as Replicate }) }
    : { gemini: new VeoVideoProvider({ apiKey: "controlled-provider-fixture" }) };
  return {
    service: new VideoGenerationService({ providers, assetStore: assets }),
    body,
    reading,
    starts: kind === "replicate" ? run : startVeo,
    options: { model: kind === "replicate" ? "wan-video/wan-2.2-i2v-fast" : "google/veo-3", startImage: "https://cdn.example.test/input" },
  };
}

it.each(["replicate", "veo"] as const)("caller cancellation destroys a stalled %s input and prevents provider start", async kind => {
  const { service, options, body, reading, starts } = stalledInput(kind);
  const controller = new AbortController();
  const pending = service.generateVideo("A lighthouse", options, controller.signal);
  void pending.catch(() => undefined);
  try {
    await reading;
    controller.abort(new Error("Lease lost"));
    await new Promise(resolve => setImmediate(resolve));
    expect(body.destroyed).toBe(true);
    await expect(pending).rejects.toThrow("Lease lost");
    expect(starts).not.toHaveBeenCalled();
    expect(options).not.toHaveProperty("signal");
  } finally {
    body.destroy(new Error("Controlled test cleanup"));
    await pending.catch(() => undefined);
  }
});

it.each(["replicate", "veo"] as const)("the default native watchdog aborts a stalled %s input even without a caller signal", async kind => {
  vi.useFakeTimers();
  const { service, options, body, reading, starts } = stalledInput(kind);
  const pending = service.generateVideo("A lighthouse", options);
  const rejected = expect(pending).rejects.toThrow("workflow timeout exceeded");
  try {
    await reading;
    await vi.advanceTimersByTimeAsync(300_000);
    await rejected;
    expect(body.destroyed).toBe(true);
    expect(starts).not.toHaveBeenCalled();
  } finally {
    body.destroy(new Error("Controlled test cleanup"));
    await pending.catch(() => undefined);
  }
});

it("rejects an already cancelled service call before any preparation or provider dispatch", async () => {
  const { service, options, starts } = stalledInput("replicate");
  const controller = new AbortController();
  controller.abort(new Error("Cancelled before dispatch"));
  await expect(service.generateVideo("A lighthouse", options, controller.signal)).rejects.toThrow("Cancelled before dispatch");
  expect(network.requestPublicMedia).not.toHaveBeenCalled();
  expect(starts).not.toHaveBeenCalled();
});

it("passes cancellation to Replicate's provider-start HTTP API without adding it to model input", async () => {
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  let received: AbortSignal | undefined;
  const create = vi.fn(async (context: { input: object; signal?: AbortSignal }) => {
    received = context.signal;
    entered();
    return new Promise<never>((_resolve, reject) => context.signal?.addEventListener("abort", () => reject(context.signal?.reason), { once: true }));
  });
  const service = new VideoGenerationService({ providers: { replicate: new ReplicateVideoProvider({ replicate: { predictions: { create } } as unknown as Replicate }) }, assetStore: assets });
  const controller = new AbortController();
  const pending = service.generateVideo("A lighthouse", { model: "wan-video/wan-2.2-t2v-fast" }, controller.signal);
  const rejected = expect(pending).rejects.toThrow("Caller stopped");
  await started;
  controller.abort(new Error("Caller stopped"));
  await rejected;
  expect(received?.aborted).toBe(true);
  expect(create.mock.calls[0]?.[0].input).not.toHaveProperty("signal");
});
