import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioProject, StudioTurn } from "../../api/schemas";
import { useStudioProject } from "../useStudioProject";

/**
 * Regression (found live 2026-07-24, M3 verification): the server auto-
 * titled the project when the generation settled (behavior 8), but the UI
 * kept showing "Untitled" until a manual reload — the client never
 * refetched the project after a turn.
 *
 * Invariant: when a polled turn reaches a terminal status, the client's
 * project state reflects the server's project document (title included)
 * without a reload.
 */

vi.mock("../../api/studioApi", () => ({
  createStudioProject: vi.fn(),
  getStudioModels: vi.fn(),
  getStudioProject: vi.fn(),
  getStudioTurn: vi.fn(),
  listStudioProjects: vi.fn(),
  listStudioTurns: vi.fn(),
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
} from "../../api/studioApi";

const untitled: StudioProject = {
  id: "p1",
  title: "Untitled",
  createdAtMs: 1,
  updatedAtMs: 1,
};

const titled: StudioProject = {
  ...untitled,
  title: "Minimalist Fox Logo",
  updatedAtMs: 2,
};

const decision = {
  action: "generate" as const,
  basePrompt: "minimal fox logo",
  variants: ["v1", "v2", "v3", "v4"],
  capability: "design",
  suggestions: ["s1", "s2", "s3"],
  title: "Minimalist Fox Logo",
};

const runningTurn: StudioTurn = {
  id: "t1",
  projectId: "p1",
  status: "running",
  userMessage: "a fox logo",
  decision,
  resolvedModel: "recraft-v4.1",
  calls: [],
  createdAtMs: 1,
  updatedAtMs: 1,
};

const completeTurn: StudioTurn = {
  ...runningTurn,
  status: "complete",
  updatedAtMs: 2,
};

describe("regression: settled turns sync the project header without a reload", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(getStudioModels).mockResolvedValue([]);
    vi.mocked(listStudioTurns).mockResolvedValue([]);
    vi.mocked(runStudioTurn).mockResolvedValue({ turnId: "t1", decision });
    vi.mocked(getStudioTurn)
      .mockResolvedValueOnce(runningTurn) // turnAccepted fetch
      .mockResolvedValue(completeTurn); // poll settles
    vi.mocked(getStudioProject)
      .mockResolvedValueOnce(untitled) // bootstrap opens it Untitled
      .mockResolvedValue(titled); // the settled turn's refetch
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("adopts the server's auto-title when the polled turn settles", async () => {
    const { result } = renderHook(() => useStudioProject("p1"));

    // Bootstrap opens the Untitled project (promise flushes, no timers).
    await act(async () => {});
    expect(result.current.state.project?.id).toBe("p1");
    expect(result.current.state.project?.title).toBe("Untitled");

    await act(async () => {
      await result.current.sendMessage("a fox logo");
    });

    // One poll tick: the turn settles and the project is refetched.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    // Flush the poll's promise chain (turn fetch → project fetch).
    await act(async () => {});

    expect(result.current.state.project?.title).toBe("Minimalist Fox Logo");
    expect(getStudioProject).toHaveBeenCalledWith("p1");
  });
});
