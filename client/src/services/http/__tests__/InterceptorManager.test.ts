import { describe, expect, it } from "vitest";
import { InterceptorManager } from "../InterceptorManager";

describe("InterceptorManager", () => {
  it("runs sync and async interceptors in registration order", async () => {
    const manager = new InterceptorManager<{
      value: number;
      steps: string[];
    }>();

    manager.use((payload) => ({
      ...payload,
      value: payload.value + 1,
      steps: [...payload.steps, "sync-1"],
    }));
    manager.use(async (payload) => ({
      ...payload,
      value: payload.value * 2,
      steps: [...payload.steps, "async-2"],
    }));

    const result = await manager.run({ value: 2, steps: [] });

    expect(result).toEqual({
      value: 6,
      steps: ["sync-1", "async-2"],
    });
  });

  it("passes through previous payload when interceptor returns undefined", async () => {
    const manager = new InterceptorManager<{ count: number }>();

    manager.use((payload) => ({ count: payload.count + 1 }));
    manager.use(() => undefined);
    manager.use((payload) => ({ count: payload.count + 10 }));

    await expect(manager.run({ count: 1 })).resolves.toEqual({ count: 12 });
  });
});
