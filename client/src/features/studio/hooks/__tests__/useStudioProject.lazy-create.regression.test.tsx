import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioProject, StudioTurn } from "../../api/schemas";
import { useStudioProject } from "../useStudioProject";

/**
 * Regression (M2-era rough edge, fixed at M5): StrictMode double-mounts
 * the bootstrap effect in dev, and bootstrap used to create a project when
 * the account had none — so an empty account got TWO "Untitled" projects
 * on first visit.
 *
 * Invariant: bootstrap performs no writes. A projectless page creates its
 * project exactly once, on the first message send.
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
  createStudioProject,
  getStudioModels,
  getStudioTurn,
  listStudioProjects,
  listStudioTurns,
  runStudioTurn,
} from "../../api/studioApi";

const project: StudioProject = {
  id: "p-lazy",
  title: "Untitled",
  createdAtMs: 1,
  updatedAtMs: 1,
};

const decision = {
  action: "clarify" as const,
  questions: [{ text: "What is it for?", quickPicks: ["A", "B", "C"] }],
};

const clarifyTurn: StudioTurn = {
  id: "t1",
  projectId: "p-lazy",
  status: "complete",
  userMessage: "make me a logo",
  decision,
  calls: [],
  createdAtMs: 2,
  updatedAtMs: 2,
};

describe("regression: bootstrap never creates a project; first send creates exactly one", () => {
  beforeEach(() => {
    vi.mocked(listStudioProjects).mockResolvedValue([]);
    vi.mocked(getStudioModels).mockResolvedValue([]);
    vi.mocked(listStudioTurns).mockResolvedValue([]);
    vi.mocked(createStudioProject).mockResolvedValue(project);
    vi.mocked(runStudioTurn).mockResolvedValue({ turnId: "t1", decision });
    vi.mocked(getStudioTurn).mockResolvedValue(clarifyTurn);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("an empty account bootstraps projectless with no server writes", async () => {
    const { result } = renderHook(() => useStudioProject());

    await act(async () => {});

    expect(result.current.state.loading).toBe(false);
    expect(result.current.state.project).toBeNull();
    expect(createStudioProject).not.toHaveBeenCalled();
  });

  it("a StrictMode-style double mount still creates nothing", async () => {
    const first = renderHook(() => useStudioProject());
    first.unmount();
    const second = renderHook(() => useStudioProject());

    await act(async () => {});

    expect(createStudioProject).not.toHaveBeenCalled();
    expect(second.result.current.state.project).toBeNull();
  });

  it("the first send creates the project once and runs the turn on it", async () => {
    const { result } = renderHook(() => useStudioProject());
    await act(async () => {});

    await act(async () => {
      await result.current.sendMessage("make me a logo");
    });

    expect(createStudioProject).toHaveBeenCalledTimes(1);
    expect(runStudioTurn).toHaveBeenCalledWith(
      "p-lazy",
      "make me a logo",
      expect.objectContaining({ onThinkingDelta: expect.any(Function) }),
      [],
    );
    expect(result.current.state.project?.id).toBe("p-lazy");
    expect(result.current.state.projects.map((p) => p.id)).toContain("p-lazy");
    // The clarify turn landed in the thread of the freshly created project.
    expect(result.current.state.turns.map((t) => t.id)).toContain("t1");
  });
});
