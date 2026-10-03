import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TakeAttachment } from "@shared/schemas/attachment.schemas";
import { useUnresolvedSketchAcceptances } from "../useUnresolvedSketchAcceptances";

const wire = vi.hoisted(() => ({
  actor: "creator" as string | undefined,
  discover: vi.fn(),
  retry: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@repositories/index", () => ({
  getAuthRepository: () => ({
    getCurrentUser: () => (wire.actor ? { uid: wire.actor } : null),
  }),
}));
const originalUrl = window.location.href;
const originalNavigationState: unknown = window.history.state;
vi.mock("@/features/generations/api/takeAttachment", () => ({
  fetchUnresolvedSketchAcceptances: wire.discover,
  retryPictureAttachment: wire.retry,
}));
vi.mock("@/features/generations/api/sessionGenerations", () => ({
  readSavedSketchTake: wire.read,
}));
const attachment: TakeAttachment = {
  state: "failed",
  sessionId: "session-1",
  promptVersionId: "v1",
  generationId: "take-1",
  record: {
    id: "take-1",
    origin: "sketchpad",
    mediaType: "image",
    status: "completed",
  },
};
const saved = { id: "take-1", origin: "sketchpad" };
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}
function setup(): {
  context: { creatorId: string | undefined; sessionId: string | null };
  hook: ReturnType<
    typeof renderHook<
      ReturnType<typeof useUnresolvedSketchAcceptances>,
      unknown
    >
  >;
  attached: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
} {
  const context = {
    creatorId: "creator" as string | undefined,
    sessionId: "session-1" as string | null,
  };
  const attached = vi.fn();
  const error = vi.fn();
  const hook = renderHook(() =>
    useUnresolvedSketchAcceptances({
      ...context,
      onAttached: attached,
      onError: error,
    }),
  );
  return { context, hook, attached, error };
}
beforeEach(() => {
  wire.actor = "creator";
  window.history.replaceState({ key: "recovery-origin" }, "", originalUrl);
  wire.discover.mockReset().mockResolvedValue([attachment]);
  wire.retry.mockReset().mockResolvedValue(undefined);
  wire.read.mockReset().mockResolvedValue(saved);
});
afterEach(() =>
  window.history.replaceState(originalNavigationState, "", originalUrl),
);
describe("unresolved sketch acceptance session recovery", () => {
  it("does not discover for a stale React creator after the auth repository changes", async () => {
    wire.actor = "other";
    setup();
    await act(async () => {});
    expect(wire.discover).not.toHaveBeenCalled();
  });
  it("drops discovery when the auth repository changes before React rerenders", async () => {
    const request = deferred<TakeAttachment[]>();
    wire.discover.mockReturnValueOnce(request.promise);
    const { hook } = setup();
    wire.actor = "other";
    await act(async () => {
      request.resolve([attachment]);
    });
    expect(hook.result.current.unattachedTake).toBeNull();
  });
  it("does not dispatch a retained retry under another repository creator", async () => {
    const { hook } = setup();
    await waitFor(() =>
      expect(hook.result.current.unattachedTake).not.toBeNull(),
    );
    wire.actor = "other";
    await act(async () => {
      await hook.result.current.retryAttachment();
    });
    expect(wire.retry).not.toHaveBeenCalled();
  });
  it("drops attachment completion when the repository actor changes without a render", async () => {
    const { hook, attached } = setup();
    await waitFor(() =>
      expect(hook.result.current.unattachedTake).not.toBeNull(),
    );
    const request = deferred<void>();
    wire.retry.mockReturnValueOnce(request.promise);
    let run!: Promise<void>;
    act(() => {
      run = hook.result.current.retryAttachment();
    });
    wire.actor = "other";
    await act(async () => {
      request.resolve();
      await run;
    });
    expect(wire.read).not.toHaveBeenCalled();
    expect(attached).not.toHaveBeenCalled();
  });
  it("does not apply owned readback after an imperative actor change", async () => {
    const { hook, attached } = setup();
    await waitFor(() =>
      expect(hook.result.current.unattachedTake).not.toBeNull(),
    );
    const request = deferred<typeof saved>();
    wire.read.mockReturnValueOnce(request.promise);
    let run!: Promise<void>;
    act(() => {
      run = hook.result.current.retryAttachment();
    });
    await waitFor(() => expect(wire.read).toHaveBeenCalledTimes(1));
    wire.actor = "other";
    await act(async () => {
      request.resolve(saved);
      await run;
    });
    expect(attached).not.toHaveBeenCalled();
  });
  it("drops discovery and retained retry after a same-URL navigation before props update", async () => {
    const request = deferred<TakeAttachment[]>();
    wire.discover.mockReturnValueOnce(request.promise);
    const first = setup();
    window.history.pushState(
      { key: "same-url-new-navigation" },
      "",
      originalUrl,
    );
    await act(async () => {
      request.resolve([attachment]);
    });
    expect(first.hook.result.current.unattachedTake).toBeNull();
    first.hook.unmount();
    window.history.replaceState({ key: "recovery-origin" }, "", originalUrl);
    const { hook } = setup();
    await waitFor(() =>
      expect(hook.result.current.unattachedTake).not.toBeNull(),
    );
    window.history.pushState(
      { key: "another-same-url-navigation" },
      "",
      originalUrl,
    );
    await act(async () => {
      await hook.result.current.retryAttachment();
    });
    expect(wire.retry).not.toHaveBeenCalled();
  });
  it("discovers a failed receipt read-only and saves the same take only on an explicit retry", async () => {
    const { hook, attached } = setup();
    await waitFor(() =>
      expect(hook.result.current.unattachedTake).toEqual(attachment),
    );
    expect(wire.discover).toHaveBeenCalledWith("session-1");
    expect(wire.retry).not.toHaveBeenCalled();
    expect(attached).not.toHaveBeenCalled();
    await act(async () => {
      await hook.result.current.retryAttachment();
    });
    expect(wire.retry).toHaveBeenCalledWith(attachment);
    expect(wire.read).toHaveBeenCalledWith(
      "creator",
      "session-1",
      "v1",
      "take-1",
    );
    expect(attached).toHaveBeenCalledWith(saved, "v1");
    expect(hook.result.current.unattachedTake).toBeNull();
  });
  it("never displays or retries a receipt belonging to another destination", async () => {
    wire.discover.mockResolvedValue([
      { ...attachment, sessionId: "other-session" },
    ]);
    const { hook } = setup();
    await act(async () => {});
    expect(hook.result.current.unattachedTake).toBeNull();
    await act(async () => {
      await hook.result.current.retryAttachment();
    });
    expect(wire.retry).not.toHaveBeenCalled();
  });
  it("drops a late discovery after account changes and does not fetch for a signed-out creator", async () => {
    const request = deferred<TakeAttachment[]>();
    wire.discover.mockReturnValueOnce(request.promise);
    const { hook, context } = setup();
    context.creatorId = undefined;
    hook.rerender();
    await act(async () => {
      request.resolve([attachment]);
    });
    expect(hook.result.current.unattachedTake).toBeNull();
    expect(wire.discover).toHaveBeenCalledTimes(1);
  });
  it("drops a late retry after navigation rather than applying it to another session", async () => {
    const { hook, context, attached } = setup();
    await waitFor(() =>
      expect(hook.result.current.unattachedTake).not.toBeNull(),
    );
    const request = deferred<void>();
    wire.retry.mockReturnValueOnce(request.promise);
    let run!: Promise<void>;
    act(() => {
      run = hook.result.current.retryAttachment();
    });
    context.sessionId = "session-2";
    wire.discover.mockResolvedValue([]);
    hook.rerender();
    await act(async () => {
      request.resolve();
      await run;
    });
    expect(wire.read).not.toHaveBeenCalled();
    expect(attached).not.toHaveBeenCalled();
  });
  it("retains the exact failed acceptance when attachment or owned readback is refused", async () => {
    const { hook, error, attached } = setup();
    await waitFor(() =>
      expect(hook.result.current.unattachedTake).not.toBeNull(),
    );
    wire.retry.mockRejectedValueOnce(new Error("Attachment unavailable"));
    await act(async () => {
      await hook.result.current.retryAttachment();
    });
    expect(error).toHaveBeenCalledWith("Attachment unavailable");
    expect(hook.result.current.unattachedTake).toEqual(attachment);
    wire.read.mockRejectedValueOnce(new Error("Wrong creator"));
    await act(async () => {
      await hook.result.current.retryAttachment();
    });
    expect(error).toHaveBeenCalledWith("Wrong creator");
    expect(attached).not.toHaveBeenCalled();
    expect(hook.result.current.unattachedTake).toEqual(attachment);
  });
});
