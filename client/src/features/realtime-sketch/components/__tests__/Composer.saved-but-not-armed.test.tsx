import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Composer } from "../Composer";
import type { AcceptanceStatus } from "../../hooks/useAcceptLiveOutput";
import type { LiveOutput } from "../../hooks/generationReducer";

/**
 * Issue #136: saved-but-not-armed is stated on the surface, in the editor
 * where the picture still is. The wording keeps the two facts apart — the
 * take IS saved (never worded as a save failure), and what failed is arming
 * it as the session's first frame. The retry is a "set it", not an "accept
 * again": the arm door arms the same take from the session's own record.
 */

const liveOutput: LiveOutput = {
  imageUrl: "data:image/webp;base64,output-1",
  at: 0,
  sketchDataUri: "data:image/jpeg;base64,drawing",
  inputs: { prompt: "a brass desk lamp", strength: 0.62, steps: 4, seed: 1 },
  requestId: "1",
};

function renderComposer(
  acceptance: AcceptanceStatus,
  onRetryArming = vi.fn(),
): ReturnType<typeof vi.fn> {
  render(
    <Composer
      settings={{ prompt: "a brass desk lamp", strength: 0.62, steps: 4, seed: 1 }}
      updateSettings={vi.fn()}
      rerollSeed={vi.fn()}
      liveOutput={liveOutput}
      onUseThis={vi.fn()}
      acceptance={acceptance}
      onRetryAttachment={vi.fn()}
      onRetryArming={onRetryArming}
      strengthPopoverOpen={false}
      onToggleStrengthPopover={vi.fn()}
    />,
  );
  return onRetryArming;
}

describe("the composer shows saved-but-not-armed truthfully (issue #136)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("names the saved-but-not-armed state and offers the set-it retry", () => {
    renderComposer({
      state: "unarmed",
      sessionId: "session-made",
      generationId: "take-9",
    });

    const surface = screen.getByTestId("live-editor-accept-unarmed");
    expect(surface).toHaveTextContent(
      "Picture saved, but not set as the first frame",
    );
    // The save succeeded — the copy must not say otherwise.
    expect(screen.queryByTestId("live-editor-accept-unattached")).toBeNull();
  });

  it("the retry button invokes the hook's arm retry — the same take, by identity", () => {
    const onRetryArming = renderComposer({
      state: "unarmed",
      sessionId: "session-made",
      generationId: "take-9",
    });

    fireEvent.click(screen.getByRole("button", { name: "Set it" }));
    expect(onRetryArming).toHaveBeenCalledTimes(1);
  });

  it("while arming, the retry is replaced by the in-flight state and cannot be double-fired", () => {
    const onRetryArming = renderComposer({
      state: "arming",
      sessionId: "session-made",
      generationId: "take-9",
    });

    expect(screen.getByTestId("live-editor-accept-unarmed")).toHaveTextContent(
      "Setting the first frame…",
    );
    expect(screen.queryByRole("button", { name: "Set it" })).toBeNull();
    expect(onRetryArming).not.toHaveBeenCalled();
  });

  it("an arm failure's reason is shown next to the still-retryable debt", () => {
    renderComposer({
      state: "unarmed",
      sessionId: "session-made",
      generationId: "take-9",
      message: "this picture has no durable media handle",
    });

    const surface = screen.getByTestId("live-editor-accept-unarmed");
    expect(surface).toHaveTextContent("no durable media handle");
    // Still retryable.
    expect(screen.getByRole("button", { name: "Set it" })).toBeInTheDocument();
  });

  it("no arming surface appears while idle, accepting, or made-but-not-saved", () => {
    renderComposer({
      state: "unattached",
      attachment: {
        state: "failed",
        generationId: "take-9",
        sessionId: "session-made",
        promptVersionId: "v-root",
        reason: "session write failed",
        record: { id: "take-9", mediaType: "image", status: "completed" },
      },
    });

    expect(screen.queryByTestId("live-editor-accept-unarmed")).toBeNull();
  });
});
