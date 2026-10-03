import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SketchAcceptResult } from "@shared/schemas/sketch.schemas";
import { acceptLiveOutput } from "../api/acceptLiveOutput";
import { useAcceptLiveOutput } from "../hooks/useAcceptLiveOutput";
import type { LiveOutput } from "../hooks/generationReducer";
import {
  retryFirstFrameArming,
  retryPictureAttachment,
} from "@/features/generations/api/takeAttachment";

const actor = vi.hoisted(() => ({ uid: "creator-1" }));
vi.mock("@repositories/index", () => ({
  getAuthRepository: () => ({ getCurrentUser: () => ({ uid: actor.uid }) }),
}));
vi.mock("../api/acceptLiveOutput", () => ({ acceptLiveOutput: vi.fn() }));
vi.mock("@/features/generations/api/takeAttachment", () => ({
  retryPictureAttachment: vi.fn(),
  retryFirstFrameArming: vi.fn(),
}));

const output: LiveOutput = {
  requestId: "shown-picture",
  imageUrl: "data:image/png;base64,cGljdHVyZQ==",
  sketchDataUri: "data:image/png;base64,c2tldGNo",
  at: 0,
  inputs: { prompt: "A lighthouse", strength: 0.6, steps: 4, seed: 1 },
};
const settled: SketchAcceptResult = {
  sessionId: "saved-session",
  promptVersionId: "words-1",
  generationId: "saved-take",
  imageUrl: "https://example.test/saved-take.png",
  createdSession: true,
  attachment: {
    state: "attached",
    sessionId: "saved-session",
    promptVersionId: "words-1",
    generationId: "saved-take",
  },
  arming: { state: "armed", generationId: "saved-take" },
};
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}
function setup() {
  return renderHook(
    () => ({
      ...useAcceptLiveOutput(),
      pathname: useLocation().pathname,
      go: useNavigate(),
    }),
    {
      wrapper: ({ children }: { children: ReactNode }): ReactNode => (
        <MemoryRouter initialEntries={["/live"]}>{children}</MemoryRouter>
      ),
    },
  );
}
const originalBrowserUrl = window.location.href;
beforeEach(() => {
  vi.mocked(acceptLiveOutput).mockReset();
  vi.mocked(retryPictureAttachment).mockReset();
  vi.mocked(retryFirstFrameArming).mockReset();
  actor.uid = "creator-1";
});
afterEach(() => window.history.replaceState(null, "", originalBrowserUrl));

describe("live acceptance navigation ownership (#141)", () => {
  it("does not navigate after the URL changes while Suspense keeps the editor mounted", async () => {
    const response = deferred<SketchAcceptResult>();
    vi.mocked(acceptLiveOutput).mockReturnValue(response.promise);
    const hook = setup();
    act(() => hook.result.current.accept(output));
    // Browser history can move before a retained router subtree rerenders.
    window.history.pushState(null, "", "/library");
    await act(async () => response.resolve(settled));
    expect(hook.result.current.pathname).toBe("/live");
    expect(window.location.pathname).toBe("/library");
    expect(acceptLiveOutput).toHaveBeenCalledTimes(1);
  });

  it("stays in the library after router navigation and reuses the saved acceptance key on return", async () => {
    const response = deferred<SketchAcceptResult>();
    vi.mocked(acceptLiveOutput)
      .mockReturnValueOnce(response.promise)
      .mockResolvedValueOnce(settled);
    const hook = setup();
    act(() => hook.result.current.accept(output));
    const originalKey =
      vi.mocked(acceptLiveOutput).mock.calls[0]?.[0].idempotencyKey;
    act(() => hook.result.current.go("/library"));
    await act(async () => response.resolve(settled));
    expect(hook.result.current.pathname).toBe("/library");
    act(() => hook.result.current.go("/live"));
    act(() => hook.result.current.accept(output));
    await act(async () => {});
    expect(vi.mocked(acceptLiveOutput).mock.calls[1]?.[0].idempotencyKey).toBe(
      originalKey,
    );
    expect(hook.result.current.pathname).toBe("/session/saved-session");
  });

  it("ignores an acceptance completion after the creator changes", async () => {
    const response = deferred<SketchAcceptResult>();
    vi.mocked(acceptLiveOutput).mockReturnValue(response.promise);
    const hook = setup();
    act(() => hook.result.current.accept(output));
    actor.uid = "creator-2";
    await act(async () => response.resolve(settled));
    expect(hook.result.current.pathname).toBe("/live");
    expect(hook.result.current.status.state).toBe("accepting");
  });

  it("keeps attachment recovery retryable and does not automatically arm after departure", async () => {
    const attachment: SketchAcceptResult["attachment"] = {
      ...settled.attachment,
      state: "failed",
      reason: "Write failed",
      record: {
        id: "saved-take",
        mediaType: "image",
        status: "completed",
        prompt: "A lighthouse",
      },
    };
    vi.mocked(acceptLiveOutput).mockResolvedValue({
      ...settled,
      attachment,
      arming: {
        state: "failed",
        generationId: "saved-take",
        reason: "Not attached",
      },
    });
    const hook = setup();
    act(() => hook.result.current.accept(output));
    await act(async () => {});
    const repair =
      deferred<Awaited<ReturnType<typeof retryPictureAttachment>>>();
    vi.mocked(retryPictureAttachment).mockReturnValue(repair.promise);
    act(() => hook.result.current.retryAttachment());
    act(() => hook.result.current.go("/library"));
    await act(async () => repair.resolve(undefined));
    expect(hook.result.current.pathname).toBe("/library");
    expect(hook.result.current.status).toEqual({
      state: "unattached",
      attachment,
    });
    expect(retryFirstFrameArming).not.toHaveBeenCalled();
  });

  it("does not start an arming repair from an editor retained behind a new browser URL", async () => {
    vi.mocked(acceptLiveOutput).mockResolvedValue({
      ...settled,
      arming: {
        state: "failed",
        generationId: "saved-take",
        reason: "Write failed",
      },
    });
    const hook = setup();
    act(() => hook.result.current.accept(output));
    await act(async () => {});
    window.history.pushState(null, "", "/library");
    act(() => hook.result.current.retryArming());
    expect(retryFirstFrameArming).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/library");
  });

  it("does not navigate after an arming repair completes off-route", async () => {
    vi.mocked(acceptLiveOutput).mockResolvedValue({
      ...settled,
      arming: {
        state: "failed",
        generationId: "saved-take",
        reason: "Write failed",
      },
    });
    const hook = setup();
    act(() => hook.result.current.accept(output));
    await act(async () => {});
    const repair =
      deferred<Awaited<ReturnType<typeof retryFirstFrameArming>>>();
    vi.mocked(retryFirstFrameArming).mockReturnValue(repair.promise);
    act(() => hook.result.current.retryArming());
    act(() => hook.result.current.go("/library"));
    await act(async () =>
      repair.resolve({ state: "armed", generationId: "saved-take" }),
    );
    expect(hook.result.current.pathname).toBe("/library");
    expect(hook.result.current.status).toEqual({
      state: "unarmed",
      sessionId: "saved-session",
      generationId: "saved-take",
    });
  });
});
