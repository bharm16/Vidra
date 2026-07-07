import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock(
  "@/features/prompt-optimizer/context/PromptResultsActionsContext",
  () => ({
    usePromptResultsData: () => ({
      suggestionsData: null,
      i2vContext: null,
      motionIdeas: undefined,
      isMotionIdeasLoading: false,
    }),
    usePromptResultsActions: () => ({
      user: null,
      onDisplayedPromptChange: () => {},
      onReoptimize: async () => {},
      onFetchSuggestions: () => {},
      onSuggestionClick: () => {},
      onHighlightsPersist: () => {},
      onUndo: () => {},
      onRedo: () => {},
      stablePromptContext: null,
    }),
  }),
);

import { withSelectedSpan } from "@/features/prompt-optimizer/context/__tests__/selectedSpanTestHarness";
import { CanvasPromptBar } from "../CanvasPromptBar";
import type { PromptEditorSurfaceProps } from "../PromptEditorSurface";

const noop = () => {};

function makeSurfaceProps(): PromptEditorSurfaceProps {
  return {
    editorRef: createRef<HTMLDivElement>(),
    prompt: "",
    onTextSelection: noop,
    onHighlightClick: noop,
    onHighlightMouseDown: noop,
    onHighlightMouseEnter: noop,
    onHighlightMouseLeave: noop,
    onCopyEvent: noop,
    onInput: noop,
    onEditorKeyDown: noop,
    onEditorBlur: noop,
    autocompleteOpen: false,
    autocompleteSuggestions: [],
    autocompleteSelectedIndex: -1,
    autocompletePosition: { top: 0, left: 0 },
    autocompleteLoading: false,
    onAutocompleteSelect: noop,
    onAutocompleteClose: noop,
    onAutocompleteIndexChange: noop,
  };
}

describe("CanvasPromptBar", () => {
  it("renders as a floating dock with absolute positioning", () => {
    const { container } = render(
      withSelectedSpan(<CanvasPromptBar surfaceProps={makeSurfaceProps()} />),
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toMatch(/absolute/);
  });

  it("renders the editor surface", () => {
    const { container } = render(
      withSelectedSpan(<CanvasPromptBar surfaceProps={makeSurfaceProps()} />),
    );
    // PromptEditor uses a contenteditable div with data-placeholder, not a real
    // <input placeholder>. Confirm via the data attribute.
    expect(
      container.querySelector('[data-placeholder*="Describe your shot"]'),
    ).toBeInTheDocument();
  });

  it("renders the your-words slot when provided", () => {
    render(
      withSelectedSpan(
        <CanvasPromptBar
          surfaceProps={makeSurfaceProps()}
          yourWordsSlot={<div data-testid="yw-slot">your words</div>}
        />,
      ),
    );
    expect(screen.getByTestId("yw-slot")).toBeInTheDocument();
  });

  it("does NOT change wrapper class list across surface state changes (no reflow fork)", () => {
    // The composer must stay structurally identical even as the editor's
    // internal state evolves (prompt fills, suggestions arrive, autocomplete
    // opens). A divergent className would cause layout reflow on every
    // keystroke. Verify by re-rendering with materially different surface
    // props and asserting the wrapper class is byte-identical.
    const empty = makeSurfaceProps();
    const filled: PromptEditorSurfaceProps = {
      ...makeSurfaceProps(),
      prompt: "a dancer in a sunlit studio",
      autocompleteOpen: true,
    };
    const { container, rerender } = render(
      withSelectedSpan(<CanvasPromptBar surfaceProps={empty} />),
    );
    const initial = (container.firstChild as HTMLElement).className;
    rerender(
      withSelectedSpan(<CanvasPromptBar surfaceProps={filled} />, {
        isInlineLoading: true,
      }),
    );
    const rerendered = (container.firstChild as HTMLElement).className;
    expect(initial).toBe(rerendered);
  });
});
