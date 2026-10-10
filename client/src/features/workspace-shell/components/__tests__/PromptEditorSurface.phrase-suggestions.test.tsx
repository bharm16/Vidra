import { createRef } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  makeSelectedSpanValue,
  withSelectedSpan,
} from "@/features/prompt-optimizer/context/__tests__/selectedSpanTestHarness";
import { SelectedSpanProvider } from "@/features/prompt-optimizer/context/SelectedSpanContext";
import {
  PromptEditorSurface,
  type PromptEditorSurfaceProps,
} from "../PromptEditorSurface";

vi.unmock("@promptstudio/system/components/ui/button");
vi.unmock("@promptstudio/system/components/ui/textarea");
const props = (): PromptEditorSurfaceProps => ({
  editorRef: createRef<HTMLDivElement>(),
  onTextSelection: vi.fn(),
  onHighlightClick: vi.fn(),
  onHighlightMouseDown: vi.fn(),
  onHighlightMouseEnter: vi.fn(),
  onHighlightMouseLeave: vi.fn(),
  onCopyEvent: vi.fn(),
  onInput: vi.fn(),
});
const ready = () => ({
  selectedSpanId: "span-1",
  selectionLabel: "warm evening light",
  suggestionCount: 3,
  isInlineEmpty: false,
  inlineSuggestions: [
    {
      key: "one",
      text: "golden-hour sunlight",
      meta: "98% match",
      item: "golden-hour sunlight",
    },
    {
      key: "two",
      text: "soft amber light",
      meta: null,
      item: "soft amber light",
    },
    {
      key: "three",
      text: "diffused sunset glow",
      meta: null,
      item: "diffused sunset glow",
    },
  ],
});

describe("Page 21 phrase replacement", () => {
  it("applies only the clicked replacement and closes", () => {
    const value = makeSelectedSpanValue(ready());
    render(
      <SelectedSpanProvider value={value}>
        <PromptEditorSurface {...props()} />
      </SelectedSpanProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "soft amber light" }));
    expect(value.onSuggestionClick).toHaveBeenCalledExactlyOnceWith(
      "soft amber light",
    );
    expect(value.onCloseInlinePopover).toHaveBeenCalledTimes(1);
    expect(value.onCustomRequestSubmit).not.toHaveBeenCalled();
  });
  it("Suggest invokes the custom fetch handler without applying or closing", () => {
    const value = makeSelectedSpanValue({
      ...ready(),
      customRequest: "Make the light colder",
      isCustomRequestDisabled: false,
      onCustomRequestSubmit: vi.fn((event) => event.preventDefault()),
    });
    render(
      <SelectedSpanProvider value={value}>
        <PromptEditorSurface {...props()} />
      </SelectedSpanProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Suggest" }));
    expect(value.onCustomRequestSubmit).toHaveBeenCalledTimes(1);
    expect(value.onSuggestionClick).not.toHaveBeenCalled();
    expect(value.onApplyActiveSuggestion).not.toHaveBeenCalled();
    expect(value.onCloseInlinePopover).not.toHaveBeenCalled();
  });
  it("hides custom input during initial loading", () => {
    render(
      withSelectedSpan(<PromptEditorSurface {...props()} />, {
        selectedSpanId: "span-1",
        selectionLabel: "warm evening light",
        isInlineLoading: true,
      }),
    );
    expect(screen.getByText("Finding alternatives…")).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Custom suggestion request" }),
    ).not.toBeInTheDocument();
  });

  it("keeps existing options usable during a custom request", () => {
    const value = makeSelectedSpanValue({
      ...ready(),
      isCustomLoading: true,
      isInlineLoading: true,
      customRequest: "Make it colder",
    });
    render(
      <SelectedSpanProvider value={value}>
        <PromptEditorSurface {...props()} />
      </SelectedSpanProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "soft amber light" }));
    expect(value.onSuggestionClick).toHaveBeenCalledExactlyOnceWith(
      "soft amber light",
    );
    expect(
      screen.getByRole("textbox", { name: "Custom suggestion request" }),
    ).toHaveValue("Make it colder");
  });
  it("closing leaves the working editor node and its words intact", () => {
    const wiring = props();
    const value = makeSelectedSpanValue(ready());
    const { rerender } = render(
      <SelectedSpanProvider value={value}>
        <PromptEditorSurface {...wiring} />
      </SelectedSpanProvider>,
    );
    const editor = wiring.editorRef.current;
    if (!editor) throw new Error("Editor did not mount");
    editor.textContent = "Working words are retained";
    fireEvent.click(screen.getByRole("button", { name: "Close suggestions" }));
    expect(value.onSuggestionClick).not.toHaveBeenCalled();
    rerender(
      <SelectedSpanProvider value={{ ...value, selectedSpanId: null }}>
        <PromptEditorSurface {...wiring} />
      </SelectedSpanProvider>,
    );
    expect(wiring.editorRef.current).toBe(editor);
    expect(editor).toHaveTextContent("Working words are retained");
  });

  it("Escape in the panel closes without applying", () => {
    const value = makeSelectedSpanValue(ready());
    render(
      <SelectedSpanProvider value={value}>
        <PromptEditorSurface {...props()} />
      </SelectedSpanProvider>,
    );
    fireEvent.keyDown(screen.getByTestId("canvas-suggestion-tray"), {
      key: "Escape",
    });
    expect(value.onCloseInlinePopover).toHaveBeenCalledTimes(1);
    expect(value.onSuggestionClick).not.toHaveBeenCalled();
  });

  it("copies the active suggestion debug payload", async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    try {
      render(
        withSelectedSpan(<PromptEditorSurface {...props()} />, {
          ...ready(),
          responseMetadata: { _debug: { requestId: "request-1" } },
        }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Copy Debug" }));
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Copied!" }),
        ).toBeInTheDocument(),
      );
      expect(writeText).toHaveBeenCalledExactlyOnceWith(
        JSON.stringify({ requestId: "request-1" }, null, 2),
      );
    } finally {
      if (original) Object.defineProperty(navigator, "clipboard", original);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });
});
