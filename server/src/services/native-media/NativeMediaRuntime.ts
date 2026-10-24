import { WorkflowError } from "@services/projects/WorkflowError";

/** One admission authority per API process; feature receipts and recovery stay with their owners. */
export class NativeMediaRuntime {
  private readonly waiting: Array<{ start(): void; cancel(reason: unknown): void }> = [];
  private readonly active = new Map<AbortController, Promise<void>>();
  private stopping = false;
  private draining: Promise<boolean> | undefined;
  private readonly maxQueued: number;

  constructor(options: { maxQueued?: number } = {}) {
    this.maxQueued = options.maxQueued ?? 8;
    if (!Number.isSafeInteger(this.maxQueued) || this.maxQueued < 0) throw new Error("Invalid native queue capacity");
  }

  run<T>(signal: AbortSignal | undefined, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.stopping) return Promise.reject(this.unavailable("The native media runtime is stopping."));
    if (signal?.aborted) return Promise.reject(signal.reason);
    if (this.active.size && this.waiting.length >= this.maxQueued) return Promise.reject(this.unavailable("Native media processing is busy. Try again shortly."));
    return new Promise<T>((resolve, reject) => {
      let waitingDeadline: ReturnType<typeof setTimeout> | undefined;
      const entry = {
        cancel: (reason: unknown): void => {
          if (waitingDeadline) clearTimeout(waitingDeadline);
          const index = this.waiting.indexOf(entry);
          if (index >= 0) this.waiting.splice(index, 1);
          signal?.removeEventListener("abort", abort);
          reject(reason);
        },
        start: (): void => {
          if (waitingDeadline) clearTimeout(waitingDeadline);
          signal?.removeEventListener("abort", abort);
          if (signal?.aborted) { reject(signal.reason); this.pump(); return; }
          const controller = new AbortController();
          const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
          const closed = Promise.resolve().then(() => { combined.throwIfAborted(); return task(combined); }).then(resolve, reject).finally(() => { this.active.delete(controller); this.pump(); });
          this.active.set(controller, closed);
        },
      };
      const abort = (): void => entry.cancel(signal?.reason);
      signal?.addEventListener("abort", abort, { once: true });
      if (this.active.size) { this.waiting.push(entry); waitingDeadline = setTimeout(() => entry.cancel(this.unavailable("Native media processing is busy; waiting deadline exceeded.")), 30_000); } else entry.start();
    });
  }

  drain(timeoutMs = 10_000): Promise<boolean> {
    if (this.draining) return this.draining;
    this.stopping = true;
    for (const entry of this.waiting.splice(0)) entry.cancel(this.unavailable("The native media runtime is stopping."));
    this.draining = this.finishDrain(Math.max(0, Math.min(timeoutMs, 60_000)));
    return this.draining;
  }

  private pump(): void { if (!this.stopping && !this.active.size) this.waiting.shift()?.start(); }
  private unavailable(message: string): WorkflowError { return new WorkflowError("capability_unavailable", message); }
  private async finishDrain(timeoutMs: number): Promise<boolean> {
    const closed = Promise.allSettled([...this.active.values()]);
    const within = async (ms: number): Promise<boolean> => new Promise(resolve => {
      const timer = setTimeout(() => resolve(false), ms);
      void closed.then(() => { clearTimeout(timer); resolve(true); });
    });
    if (await within(timeoutMs)) return true;
    for (const controller of this.active.keys()) controller.abort();
    return within(5000);
  }
}
