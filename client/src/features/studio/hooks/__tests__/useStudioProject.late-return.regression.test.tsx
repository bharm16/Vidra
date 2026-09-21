import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioProject } from "@features/studio/api/schemas";
import type { UseInSessionOutcome } from "@features/studio/api/studioApi";
import { useStudioProject } from "../useStudioProject";

/**
 * Regression for issue #129 — the studio return needs the same attempt
 * discipline as the first-frame upload: the return is ONE attempt, bound to
 * the project and image it was pressed under, and a settle that lands after
 * the creator opened another project is not applied to it. The attempt stays
 * replayable: pressing again on the same project and image carries the SAME
 * identity, which the server (which de-duplicates the pair into one take)
 * replays — that is the reconciliation when the creator returns. A different
 * selection is a different attempt.
 *
 * Invariant, matching the stale-poll rule this hook already keeps: an async
 * result is only applied to the project it was issued for.
 */

vi.mock("@features/studio/api/studioApi", () => ({
  createStudioProject: vi.fn(),
  deleteStudioProject: vi.fn(),
  getStudioModels: vi.fn(),
  getStudioProject: vi.fn(),
  getStudioTurn: vi.fn(),
  listStudioProjects: vi.fn(),
  listStudioTurns: vi.fn(),
  registerStudioAttachment: vi.fn(),
  returnStudioImageToSession: vi.fn(),
  runStudioTurn: vi.fn(),
  updateStudioProject: vi.fn(),
  uploadStudioAttachment: vi.fn(),
}));

import {
  getStudioModels,
  getStudioProject,
  listStudioTurns,
  returnStudioImageToSession,
  updateStudioProject,
} from "@features/studio/api/studioApi";

const returnMock = vi.mocked(returnStudioImageToSession);

const projectA: StudioProject = {
  id: "p-a",
  title: "Fox Logo",
  createdAtMs: 2,
  updatedAtMs: 2,
};

const projectB: StudioProject = {
  id: "p-b",
  title: "Wordmark",
  createdAtMs: 1,
  updatedAtMs: 1,
};

describe("regression #129: a return that settles after a project switch", () => {
  beforeEach(() => {
    vi.mocked(getStudioModels).mockResolvedValue([]);
    vi.mocked(listStudioTurns).mockResolvedValue([]);
    vi.mocked(getStudioProject).mockImplementation((projectId: string) =>
      Promise.resolve(projectId === "p-b" ? projectB : projectA),
    );
    vi.mocked(updateStudioProject).mockImplementation((projectId: string) =>
      Promise.resolve(projectId === "p-b" ? projectB : projectA),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("is not dispatched into the newly-opened project's error band", async () => {
    let settleReturn!: (outcome: UseInSessionOutcome) => void;
    returnMock.mockImplementationOnce(
      () =>
        new Promise<UseInSessionOutcome>((resolve) => {
          settleReturn = resolve;
        }),
    );

    const { result, rerender } = renderHook(
      (projectId: string) => useStudioProject(projectId),
      { initialProps: "p-a" },
    );
    await act(async () => {});
    act(() => {
      result.current.selectImage("img-1");
    });

    let outcome!: Promise<UseInSessionOutcome>;
    await act(async () => {
      outcome = result.current.returnImageToSession();
    });
    expect(returnMock).toHaveBeenCalledWith(
      "p-a",
      "img-1",
      undefined,
    );

    // The creator opens another project while the return is in flight…
    rerender("p-b");
    await act(async () => {});
    expect(result.current.state.project?.id).toBe("p-b");

    // …and the return then FAILS. The failure is real, and it is returned to
    // the caller — but it must not light up project B's error band.
    await act(async () => {
      settleReturn({ state: "error", message: "storage unavailable" });
    });
    const settled = await outcome;
    expect(settled).toEqual({ state: "error", message: "storage unavailable" });
    expect(result.current.state.error).toBeNull();
  });

  it("stays replayable: back on the project, the same press carries the same identity", async () => {
    returnMock
      .mockImplementationOnce(
        () =>
          new Promise<UseInSessionOutcome>(() => {
            // The first press's response never lands — the creator left.
          }),
      )
      .mockResolvedValueOnce({
        state: "returned",
        result: {
          sessionId: "session-1",
          promptVersionId: "v1",
          generationId: "take-1",
          imageUrl: "https://storage.example.com/returned",
          ancestorGenerationId: null,
          createdSession: false,
        },
      });

    const { result, rerender } = renderHook(
      (projectId: string) => useStudioProject(projectId),
      { initialProps: "p-a" },
    );
    await act(async () => {});
    act(() => {
      result.current.selectImage("img-1");
    });

    await act(async () => {
      void result.current.returnImageToSession();
    });

    // The creator returns to the project and presses again: the SAME project
    // and image travel — the server de-duplicates the pair into one take, so
    // this replay is the reconciliation, never a second attempt.
    rerender("p-a");
    await act(async () => {});

    await act(async () => {
      await result.current.returnImageToSession();
    });

    expect(returnMock).toHaveBeenCalledTimes(2);
    expect(returnMock.mock.calls[0]?.slice(0, 2)).toEqual(
      returnMock.mock.calls[1]?.slice(0, 2),
    );
    expect(returnMock.mock.calls[1]?.[0]).toBe("p-a");
    expect(returnMock.mock.calls[1]?.[1]).toBe("img-1");
  });

  it("is applied when the project never changed — the honest control", async () => {
    returnMock.mockResolvedValueOnce({
      state: "error",
      message: "storage unavailable",
    });

    const { result } = renderHook(
      (projectId: string) => useStudioProject(projectId),
      { initialProps: "p-a" },
    );
    await act(async () => {});
    act(() => {
      result.current.selectImage("img-1");
    });

    await act(async () => {
      await result.current.returnImageToSession();
    });

    // Without a project switch the failure lands where it belongs.
    expect(result.current.state.error).toBe("storage unavailable");
  });

  it("treats a different selection after a failure as a new attempt, not a replay", async () => {
    returnMock
      .mockResolvedValueOnce({ state: "error", message: "storage unavailable" })
      .mockResolvedValueOnce({
        state: "returned",
        result: {
          sessionId: "session-1",
          promptVersionId: "v1",
          generationId: "take-2",
          imageUrl: "https://storage.example.com/returned",
          ancestorGenerationId: null,
          createdSession: false,
        },
      });

    const { result } = renderHook(
      (projectId: string) => useStudioProject(projectId),
      { initialProps: "p-a" },
    );
    await act(async () => {});
    act(() => {
      result.current.selectImage("img-1");
    });

    await act(async () => {
      await result.current.returnImageToSession();
    });
    expect(result.current.state.error).toBe("storage unavailable");

    // The creator selects a DIFFERENT image and presses again: the new
    // selection is what travels — a new acceptance, never a replay of the
    // failed one.
    act(() => {
      result.current.selectImage("img-2");
    });
    await act(async () => {
      await result.current.returnImageToSession();
    });

    expect(returnMock).toHaveBeenCalledTimes(2);
    expect(returnMock.mock.calls[0]?.[1]).toBe("img-1");
    expect(returnMock.mock.calls[1]?.[1]).toBe("img-2");
  });
});
