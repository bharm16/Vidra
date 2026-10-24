import { expect, it, vi } from "vitest";
import { ReplicateModelRunner } from "../ReplicateModelRunner";
it("retains the provider prediction identity with its confirmed output", async () => {
  const create = vi.fn(async () => ({ id: "prediction_confirmed", status: "succeeded" as const, output: ["https://provider.test/result.mp4"] }));
  const runner = new ReplicateModelRunner({ predictions: { create, get: vi.fn() } }, vi.fn(async () => undefined));
  expect(await runner.run({ model: "controlled/video", input: { prompt: "Boat" }, userId: "creator", timeoutMs: 10000, pollIntervalMs: 1000 })).toEqual({ predictionId: "prediction_confirmed", output: ["https://provider.test/result.mp4"] });
});

it("rejects a retired raw-key principal before reaching the provider adapter", async () => {
  const create = vi.fn(); const runner = new ReplicateModelRunner({ predictions: { create, get: vi.fn() } });
  await expect(runner.run({ model: "controlled/video", input: {}, userId: "api-key:retired-key-fixture", timeoutMs: 10000, pollIntervalMs: 1000 })).rejects.toThrow("unavailable");
  expect(create).not.toHaveBeenCalled();
});
