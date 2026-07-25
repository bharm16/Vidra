import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { StudioTurn } from "@features/studio/api/schemas";
import { StudioThread } from "../StudioThread";

beforeAll(() => {
  // jsdom has no scrollIntoView; the thread auto-scrolls to the newest turn.
  Element.prototype.scrollIntoView = vi.fn();
});

/**
 * Behavior 8 (reference parity): a result turn shows the LLM's `thinking`
 * above the images — expanded by default, collapsible per turn — and
 * turns without thinking render no section at all.
 */

function makeTurn(overrides: Partial<StudioTurn> = {}): StudioTurn {
  return {
    id: "t1",
    projectId: "p1",
    status: "complete",
    userMessage: "a wordmark for Vidra",
    decision: {
      action: "generate",
      thinking:
        "The user wants a standalone wordmark — I'll generate a clean geometric sans-serif in white.",
      basePrompt: "Vidra wordmark, geometric sans-serif, white on dark",
      variants: ["a", "b", "c", "d"],
      capability: "design",
      suggestions: ["s1", "s2", "s3"],
    },
    resolvedModel: "recraft-v4.1",
    calls: [],
    createdAtMs: 1,
    updatedAtMs: 1,
    ...overrides,
  };
}

function renderThread(turn: StudioTurn) {
  render(
    <StudioThread
      turns={[turn]}
      optimisticMessage={null}
      streamingThinking={null}
      pendingTurnId={null}
      selectedImageId={null}
      error={null}
      onSelectImage={vi.fn()}
      onSendMessage={vi.fn()}
      onDismissError={vi.fn()}
    />,
  );
}

describe("StudioThread — thinking section", () => {
  it("shows the reasoning expanded by default and collapses on toggle", () => {
    renderThread(makeTurn());

    expect(
      screen.getByText(/standalone wordmark/, { exact: false }),
    ).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: /Thinking/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByText(/standalone wordmark/, { exact: false }),
    ).not.toBeInTheDocument();
  });

  it("renders no section when the decision carries no thinking", () => {
    const turn = makeTurn();
    if (turn.decision.action === "generate") {
      delete turn.decision.thinking;
    }
    renderThread(turn);

    expect(screen.queryByTestId("studio-thinking")).not.toBeInTheDocument();
  });

  it("shows thinking while the turn is still running", () => {
    renderThread(makeTurn({ status: "running" }));

    expect(screen.getByTestId("studio-thinking")).toBeInTheDocument();
  });
});
