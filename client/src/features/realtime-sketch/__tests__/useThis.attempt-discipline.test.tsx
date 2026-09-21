import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { act, renderHook } from "@testing-library/react";
import type { RenderHookResult } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { acceptLiveOutput } from "../api/acceptLiveOutput";
import { useAcceptLiveOutput } from "../hooks/useAcceptLiveOutput";
import type { LiveOutput } from "../hooks/generationReducer";

/**
 * Issue #129 — the live editor's acceptance needs the same attempt discipline
 * as the first-frame upload: one immutable attempt per press (the scoped
 * idempotency key bound to the accepted output), a newer press supersedes an
 * in-flight one, and a late response is applied only while its own attempt is
 * still current AND the editor that pressed is still on screen. The take
 * itself is durable server-side the moment the acceptance lands — dropping
 * the client-side application never drops the take.
 *
 * Reconciliation on return: the live editor keeps nothing (ADR-0017), so a
 * returning creator finds no acceptance state — but the attempt's identity
 * work is done by the key, and a re-press on the same picture replays the
 * same acceptance instead of minting a second take.
 *
 * Seam: the feature's `api/` module, the client's wire boundary.
 */

vi.mock("../api/acceptLiveOutput", () => ({
  acceptLiveOutput: vi.fn(),
}));

const acceptLiveOutputMock = vi.mocked(acceptLiveOutput);

function output(overrides: Partial<LiveOutput> & { requestId: string }): LiveOutput {
  return {
    imageUrl: `data:image/webp;base64,output-${overrides.requestId}`,
    at: 0,
    sketchDataUri: "data:image/jpeg;base64,drawing",
    inputs: { prompt: "a brass desk lamp", strength: 0.62, steps: 4, seed: 1 },
    ...overrides,
  };
}

const acceptanceResult = {
  sessionId: "session-new",
  promptVersionId: "v-root",
  generationId: "take-1",
  imageUrl: "https://storage.example.com/asset-1",
  createdSession: true,
};

/** Records where the router actually is, so tests can see a navigation. */
let currentPathname = "/";
function LocationProbe(): null {
  const location = useLocation();
  currentPathname = location.pathname;
  return null;
}

function renderAcceptance(): RenderHookResult<
  ReturnType<typeof useAcceptLiveOutput>,
  unknown
> {
  return renderHook(() => useAcceptLiveOutput(), {
    wrapper: ({ children }: { children: ReactNode }): ReactNode => (
      <MemoryRouter initialEntries={["/live"]}>
        <LocationProbe />
        {children}
      </MemoryRouter>
    ),
  });
}

describe("Use this attempt discipline (issue #129)", () => {
  beforeEach(() => {
    acceptLiveOutputMock.mockReset();
    currentPathname = "/live";
  });

  it("does not navigate a creator who has already left the editor", async () => {
    let settle!: (value: typeof acceptanceResult) => void;
    acceptLiveOutputMock.mockImplementation(
      () =>
        new Promise<typeof acceptanceResult>((resolve) => {
          settle = resolve;
        }),
    );

    const { result, unmount } = renderAcceptance();

    act(() => {
      result.current.accept(output({ requestId: "1" }));
    });
    expect(result.current.status.state).toBe("accepting");

    // The creator navigates away: the live editor unmounts.
    unmount();

    await act(async () => {
      settle(acceptanceResult);
    });

    // The acceptance happened server-side, but nobody is teleported into the
    // session they never asked to enter.
    expect(currentPathname).toBe("/live");
  });

  it("drops a superseded acceptance's late success instead of navigating twice", async () => {
    const settles: Array<(value: typeof acceptanceResult) => void> = [];
    acceptLiveOutputMock
      .mockImplementationOnce(
        () =>
          new Promise<typeof acceptanceResult>((resolve) => {
            settles.push(resolve);
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<typeof acceptanceResult>((resolve) => {
            settles.push(resolve);
          }),
      );

    const { result } = renderAcceptance();

    const first = output({ requestId: "1" });
    act(() => {
      result.current.accept(first);
    });
    // A newer press on a DIFFERENT output supersedes the in-flight attempt.
    const second = output({ requestId: "2" });
    act(() => {
      result.current.accept(second);
    });

    await act(async () => {
      settles[1]?.({ ...acceptanceResult, sessionId: "session-second" });
    });

    // The current acceptance applied — once.
    expect(currentPathname).toBe("/session/session-second");
    expect(result.current.status.state).toBe("idle");

    // …and the first acceptance's late success must not navigate again.
    await act(async () => {
      settles[0]?.({ ...acceptanceResult, sessionId: "session-first" });
    });
    expect(currentPathname).toBe("/session/session-second");
  });

  it("keeps the newer acceptance's in-flight status when the older one fails late", async () => {
    const settlements: Array<{
      resolve: (value: typeof acceptanceResult) => void;
      reject: (error: Error) => void;
    }> = [];
    acceptLiveOutputMock
      .mockImplementationOnce(
        () =>
          new Promise<typeof acceptanceResult>((_resolve, reject) => {
            settlements.push({ resolve: () => {}, reject });
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<typeof acceptanceResult>((resolve) => {
            settlements.push({
              resolve,
              reject: () => {},
            });
          }),
      );

    const { result } = renderAcceptance();

    act(() => {
      result.current.accept(output({ requestId: "1" }));
    });
    act(() => {
      result.current.accept(output({ requestId: "2" }));
    });

    // The older attempt's failure lands late: the newer press still owns the
    // surface, and its accepting state is not clobbered.
    await act(async () => {
      settlements[0]?.reject(new Error("older storage blip"));
    });
    expect(result.current.status.state).toBe("accepting");

    await act(async () => {
      settlements[1]?.resolve(acceptanceResult);
    });
    expect(result.current.status.state).toBe("idle");
  });

  it("mints a new attempt for a different output after a failure, not a replay", async () => {
    acceptLiveOutputMock
      .mockRejectedValueOnce(new Error("storage is unavailable"))
      .mockResolvedValueOnce(acceptanceResult);

    const { result } = renderAcceptance();

    act(() => {
      result.current.accept(output({ requestId: "1" }));
    });
    await act(async () => {});
    expect(result.current.status).toEqual({
      state: "failed",
      message: "storage is unavailable",
    });

    // The creator presses Use this on a DIFFERENT picture: a new acceptance —
    // its own key — never a replay of the failed one.
    act(() => {
      result.current.accept(output({ requestId: "2" }));
    });
    await act(async () => {});

    const keys = acceptLiveOutputMock.mock.calls.map(
      (call) => call[0].idempotencyKey,
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
    // Each key still names the output it was pressed for.
    expect(acceptLiveOutputMock.mock.calls[1]?.[0].liveOutputDataUri).toBe(
      "data:image/webp;base64,output-2",
    );
    expect(currentPathname).toBe("/session/session-new");
  });
});
