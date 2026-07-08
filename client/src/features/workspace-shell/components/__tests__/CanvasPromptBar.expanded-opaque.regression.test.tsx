import { createRef } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * Regression: the frosted-glass composer goes opaque while expanded.
 *
 * 1. Failure boundary: UI component — CanvasPromptBar's surface classes.
 * 2. Mock boundary: PromptResultsActions + SelectedSpan context values
 *    (the drawer/tray inputs). The bar renders for real.
 * 3. Invariant: whenever the composer is expanded (Tune drawer or the
 *    suggestion tray open) its surface is opaque with no backdrop blur, so
 *    canvas content behind it can never smear through; collapsed, it keeps
 *    the floating-glass treatment.
 */

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
import { CanvasPromptBar } from "../CanvasPromptBar";
import type { PromptEditorSurfaceProps } from "../PromptEditorSurface";

const noop = (): void => {};

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

const OPAQUE_CLASS = "bg-tool-surface-prompt-compact";

describe("regression: expanded composer surface is opaque", () => {
  it("keeps the floating-glass treatment while collapsed", () => {
    const { container } = render(
      withSelectedSpan(<CanvasPromptBar surfaceProps={makeSurfaceProps()} />),
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toMatch(/backdrop-blur/);
    expect(wrapper.className).not.toContain(OPAQUE_CLASS);
  });

  it("goes opaque with no backdrop blur while the suggestion tray is open", () => {
    const { container } = render(
      withSelectedSpan(<CanvasPromptBar surfaceProps={makeSurfaceProps()} />, {
        selectedSpanId: "span-1",
      }),
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain(OPAQUE_CLASS);
    expect(wrapper.className).not.toMatch(/backdrop-blur/);
  });
});
