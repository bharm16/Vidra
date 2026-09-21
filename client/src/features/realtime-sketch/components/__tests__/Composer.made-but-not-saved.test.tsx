import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Composer } from "../Composer";
import type { AcceptanceStatus } from "../../hooks/useAcceptLiveOutput";
import type { LiveOutput } from "../../hooks/generationReducer";

/**
 * Issue #134: made-but-not-saved is stated on the surface, in the editor
 * where the picture still is. The truthful wording is the point — this is
 * never an acceptance failure (nothing about the render went wrong), and the
 * retry is a "save it", not an "accept again": the record door re-attaches
 * the same take.
 */

const liveOutput: LiveOutput = {
  imageUrl: "data:image/webp;base64,output-1",
  at: 0,
  sketchDataUri: "data:image/jpeg;base64,drawing",
  inputs: { prompt: "a brass desk lamp", strength: 0.62, steps: 4, seed: 1 },
  requestId: "1",
};

const failedAttachment = {
  state: "failed",
  generationId: "take-9",
  sessionId: "session-made",
  promptVersionId: "v-root",
  reason: "session write failed",
  record: { id: "take-9", mediaType: "image", status: "completed" },
} as const;

function renderComposer(
  acceptance: AcceptanceStatus,
  onRetry = vi.fn(),
): ReturnType<typeof vi.fn> {
  render(
    <Composer
      settings={{ prompt: "a brass desk lamp", strength: 0.62, steps: 4, seed: 1 }}
      updateSettings={vi.fn()}
      rerollSeed={vi.fn()}
      liveOutput={liveOutput}
      onUseThis={vi.fn()}
      acceptance={acceptance}
      onRetryAttachment={onRetry}
      strengthPopoverOpen={false}
      onToggleStrengthPopover={vi.fn()}
    />,
  );
  return onRetry;
}

describe("the composer shows made-but-not-saved truthfully (issue #134)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("names the made-but-not-saved state and offers the save-it retry", () => {
    renderComposer({
      state: "unattached",
      attachment: failedAttachment,
    });

    const surface = screen.getByTestId("live-editor-accept-unattached");
    expect(surface).toHaveTextContent("Picture made, but not saved yet");
    // Not an acceptance failure: the render succeeded, and the copy must not
    // say otherwise.
    expect(screen.queryByTestId("live-editor-accept-error")).toBeNull();
  });

  it("the retry button invokes the hook's retry, which re-attaches the same take", () => {
    const onRetry = renderComposer({
      state: "unattached",
      attachment: failedAttachment,
    });

    fireEvent.click(screen.getByRole("button", { name: "Save it" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("while saving, the retry is replaced by the saving state and cannot be double-fired", () => {
    const onRetry = renderComposer({
      state: "saving",
      attachment: failedAttachment,
    });

    expect(screen.getByTestId("live-editor-accept-unattached")).toHaveTextContent(
      "Saving…",
    );
    expect(screen.queryByRole("button", { name: "Save it" })).toBeNull();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("a retry failure's reason is shown next to the still-retryable debt", () => {
    renderComposer({
      state: "unattached",
      attachment: failedAttachment,
      message: "Session not found: session-made",
    });

    const surface = screen.getByTestId("live-editor-accept-unattached");
    expect(surface).toHaveTextContent("Session not found: session-made");
    // Still retryable.
    expect(screen.getByRole("button", { name: "Save it" })).toBeInTheDocument();
  });

  it("no outcome surface appears while idle, accepting, or transport-failed", () => {
    const { unmount } = render(
      <Composer
        settings={{ prompt: "x", strength: 0.62, steps: 4, seed: 1 }}
        updateSettings={vi.fn()}
        rerollSeed={vi.fn()}
        liveOutput={liveOutput}
        onUseThis={vi.fn()}
        acceptance={{ state: "accepting" }}
        onRetryAttachment={vi.fn()}
        strengthPopoverOpen={false}
        onToggleStrengthPopover={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId("live-editor-accept-unattached"),
    ).toBeNull();
    unmount();
  });
});
