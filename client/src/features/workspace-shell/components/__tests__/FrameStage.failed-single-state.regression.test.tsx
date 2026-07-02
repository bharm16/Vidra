import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * Regression: the FrameStage failure beat is ONE designed state.
 *
 * 1. Failure boundary: UI component — FrameStage's failed branch.
 * 2. Mock boundary: PromptResultsActions context (the loop-stage input).
 *    FrameStage renders for real.
 * 3. Invariant: for any failed frame beat, the stage renders exactly one
 *    failure message and exactly one retry affordance — never a competing
 *    "No frame yet" placeholder beside the error copy.
 */

const dataState: {
  ideaBoxStage: {
    kind: string;
    message?: string;
    consecutiveFailures?: number;
  };
} = {
  ideaBoxStage: {
    kind: "failed",
    message: "Image generation failed",
    consecutiveFailures: 1,
  },
};

const onIdeaBoxRegenerate = vi.fn();

vi.mock(
  "@/features/prompt-optimizer/context/PromptResultsActionsContext",
  () => ({
    usePromptResultsData: () => ({
      ideaBoxStage: dataState.ideaBoxStage,
      isExpanding: false,
      hasExpandedPrompt: true,
    }),
    usePromptResultsActions: () => ({
      onIdeaBoxAccept: vi.fn(),
      onIdeaBoxRegenerate,
    }),
  }),
);

import { FrameStage } from "../FrameStage";

describe("regression: FrameStage failure beat renders one designed state", () => {
  it("shows exactly one failure message and no competing placeholder", () => {
    dataState.ideaBoxStage = {
      kind: "failed",
      message: "Image generation failed",
      consecutiveFailures: 1,
    };

    render(<FrameStage startFrame={null} prompt="a dog running" />);

    expect(screen.getAllByText(/Couldn.t create a frame/)).toHaveLength(1);
    expect(screen.getByText("Image generation failed")).toBeInTheDocument();
    // The old split state rendered "No frame yet" INSIDE the tile while the
    // error copy floated below it — the placeholder must not compete.
    expect(screen.queryByText("No frame yet")).toBeNull();
  });

  it("offers exactly one retry affordance, wired to frame regeneration", () => {
    dataState.ideaBoxStage = {
      kind: "failed",
      message: "Image generation failed",
      consecutiveFailures: 1,
    };
    onIdeaBoxRegenerate.mockClear();

    render(<FrameStage startFrame={null} prompt="a dog running" />);

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent("Try again");

    fireEvent.click(buttons[0] as HTMLElement);
    expect(onIdeaBoxRegenerate).toHaveBeenCalledTimes(1);
  });

  it("keeps the repeated-failure escalation copy in the single state", () => {
    dataState.ideaBoxStage = {
      kind: "failed",
      message: "Image generation failed",
      consecutiveFailures: 3,
    };

    render(<FrameStage startFrame={null} prompt="a dog running" />);

    expect(
      screen.getByText(/Still couldn.t create a frame/),
    ).toBeInTheDocument();
    expect(screen.getByText(/problem on our side/)).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
