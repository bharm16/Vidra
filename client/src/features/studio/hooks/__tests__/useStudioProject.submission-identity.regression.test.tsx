import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioProject, StudioTurn } from "@features/studio/api/schemas";
import { useStudioProject } from "../useStudioProject";

/**
 * Issue #115 — the studio client stamps every turn submission with a stable
 * identity and the selection/pin captured at submit time.
 *
 * The identity is what lets a retry converge on one turn: it is baked into the
 * request body once, so the auth transport's single POST re-send after a 401
 * sign-in carries the same one (AuthRetryTransport re-sends the same init —
 * covered by its own test). The selection and pin travel WITH the submission so
 * a change made in another tab between the press and the decision cannot alter
 * this turn.
 *
 * Invariant: sendMessage hands runStudioTurn a submission whose id is fresh per
 * deliberate send, and whose selection/pin are the ones on the record when the
 * creator pressed send.
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
  listStudioTurns,
  runStudioTurn,
  updateStudioProject,
} from "@features/studio/api/studioApi";

const project: StudioProject = {
  id: "p1",
  title: "Fox Logo",
  createdAtMs: 1,
  updatedAtMs: 1,
  // The state a creator built up before this send: a pinned model and a
  // selected image, both persisted on the project.
  pinnedModel: "recraft-v4.1-pro",
  selectedImageId: "img-a",
};

const generateDecision = {
  action: "generate" as const,
  basePrompt: "a fox logo",
  variants: ["a", "b", "c", "d"],
  capability: "design",
  suggestions: ["s1", "s2", "s3"],
};

const runningTurn = (id: string): StudioTurn => ({
  id,
  projectId: "p1",
  status: "running",
  userMessage: "a fox logo",
  decision: generateDecision,
  resolvedModel: "recraft-v4.1-pro",
  calls: [{ index: 0, status: "running" }],
  createdAtMs: 1,
  updatedAtMs: 1,
});

const completeTurn = (id: string): StudioTurn => ({
  ...runningTurn(id),
  status: "complete",
  calls: [{ index: 0, status: "succeeded", image: undefined }],
});

interface SubmissionArg {
  submissionId: string;
  selectedImageId: string | null;
  pinnedModel: string | null;
}

function submissionOf(callIndex: number): SubmissionArg {
  return vi.mocked(runStudioTurn).mock.calls[callIndex]?.[2] as SubmissionArg;
}

describe("regression: turn submissions carry a captured identity (#115)", () => {
  beforeEach(() => {
    vi.mocked(getStudioProject).mockResolvedValue(project);
    vi.mocked(getStudioModels).mockResolvedValue([]);
    vi.mocked(listStudioTurns).mockResolvedValue([]);
    vi.mocked(updateStudioProject).mockResolvedValue(project);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("captures the selection and pin as they were at submit time, with a fresh id", async () => {
    vi.mocked(runStudioTurn).mockResolvedValue({
      turnId: "t1",
      decision: generateDecision,
    });
    vi.mocked(getStudioTurn).mockResolvedValue(runningTurn("t1"));

    const { result } = renderHook(() => useStudioProject("p1"));
    await act(async () => {});
    expect(result.current.state.project?.id).toBe("p1");

    await act(async () => {
      await result.current.sendMessage("a fox logo");
    });

    expect(runStudioTurn).toHaveBeenCalledTimes(1);
    const submission = submissionOf(0);
    expect(submission.submissionId).toEqual(expect.any(String));
    expect(submission.submissionId.length).toBeGreaterThan(0);
    // The values the creator saw when they pressed send.
    expect(submission.selectedImageId).toBe("img-a");
    expect(submission.pinnedModel).toBe("recraft-v4.1-pro");
  });

  it("mints a fresh identity for each deliberate send", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(runStudioTurn)
        .mockResolvedValueOnce({ turnId: "t1", decision: generateDecision })
        .mockResolvedValueOnce({ turnId: "t2", decision: generateDecision });
      // The first turn settles so the in-flight guard releases before send #2.
      vi.mocked(getStudioTurn)
        .mockResolvedValueOnce(runningTurn("t1"))
        .mockResolvedValue(completeTurn("t1"));

      const { result } = renderHook(() => useStudioProject("p1"));
      await act(async () => {});

      await act(async () => {
        await result.current.sendMessage("a fox logo");
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      await act(async () => {
        await result.current.sendMessage("a fox logo");
      });

      expect(runStudioTurn).toHaveBeenCalledTimes(2);
      // Same words, but a deliberate resubmit is a NEW submission — two ids,
      // which the server turns into two turns (its own #115 test).
      expect(submissionOf(0).submissionId).not.toBe(
        submissionOf(1).submissionId,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
