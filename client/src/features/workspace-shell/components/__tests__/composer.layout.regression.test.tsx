import { createRef } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock(
  "@/features/prompt-optimizer/context/PromptResultsActionsContext",
  () => ({
    usePromptResultsData: () => ({
      suggestionsData: null,
      i2vContext: null,
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
import type { SelectedSpanContextValue } from "@/features/prompt-optimizer/context/SelectedSpanContext";
import { CanvasPromptBar } from "../CanvasPromptBar";
import type { PromptEditorSurfaceProps } from "../PromptEditorSurface";

const noop = () => {};

function makeSurfaceProps(
  overrides: Partial<PromptEditorSurfaceProps> = {},
): PromptEditorSurfaceProps {
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
    ...overrides,
  };
}

/**
 * Composer no-reflow contract.
 *
 * The unified composer is always docked at bottom-center; its wrapper
 * className must NOT diverge as the editor's internal state evolves
 * (prompt fills, autocomplete opens, suggestions arrive, error state
 * surfaces). A divergent wrapper class would cause layout reflow on
 * every keystroke and destroy the floating-glass feel.
 *
 * Previously this test cycled through WorkspaceMoment values via a
 * `moment` prop. The prop was removed (it carried no behavior); the
 * contract is now expressed via materially different surface state.
 */
const SURFACE_VARIANTS: ReadonlyArray<{
  surface?: Partial<PromptEditorSurfaceProps>;
  span?: Partial<SelectedSpanContextValue>;
}> = [
  {}, // empty editor
  { surface: { prompt: "a dancer in a sunlit studio" } }, // filled
  { surface: { autocompleteOpen: true } }, // autocomplete dropped down
  { span: { isInlineLoading: true } }, // inline suggestions fetching
  { span: { isInlineError: true, inlineErrorMessage: "boom" } }, // error surfaced
];

describe("composer layout regression — no reflow across surface state", () => {
  it("the wrapper class list is identical across all surface state variants", () => {
    const classes = SURFACE_VARIANTS.map((variant) => {
      const { container, unmount } = render(
        withSelectedSpan(
          <CanvasPromptBar surfaceProps={makeSurfaceProps(variant.surface)} />,
          variant.span,
        ),
      );
      const cls = (container.firstChild as HTMLElement).className;
      unmount();
      return cls;
    });
    expect(new Set(classes).size).toBe(1);
  });

  it("the wrapper has position:absolute styling regardless of surface state", () => {
    for (const variant of SURFACE_VARIANTS) {
      const { container, unmount } = render(
        withSelectedSpan(
          <CanvasPromptBar surfaceProps={makeSurfaceProps(variant.surface)} />,
          variant.span,
        ),
      );
      expect((container.firstChild as HTMLElement).className).toMatch(
        /absolute/,
      );
      unmount();
    }
  });
});
