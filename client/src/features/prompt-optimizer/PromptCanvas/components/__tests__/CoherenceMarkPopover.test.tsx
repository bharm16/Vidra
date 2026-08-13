/**
 * The surface that explains a coherence mark.
 *
 * The editor underlines contradicting spans on both layout branches, but the
 * panel that explains them is unreachable in the canvas-first layout — a
 * creator saw wavy marks with nothing saying why. This popover closes that gap
 * from the mark itself: hover the marked span, read the issue, apply the fix
 * or dismiss it.
 *
 * Hover, never click: clicking a highlighted span is the click-to-enhance
 * entry point — the core authoring loop — and the popover must not sit in
 * front of it.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  CoherenceMarkPopover,
  findIssueForSpan,
} from "../CoherenceMarkPopover";
import {
  CoherenceProvider,
  type CoherenceContextValue,
} from "@features/prompt-optimizer/context/CoherenceContext";
import type { CoherenceIssue } from "@features/prompt-optimizer/components/coherence/useCoherenceAnnotations";

const issue = (overrides: Partial<CoherenceIssue> = {}): CoherenceIssue => ({
  id: "issue-1",
  type: "conflict",
  severity: "high",
  message: "golden hour conflicts with midnight",
  reasoning: "The lighting and the time of day disagree.",
  involvedSpanIds: ["span-1"],
  recommendations: [
    {
      id: "rec-1",
      title: "Change the time to dusk",
      rationale: "Dusk keeps the warm light and resolves the conflict.",
      edits: [],
    },
  ],
  spans: [],
  dismissed: false,
  ...overrides,
});

const buildValue = (
  overrides: Partial<CoherenceContextValue> = {},
): CoherenceContextValue => ({
  issues: [issue()],
  isChecking: false,
  isPanelExpanded: false,
  onTogglePanelExpanded: vi.fn(),
  onDismissIssue: vi.fn(),
  onDismissAll: vi.fn(),
  onApplyFix: vi.fn(),
  onScrollToSpan: vi.fn(),
  affectedSpanIds: new Set(["span-1"]),
  spanIssueMap: new Map([["span-1", "conflict" as const]]),
  ...overrides,
});

/** An editor stub with one marked span, matching what the markers hook stamps. */
function Harness({
  value,
}: {
  value: CoherenceContextValue;
}): React.ReactElement {
  const editorRef = React.useRef<HTMLDivElement>(null);
  return (
    <CoherenceProvider value={value}>
      <div ref={editorRef as React.RefObject<HTMLDivElement>}>
        <span
          data-span-id="span-1"
          data-coherence-issue="conflict"
          data-testid="marked-span"
        >
          at midnight
        </span>
        <span data-span-id="span-2" data-testid="plain-span">
          a quiet street
        </span>
      </div>
      <CoherenceMarkPopover editorRef={editorRef} />
    </CoherenceProvider>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

/** Hover with intent: enter the element and rest past the open delay. */
function hoverWithIntent(element: HTMLElement): void {
  fireEvent.mouseOver(element);
  act(() => {
    vi.advanceTimersByTime(150);
  });
}
afterEach(() => {
  vi.useRealTimers();
});

describe("findIssueForSpan", () => {
  it("finds the issue that involves the span", () => {
    expect(findIssueForSpan([issue()], "span-1")?.id).toBe("issue-1");
  });

  it("ignores dismissed issues", () => {
    expect(findIssueForSpan([issue({ dismissed: true })], "span-1")).toBeNull();
  });

  it("returns null for a span no issue involves", () => {
    expect(findIssueForSpan([issue()], "span-9")).toBeNull();
  });
});

describe("CoherenceMarkPopover", () => {
  it("shows the issue when the creator hovers a marked span", () => {
    render(<Harness value={buildValue()} />);

    hoverWithIntent(screen.getByTestId("marked-span"));

    expect(
      screen.getByText("golden hour conflicts with midnight"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The lighting and the time of day disagree."),
    ).toBeInTheDocument();
    expect(screen.getByText("Change the time to dusk")).toBeInTheDocument();
  });

  it("stays closed over an unmarked span", () => {
    render(<Harness value={buildValue()} />);

    hoverWithIntent(screen.getByTestId("plain-span"));

    expect(
      screen.queryByText("golden hour conflicts with midnight"),
    ).not.toBeInTheDocument();
  });

  it("applies the first fix through the context", () => {
    const onApplyFix = vi.fn();
    const value = buildValue({ onApplyFix });
    render(<Harness value={value} />);

    hoverWithIntent(screen.getByTestId("marked-span"));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApplyFix).toHaveBeenCalledWith(
      "issue-1",
      value.issues[0]!.recommendations[0],
    );
  });

  it("dismisses the issue through the context and closes", () => {
    const onDismissIssue = vi.fn();
    render(<Harness value={buildValue({ onDismissIssue })} />);

    hoverWithIntent(screen.getByTestId("marked-span"));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(onDismissIssue).toHaveBeenCalledWith("issue-1");
    expect(
      screen.queryByText("golden hour conflicts with midnight"),
    ).not.toBeInTheDocument();
  });

  it("closes after the pointer leaves, with a grace period", () => {
    render(<Harness value={buildValue()} />);

    hoverWithIntent(screen.getByTestId("marked-span"));
    fireEvent.mouseOut(screen.getByTestId("marked-span"));

    // Still open inside the grace window — the pointer may be travelling
    // from the span to the popover.
    expect(
      screen.getByText("golden hour conflicts with midnight"),
    ).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(
      screen.queryByText("golden hour conflicts with midnight"),
    ).not.toBeInTheDocument();
  });

  it("stays open while the pointer is over the popover itself", () => {
    render(<Harness value={buildValue()} />);

    hoverWithIntent(screen.getByTestId("marked-span"));
    fireEvent.mouseOut(screen.getByTestId("marked-span"));
    fireEvent.mouseEnter(screen.getByTestId("coherence-mark-popover"));

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(
      screen.getByText("golden hour conflicts with midnight"),
    ).toBeInTheDocument();
  });

  it("does not open for a cursor merely passing through the mark", () => {
    render(<Harness value={buildValue()} />);

    fireEvent.mouseOver(screen.getByTestId("marked-span"));
    fireEvent.mouseOut(screen.getByTestId("marked-span"));
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(
      screen.queryByText("golden hour conflicts with midnight"),
    ).not.toBeInTheDocument();
  });

  it("cancels a pending close when the creator re-hovers the mark", () => {
    render(<Harness value={buildValue()} />);

    hoverWithIntent(screen.getByTestId("marked-span"));
    fireEvent.mouseOut(screen.getByTestId("marked-span"));
    // Back onto the mark inside the grace window: the close must be cancelled,
    // not merely raced.
    hoverWithIntent(screen.getByTestId("marked-span"));
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(
      screen.getByText("golden hour conflicts with midnight"),
    ).toBeInTheDocument();
  });

  it("renders nothing for a marked span whose issue was dismissed", () => {
    render(
      <Harness value={buildValue({ issues: [issue({ dismissed: true })] })} />,
    );

    hoverWithIntent(screen.getByTestId("marked-span"));

    expect(
      screen.queryByText("golden hour conflicts with midnight"),
    ).not.toBeInTheDocument();
  });

  /**
   * The editor element is swapped mid-session: pre-work the ref points at the
   * Anchor sheet's editor, after submit at the docked composer's. A listener
   * bound to the first element goes dead on the swap — and coherence results
   * only exist after the swap, so that bug killed the popover in exactly the
   * flow it was built for. Containment must be checked at event time.
   */
  it("follows the ref when the editor element is swapped mid-session", () => {
    function SwappingHarness({
      value,
    }: {
      value: CoherenceContextValue;
    }): React.ReactElement {
      const editorRef = React.useRef<HTMLDivElement>(null);
      const [swapped, setSwapped] = React.useState(false);
      return (
        <CoherenceProvider value={value}>
          {!swapped ? (
            <div ref={editorRef as React.RefObject<HTMLDivElement>}>
              <span data-testid="anchor-editor-text">the one-line idea</span>
            </div>
          ) : (
            <div ref={editorRef as React.RefObject<HTMLDivElement>}>
              <span
                data-span-id="span-1"
                data-coherence-issue="conflict"
                data-testid="docked-marked-span"
              >
                at midnight
              </span>
            </div>
          )}
          <button onClick={() => setSwapped(true)}>submit</button>
          <CoherenceMarkPopover editorRef={editorRef} />
        </CoherenceProvider>
      );
    }

    render(<SwappingHarness value={buildValue()} />);
    fireEvent.click(screen.getByRole("button", { name: "submit" }));

    hoverWithIntent(screen.getByTestId("docked-marked-span"));

    expect(
      screen.getByText("golden hour conflicts with midnight"),
    ).toBeInTheDocument();
  });

  it("offers no Apply button when the issue has no recommendation", () => {
    render(
      <Harness
        value={buildValue({ issues: [issue({ recommendations: [] })] })}
      />,
    );

    hoverWithIntent(screen.getByTestId("marked-span"));

    expect(
      screen.getByText("golden hour conflicts with midnight"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
  });
});
