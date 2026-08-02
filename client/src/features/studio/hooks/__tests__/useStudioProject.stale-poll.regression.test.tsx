import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioProject, StudioTurn } from "@features/studio/api/schemas";
import { useStudioProject } from "../useStudioProject";

/**
 * Regression (latent, found during M5 hardening): the poll effect cleared
 * its interval on teardown but never cancelled the request already in
 * flight. Opening another project mid-poll let the resolved getStudioTurn
 * dispatch turnPolled for the OLD project — and mergeTurn appends unknown
 * ids by design, so the abandoned turn landed in the newly-opened thread.
 *
 * Invariant: an async result is only applied to the project it was issued
 * for; a project switch mid-flight drops it.
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
  runStudioTurn: vi.fn(),
  updateStudioProject: vi.fn(),
}));

import {
  getStudioModels,
  getStudioProject,
  getStudioTurn,
  listStudioProjects,
  listStudioTurns,
  runStudioTurn,
} from "@features/studio/api/studioApi";

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

const decision = {
  action: "generate" as const,
  basePrompt: "a fox logo",
  variants: ["a", "b", "c", "d"],
  capability: "design",
  suggestions: ["s1", "s2", "s3"],
};

const runningTurn: StudioTurn = {
  id: "t1",
  projectId: "p-a",
  status: "running",
  userMessage: "a fox logo",
  decision,
  resolvedModel: "recraft-v4.1",
  calls: [{ index: 0, status: "running" }],
  createdAtMs: 2,
  updatedAtMs: 2,
};

const completeTurn: StudioTurn = {
  ...runningTurn,
  status: "complete",
  updatedAtMs: 3,
};

describe("regression: a poll that resolves after a project switch is dropped", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(listStudioProjects).mockResolvedValue([projectA, projectB]);
    vi.mocked(getStudioModels).mockResolvedValue([]);
    vi.mocked(listStudioTurns).mockResolvedValue([]);
    vi.mocked(runStudioTurn).mockResolvedValue({ turnId: "t1", decision });
    // The workspace opens whichever project the route names.
    vi.mocked(getStudioProject).mockImplementation((projectId: string) =>
      Promise.resolve(projectId === "p-b" ? projectB : projectA),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("does not add the abandoned turn to the newly-opened thread", async () => {
    // The turnAccepted fetch resolves immediately; the poll below stays in
    // flight until the test settles it by hand.
    let settlePoll!: (turn: StudioTurn) => void;
    vi.mocked(getStudioTurn)
      .mockResolvedValueOnce(runningTurn)
      .mockImplementationOnce(
        () =>
          new Promise<StudioTurn>((resolve) => {
            settlePoll = resolve;
          }),
      );

    // Switching projects is a route change: the same hook, re-rendered with
    // the id the new URL names.
    const { result, rerender } = renderHook(
      (projectId: string) => useStudioProject(projectId),
      { initialProps: "p-a" },
    );
    await act(async () => {});
    expect(result.current.state.project?.id).toBe("p-a");

    await act(async () => {
      await result.current.sendMessage("a fox logo");
    });
    expect(result.current.state.pendingTurnId).toBe("t1");

    // One tick issues the poll for project A; it has not resolved yet.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    // The Creator navigates to another project while that poll is in flight.
    await act(async () => {
      rerender("p-b");
    });
    expect(result.current.state.project?.id).toBe("p-b");
    expect(result.current.state.turns).toEqual([]);

    // Opening B legitimately reads B's doc; anything the stale settle adds
    // on top of this count would be A's doc landing over B.
    const readsAfterSwitch = vi.mocked(getStudioProject).mock.calls.length;

    // Project A's poll lands now — into project B's open workspace.
    await act(async () => {
      settlePoll(completeTurn);
    });

    expect(result.current.state.project?.id).toBe("p-b");
    expect(result.current.state.turns).toEqual([]);
    // The stale settle must not refetch A's project doc over B either.
    expect(vi.mocked(getStudioProject).mock.calls.length).toBe(
      readsAfterSwitch,
    );
  });
});
