import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCalculateEffectiveDebounce } = vi.hoisted(() => ({
  mockCalculateEffectiveDebounce: vi.fn(),
}));

vi.mock("../../utils/spanLabelingScheduler.ts", () => ({
  calculateEffectiveDebounce: mockCalculateEffectiveDebounce,
}));

import { useAsyncScheduler } from "../useAsyncScheduler";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useAsyncScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedules execution using calculated debounce delay", async () => {
    mockCalculateEffectiveDebounce.mockReturnValue(200);

    const onExecute = vi.fn().mockResolvedValue({ ok: true });
    const onSuccess = vi.fn();
    const onLoadingState = vi.fn();

    const { result } = renderHook(() =>
      useAsyncScheduler(
        {
          enabled: true,
          debounceMs: 300,
          useSmartDebounce: true,
          immediate: false,
        },
        { onExecute, onSuccess, onLoadingState },
      ),
    );

    act(() => {
      result.current.schedule({ text: "hello world" });
    });

    expect(onLoadingState).toHaveBeenCalledWith(false);
    expect(onExecute).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(199);
    });
    expect(onExecute).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
    });

    expect(onExecute).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith(
      { ok: true },
      { text: "hello world" },
    );
  });

  it("cancelPending clears queued debounce and aborts active controller", async () => {
    mockCalculateEffectiveDebounce.mockReturnValue(0);

    let observedSignal: AbortSignal | undefined;
    const onExecute = vi
      .fn()
      .mockImplementation(async (_payload, signal: AbortSignal) => {
        observedSignal = signal;
        return new Promise(() => undefined);
      });

    const { result } = renderHook(() =>
      useAsyncScheduler(
        {
          enabled: true,
          debounceMs: 0,
          useSmartDebounce: false,
          immediate: true,
        },
        { onExecute },
      ),
    );

    act(() => {
      result.current.schedule({ text: "long running" }, true);
    });

    expect(onExecute).toHaveBeenCalledTimes(1);
    expect(observedSignal?.aborted).toBe(false);

    act(() => {
      result.current.cancelPending();
    });

    expect(observedSignal?.aborted).toBe(true);
  });

  it("suppresses stale request results when a newer request is scheduled", async () => {
    mockCalculateEffectiveDebounce.mockReturnValue(0);

    const first = createDeferred<{ id: number }>();
    const second = createDeferred<{ id: number }>();
    const onExecute = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const onSuccess = vi.fn();

    const { result } = renderHook(() =>
      useAsyncScheduler(
        {
          enabled: true,
          debounceMs: 0,
          useSmartDebounce: false,
          immediate: true,
        },
        { onExecute, onSuccess },
      ),
    );

    act(() => {
      result.current.schedule({ text: "first" }, true);
      result.current.schedule({ text: "second" }, true);
    });

    await act(async () => {
      first.resolve({ id: 1 });
      await Promise.resolve();
    });

    expect(onSuccess).not.toHaveBeenCalledWith({ id: 1 }, { text: "first" });

    await act(async () => {
      second.resolve({ id: 2 });
      await Promise.resolve();
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith({ id: 2 }, { text: "second" });
  });

  it("calls onError for active non-aborted failures", async () => {
    mockCalculateEffectiveDebounce.mockReturnValue(0);

    const onError = vi.fn();
    const onExecute = vi.fn().mockRejectedValue(new Error("network failed"));

    const { result } = renderHook(() =>
      useAsyncScheduler(
        {
          enabled: true,
          debounceMs: 0,
          useSmartDebounce: false,
          immediate: true,
        },
        { onExecute, onError },
      ),
    );

    await act(async () => {
      result.current.schedule({ text: "error path" }, true);
      await Promise.resolve();
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      message: "network failed",
    });
    expect(onError).toHaveBeenCalledWith(expect.any(Error), {
      text: "error path",
    });
  });
});
