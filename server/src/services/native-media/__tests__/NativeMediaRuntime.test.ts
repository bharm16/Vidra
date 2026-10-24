import { expect, it, vi } from "vitest";
import { NativeMediaRuntime } from "../NativeMediaRuntime";
it("shares one capacity across export, preview, frame and import tasks", async () => {
  const runtime = new NativeMediaRuntime(); let active = 0; let maximum = 0;
  await Promise.all(["export", "preview", "frame", "import"].map(name => runtime.run(undefined, async () => { active += 1; maximum = Math.max(maximum, active); await Promise.resolve(); active -= 1; return name; })));
  expect(maximum).toBe(1);
});
it("bounds waiting work, removes cancelled tasks and drains through closure", async () => {
  vi.useFakeTimers();
  try {
    const runtime = new NativeMediaRuntime({ maxQueued: 1 });
    const first = runtime.run(undefined, signal => new Promise<void>(resolve => signal.addEventListener("abort", () => setTimeout(resolve, 10), { once: true })));
    const cancellation = new AbortController(); const queued = runtime.run(cancellation.signal, async () => "unreachable");
    const refused = expect(runtime.run(undefined, async () => "unreachable")).rejects.toThrow("busy"); await refused;
    const cancelled = expect(queued).rejects.toThrow(); cancellation.abort(); await cancelled;
    const draining = runtime.drain(10); await vi.advanceTimersByTimeAsync(25); await expect(draining).resolves.toBe(true); await first;
    await expect(runtime.run(undefined, async () => "unreachable")).rejects.toThrow("stopping");
  } finally { vi.useRealTimers(); }
});

it("expires waiting work before it can run under a stale operation lease", async () => {
  vi.useFakeTimers();
  try {
    const runtime = new NativeMediaRuntime(); let finish!: () => void;
    const active = runtime.run(undefined, () => new Promise<void>(resolve => { finish = resolve; }));
    const task = vi.fn(async () => "stale"); const refused = expect(runtime.run(undefined, task)).rejects.toThrow("waiting deadline");
    await vi.advanceTimersByTimeAsync(30_001); await refused; expect(task).not.toHaveBeenCalled(); finish(); await active;
  } finally { vi.useRealTimers(); }
});
