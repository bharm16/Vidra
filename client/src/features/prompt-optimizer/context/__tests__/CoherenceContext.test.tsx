/**
 * The coherence seam.
 *
 * These ten values used to reach the panel by travelling workspace hook →
 * PromptResultsActionsProvider → PromptResultsSection → PromptCanvasProps →
 * useCanvasCoherence → viewProps → PromptCanvasView, optional at every hop and
 * with no test anywhere on the path. The context replaced the tunnel, so this
 * pins both halves of its contract: a provided value reaches a consumer intact,
 * and a consumer outside a provider reads an inert value instead of crashing.
 */
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import {
  CoherenceProvider,
  useCoherence,
  type CoherenceContextValue,
} from "../CoherenceContext";
import type { CoherenceIssue } from "@features/prompt-optimizer/components/coherence/useCoherenceAnnotations";

const issue = (id: string, message: string): CoherenceIssue => ({
  id,
  type: "conflict",
  severity: "high",
  message,
  reasoning: "the lighting and the time of day disagree",
  involvedSpanIds: ["span-1"],
  recommendations: [],
  spans: [],
  dismissed: false,
});

const buildValue = (
  overrides: Partial<CoherenceContextValue> = {},
): CoherenceContextValue => ({
  issues: [],
  isChecking: false,
  isPanelExpanded: true,
  onTogglePanelExpanded: vi.fn(),
  onDismissIssue: vi.fn(),
  onDismissAll: vi.fn(),
  onApplyFix: vi.fn(),
  onScrollToSpan: vi.fn(),
  affectedSpanIds: new Set<string>(),
  spanIssueMap: new Map<string, "conflict" | "harmonization">(),
  ...overrides,
});

/** Mirrors how PromptCanvasView and the span markers read the context. */
function Consumer(): React.ReactElement {
  const coherence = useCoherence();
  return (
    <div>
      <span data-testid="issue-count">{coherence.issues.length}</span>
      <span data-testid="checking">{String(coherence.isChecking)}</span>
      <span data-testid="expanded">{String(coherence.isPanelExpanded)}</span>
      <span data-testid="affected">{coherence.affectedSpanIds.size}</span>
      <span data-testid="markers">{coherence.spanIssueMap.size}</span>
      <button onClick={() => coherence.onDismissIssue("issue-1")}>
        dismiss
      </button>
      {coherence.issues.map((item) => (
        <p key={item.id}>{item.message}</p>
      ))}
    </div>
  );
}

describe("CoherenceContext", () => {
  it("delivers provided coherence state to a consumer", () => {
    render(
      <CoherenceProvider
        value={buildValue({
          issues: [issue("issue-1", "golden hour conflicts with midnight")],
          isChecking: true,
          affectedSpanIds: new Set(["span-1"]),
          spanIssueMap: new Map([["span-1", "conflict" as const]]),
        })}
      >
        <Consumer />
      </CoherenceProvider>,
    );

    expect(screen.getByTestId("issue-count")).toHaveTextContent("1");
    expect(screen.getByTestId("checking")).toHaveTextContent("true");
    expect(screen.getByTestId("expanded")).toHaveTextContent("true");
    expect(screen.getByTestId("affected")).toHaveTextContent("1");
    expect(screen.getByTestId("markers")).toHaveTextContent("1");
    expect(
      screen.getByText("golden hour conflicts with midnight"),
    ).toBeInTheDocument();
  });

  it("routes an action back to the provided handler", () => {
    const onDismissIssue = vi.fn();
    render(
      <CoherenceProvider value={buildValue({ onDismissIssue })}>
        <Consumer />
      </CoherenceProvider>,
    );

    screen.getByRole("button", { name: "dismiss" }).click();

    expect(onDismissIssue).toHaveBeenCalledWith("issue-1");
  });

  // The canvas also renders on surfaces with no coherence producer, which is why
  // the fallback is inert rather than a throw.
  it("reads an inert value outside a provider", () => {
    render(<Consumer />);

    expect(screen.getByTestId("issue-count")).toHaveTextContent("0");
    expect(screen.getByTestId("checking")).toHaveTextContent("false");
    expect(screen.getByTestId("affected")).toHaveTextContent("0");
    expect(() =>
      screen.getByRole("button", { name: "dismiss" }).click(),
    ).not.toThrow();
  });
});
