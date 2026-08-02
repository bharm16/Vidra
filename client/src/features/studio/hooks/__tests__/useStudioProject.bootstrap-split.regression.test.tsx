import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioProject, StudioTurn } from "@features/studio/api/schemas";
import { useStudioProject } from "../useStudioProject";

/**
 * Regression (latent, found during M5 hardening): bootstrap fetched the
 * project data and the model roster in one Promise.all and reported them
 * with one action, so a /models failure rejected the pair and the Creator
 * lost their entire thread history to a 500 on an unrelated endpoint.
 *
 * Invariant: the roster and the open project settle independently. The
 * composer already degrades to Auto on an empty roster (behavior 9), so a
 * missing roster must never cost the Creator their thread.
 *
 * (The workspace opens the project the route names; listing moved to the
 * project index, so this now guards the roster against the project OPEN
 * rather than against a project list.)
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
  listStudioTurns,
} from "@features/studio/api/studioApi";

const project: StudioProject = {
  id: "p1",
  title: "Fox Logo",
  createdAtMs: 1,
  updatedAtMs: 1,
};

const turn: StudioTurn = {
  id: "t1",
  projectId: "p1",
  status: "complete",
  userMessage: "a fox logo",
  decision: {
    action: "generate",
    basePrompt: "a fox logo",
    variants: ["a", "b", "c", "d"],
    capability: "design",
    suggestions: ["s1", "s2", "s3"],
  },
  resolvedModel: "recraft-v4.1",
  calls: [],
  createdAtMs: 1,
  updatedAtMs: 1,
};

describe("regression: a failed roster fetch never blanks the open project", () => {
  beforeEach(() => {
    vi.mocked(getStudioProject).mockResolvedValue(project);
    vi.mocked(listStudioTurns).mockResolvedValue([turn]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the project and the thread when /models rejects", async () => {
    vi.mocked(getStudioModels).mockRejectedValue(new Error("models 500"));

    const { result } = renderHook(() => useStudioProject("p1"));
    await act(async () => {});

    expect(result.current.state.project?.id).toBe("p1");
    expect(result.current.state.turns.map((t) => t.id)).toEqual(["t1"]);
    // Empty roster is the composer's documented degraded mode, not a brick.
    expect(result.current.state.models).toEqual([]);
    expect(result.current.state.loading).toBe(false);
  });

  it("keeps the roster when opening the project rejects", async () => {
    vi.mocked(getStudioModels).mockResolvedValue([
      {
        slug: "recraft-v4.1",
        displayName: "Recraft V4.1",
        capabilities: ["design"],
        latencyHintSeconds: 6,
      },
    ]);
    vi.mocked(getStudioProject).mockRejectedValue(new Error("project 500"));

    const { result } = renderHook(() => useStudioProject("p1"));
    await act(async () => {});

    expect(result.current.state.models.map((m) => m.slug)).toEqual([
      "recraft-v4.1",
    ]);
    expect(result.current.state.error).toContain("project 500");
  });
});
