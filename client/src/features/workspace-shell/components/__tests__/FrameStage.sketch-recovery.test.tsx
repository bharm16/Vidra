import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FrameStage } from "../FrameStage";
const actions = vi.hoisted(() => ({ retry: vi.fn(), regenerate: vi.fn() }));
vi.mock(
  "@/features/prompt-optimizer/context/PromptResultsActionsContext",
  () => ({
    usePromptResultsData: () => ({
      hasExpandedPrompt: true,
      unattachedFrameTake: {
        state: "failed",
        generationId: "take-1",
        sessionId: "session-1",
        promptVersionId: "v1",
      },
    }),
    usePromptResultsActions: () => ({
      onRetryFrameAttachment: actions.retry,
      onIdeaBoxRegenerate: actions.regenerate,
    }),
  }),
);
describe("reloaded session with an unresolved sketch acceptance", () => {
  it("offers saving the existing picture rather than creating a replacement", () => {
    render(<FrameStage startFrame={null} prompt="A lighthouse" />);
    expect(screen.getByText("Made, but not saved")).toBeInTheDocument();
    expect(screen.queryByText("No frame yet")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create frame" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save it" }));
    expect(actions.retry).toHaveBeenCalledTimes(1);
    expect(actions.regenerate).not.toHaveBeenCalled();
  });
});
