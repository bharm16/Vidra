import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioProject, StudioTurn } from "@features/studio/api/schemas";
import { useStudioProject } from "../useStudioProject";

/**
 * Regression: consecutive edits never compounded. The policy engine edits
 * the SELECTED image (template rule 7), and selection only ever moved on an
 * explicit click — so after "make the fox navy" the selection still pointed
 * at the original mark, and "make the navy fox green" re-edited the
 * original. Absolute recolors masked it; a relative edit ("tail tip cream")
 * came back on the original's colors while the user was looking at the
 * latest result.
 *
 * Invariant: when a refinement turn (edit/transform) settles with a
 * produced image, the working selection advances to that image — locally
 * and persisted, since the next turn's policy context reads the stored
 * selection. A generate turn fans out options and never moves selection.
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
  updateStudioProject,
} from "@features/studio/api/studioApi";

const project: StudioProject = {
  id: "p-1",
  title: "Fox Logo",
  createdAtMs: 1,
  updatedAtMs: 1,
  selectedImageId: "original-mark",
};

const editDecision = {
  action: "edit" as const,
  instruction: "Recolor the tail tip to cream.",
  sourceImageIds: ["original-mark"],
  suggestions: [],
};

const runningEditTurn: StudioTurn = {
  id: "t-edit",
  projectId: "p-1",
  status: "running",
  userMessage: "Make the tail tip cream",
  decision: editDecision,
  resolvedModel: "nano-banana-2",
  calls: [{ index: 0, status: "running" }],
  createdAtMs: 2,
  updatedAtMs: 2,
};

const completeEditTurn: StudioTurn = {
  ...runningEditTurn,
  status: "complete",
  updatedAtMs: 3,
  calls: [
    {
      index: 0,
      status: "succeeded",
      image: {
        id: "edit-result",
        storagePath: "studio/p-1/edit-result.png",
        sourcePrompt: "Recolor the tail tip to cream.",
        model: "nano-banana-2",
      },
    },
  ],
};

const generateDecision = {
  action: "generate" as const,
  basePrompt: "a fox logo",
  variants: ["a", "b"],
  capability: "design",
  suggestions: [],
};

const completeGenerateTurn: StudioTurn = {
  id: "t-gen",
  projectId: "p-1",
  status: "complete",
  userMessage: "more fox options",
  decision: generateDecision,
  resolvedModel: "recraft-v4.1",
  calls: [
    {
      index: 0,
      status: "succeeded",
      image: {
        id: "variant-a",
        storagePath: "studio/p-1/variant-a.png",
        sourcePrompt: "a fox logo",
        model: "recraft-v4.1",
      },
    },
  ],
  createdAtMs: 4,
  updatedAtMs: 5,
};

async function bootstrapAndSend(turnId: string): Promise<{
  result: { current: ReturnType<typeof useStudioProject> };
}> {
  const { result } = renderHook(() => useStudioProject("p-1"));
  await act(async () => {});
  expect(result.current.state.project?.id).toBe("p-1");

  vi.mocked(runStudioTurn).mockResolvedValue({
    turnId,
    decision: editDecision,
  });
  await act(async () => {
    await result.current.sendMessage("go");
  });
  return { result };
}

describe("regression: refinement turns advance the working selection to their result", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(getStudioProject).mockResolvedValue(project);
    vi.mocked(getStudioModels).mockResolvedValue([]);
    vi.mocked(listStudioTurns).mockResolvedValue([]);
    vi.mocked(getStudioProject).mockResolvedValue(project);
    vi.mocked(updateStudioProject).mockResolvedValue(project);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("a settled edit moves selection to the produced image and persists it", async () => {
    vi.mocked(getStudioTurn)
      .mockResolvedValueOnce(runningEditTurn)
      .mockResolvedValue(completeEditTurn);

    const { result } = await bootstrapAndSend("t-edit");
    expect(result.current.state.selectedImageId).toBe("original-mark");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(result.current.state.selectedImageId).toBe("edit-result");
    expect(updateStudioProject).toHaveBeenCalledWith("p-1", {
      selectedImageId: "edit-result",
    });
  });

  it("a settled generate leaves the selection where the user put it", async () => {
    vi.mocked(getStudioTurn)
      .mockResolvedValueOnce({ ...completeGenerateTurn, status: "running" })
      .mockResolvedValue(completeGenerateTurn);

    const { result } = await bootstrapAndSend("t-gen");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(result.current.state.selectedImageId).toBe("original-mark");
    expect(updateStudioProject).not.toHaveBeenCalledWith("p-1", {
      selectedImageId: "variant-a",
    });
  });
});
