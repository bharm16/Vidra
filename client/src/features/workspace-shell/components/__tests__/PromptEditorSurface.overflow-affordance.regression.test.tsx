import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { withSelectedSpan } from "@/features/prompt-optimizer/context/__tests__/selectedSpanTestHarness";
import { PromptEditorSurface } from "../PromptEditorSurface";
import type { PromptEditorSurfaceProps } from "../PromptEditorSurface";

/**
 * Regression: composer overflow has designed affordances.
 *
 * 1. Failure boundary: UI component — PromptEditorSurface's editor window
 *    and suggestion-chip row.
 * 2. Mock boundary: SelectedSpan context value (the tray input). The
 *    surface renders for real.
 * 3. Invariants: long expanded prompts scroll behind a VISIBLE scrollbar
 *    (never the hidden one), and the editor + tray are inset from the card
 *    edge so overflowing chips stop clipping against the composer border.
 */

const noop = (): void => {};

function makeProps(
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

describe("regression: composer overflow affordances", () => {
  it("the prompt editor scrolls behind a visible thin scrollbar, not a hidden one", () => {
    const { container } = render(
      withSelectedSpan(<PromptEditorSurface {...makeProps()} />),
    );
    const editor = container.querySelector("[data-placeholder]");
    expect(editor).not.toBeNull();
    const className = (editor as HTMLElement).className;
    expect(className).toMatch(/overflow-y-auto/);
    expect(className).toContain("ps-scrollbar-thin");
    expect(className).not.toContain("ps-scrollbar-hide");
  });

  it("the editor and tray are inset from the composer card edge", () => {
    const { container } = render(
      withSelectedSpan(<PromptEditorSurface {...makeProps()} />),
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toMatch(/px-4/);
  });

  it("the suggestion-chip row keeps its horizontal scroll affordance when chips overflow", () => {
    render(
      withSelectedSpan(<PromptEditorSurface {...makeProps()} />, {
        selectedSpanId: "span-1",
        selectionLabel: "golden retriever",
        suggestionCount: 3,
        isInlineEmpty: false,
        inlineSuggestions: [
          {
            key: "s1",
            text: "a bounding golden retriever",
            meta: null,
            item: "a",
          },
          {
            key: "s2",
            text: "a sprinting border collie",
            meta: null,
            item: "b",
          },
          { key: "s3", text: "a loping irish setter", meta: null, item: "c" },
        ],
      }),
    );

    const tray = screen.getByTestId("canvas-suggestion-tray");
    const chipRow = tray.querySelector(".overflow-x-auto");
    expect(chipRow).not.toBeNull();
    expect((chipRow as HTMLElement).className).toContain("ps-scrollbar-thin");
  });
});
