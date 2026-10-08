import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.unmock("@promptstudio/system/components/ui/button");
vi.unmock("@promptstudio/system/components/ui/textarea");
import { withSelectedSpan } from "@/features/prompt-optimizer/context/__tests__/selectedSpanTestHarness";
import { PromptEditorSurface } from "../PromptEditorSurface";
import type { PromptEditorSurfaceProps } from "../PromptEditorSurface";

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

describe("PromptEditorSurface", () => {
  it("renders the prompt editor with a placeholder", () => {
    const { container } = render(
      withSelectedSpan(<PromptEditorSurface {...makeProps()} />),
    );
    const editor = container.querySelector("[data-placeholder]");
    expect(editor).not.toBeNull();
    expect(editor?.getAttribute("data-placeholder") ?? "").toMatch(
      /describe the video you want to create/i,
    );
  });

  it("does not render the suggestion tray when no span is selected", () => {
    render(withSelectedSpan(<PromptEditorSurface {...makeProps()} />));
    expect(
      screen.queryByTestId("canvas-suggestion-tray"),
    ).not.toBeInTheDocument();
  });

  it("renders the suggestion tray when a span is selected", () => {
    render(
      withSelectedSpan(<PromptEditorSurface {...makeProps()} />, {
        selectedSpanId: "span-1",
      }),
    );
    expect(screen.getByTestId("canvas-suggestion-tray")).toBeInTheDocument();
  });

  it("marks a selected motion phrase as not in the picture", () => {
    render(
      withSelectedSpan(<PromptEditorSurface {...makeProps()} />, {
        selectedSpanId: "span-1",
        isMotionSelection: true,
      }),
    );
    const note = screen.getByTestId("motion-not-in-picture-note");
    expect(note).toBeInTheDocument();
    expect(note).toHaveTextContent(/not in the picture/i);
  });

  it("does not mark a non-motion selection as not in the picture", () => {
    render(
      withSelectedSpan(<PromptEditorSurface {...makeProps()} />, {
        selectedSpanId: "span-1",
        isMotionSelection: false,
      }),
    );
    expect(
      screen.queryByTestId("motion-not-in-picture-note"),
    ).not.toBeInTheDocument();
  });
});
