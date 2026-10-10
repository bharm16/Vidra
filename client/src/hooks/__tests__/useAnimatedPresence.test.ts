import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAnimatedPresence } from "../useAnimatedPresence";

describe("useAnimatedPresence", () => {
  const originalMatchMedia = window.matchMedia;
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;
  let rafQueue: Array<FrameRequestCallback | null> = [];

  const flushAnimationFrames = async (frames = 3): Promise<void> => {
    await act(async () => {
      await Promise.resolve();
      for (let index = 0; index < frames; index += 1) {
        const pendingCallbacks = [...rafQueue];
        rafQueue = [];
        pendingCallbacks.forEach((callback) => callback?.(performance.now()));
        await Promise.resolve();
      }
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    rafQueue = [];
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      rafQueue.push(callback);
      return rafQueue.length;
    });
    const cancelAnimationFrame = vi.fn((id: number) => {
      if (id > 0 && id <= rafQueue.length) {
        rafQueue[id - 1] = null;
      }
    });
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
    window.requestAnimationFrame = requestAnimationFrame;
    window.cancelAnimationFrame = cancelAnimationFrame;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.matchMedia = originalMatchMedia;
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  it("starts an exit immediately when closed during enter", async () => {
    const { result, rerender } = renderHook(
      ({ open }) => useAnimatedPresence(open, { exitMs: 220 }),
      { initialProps: { open: true } },
    );

    rerender({ open: false });

    expect(result.current.shouldRender).toBe(true);
    expect(result.current.phase).toBe("exit");

    await act(async () => {
      vi.advanceTimersByTime(220);
    });

    expect(result.current.shouldRender).toBe(false);
    expect(result.current.phase).toBe("exited");
  });

  it("reopens during exit without leaking the old unmount timer", async () => {
    const { result, rerender } = renderHook(
      ({ open }) => useAnimatedPresence(open, { exitMs: 220 }),
      { initialProps: { open: true } },
    );

    await flushAnimationFrames();
    rerender({ open: false });
    expect(result.current.phase).toBe("exit");

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    rerender({ open: true });
    expect(result.current.shouldRender).toBe(true);
    expect(result.current.phase).toBe("enter");

    await flushAnimationFrames();
    expect(result.current.phase).toBe("entered");

    await act(async () => {
      vi.advanceTimersByTime(220);
    });

    expect(result.current.shouldRender).toBe(true);
    expect(result.current.phase).toBe("entered");
  });

  it("bypasses staged transitions when reduced motion is enabled", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;

    const { result, rerender } = renderHook(
      ({ open }) => useAnimatedPresence(open, { exitMs: 220 }),
      { initialProps: { open: true } },
    );

    expect(result.current.shouldRender).toBe(true);
    expect(result.current.phase).toBe("entered");

    rerender({ open: false });

    expect(result.current.shouldRender).toBe(false);
    expect(result.current.phase).toBe("exited");
  });
});
