import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.unmock("@promptstudio/system/components/ui/button");
vi.unmock("@promptstudio/system/components/ui/textarea");
import { withSelectedSpan } from "@/features/prompt-optimizer/context/__tests__/selectedSpanTestHarness";
import { PromptEditorSurface } from "../PromptEditorSurface";
import type { PromptEditorSurfaceProps } from "../PromptEditorSurface";

/**
 * Regression: composer overflow has designed affordances.
 *
 * 1. Failure boundary: UI component — PromptEditorSurface's editor window
 *    and phrase replacement popover.
 * 2. Mock boundary: SelectedSpan context value (the tray input). The
 *    surface renders for real.
 * 3. Invariants: long expanded prompts scroll behind a VISIBLE scrollbar
 *    (never the hidden one), and phrase replacement controls escape
 *    the composer scroll viewport through the real popover portal.
 */

const noop = (): void => {};

function makeProps(
  overrides: Partial<PromptEditorSurfaceProps> = {},
): PromptEditorSurfaceProps {
  return {
    editorRef: createRef<HTMLDivElement>(),
    onTextSelection: noop,
    onHighlightClick: noop,
    onHighlightMouseDown: noop,
    onHighlightMouseEnter: noop,
    onHighlightMouseLeave: noop,
    onCopyEvent: noop,
    onInput: noop,
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

  it("replacement controls render outside the composer overflow viewport", () => {
    const { container } = render(
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
    expect(container.contains(tray)).toBe(false);
    expect(
      screen.getByRole("button", { name: "a sprinting border collie" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suggest" })).toBeInTheDocument();
  });
});
