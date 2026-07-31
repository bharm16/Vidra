import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type React from "react";
import { useEditorInput } from "../useEditorInput";

/**
 * Regression: typing in the shot editor killed the highlights.
 *
 * 1. Failure boundary: the editor's input handler — the seam that decides
 *    what a keystroke means while results are shown.
 * 2. Mock boundary: none; the hook's collaborators are its props.
 * 3. Invariant: while results are shown, an edit updates the displayed
 *    prompt (so labeling relabels the new text) and never resets the
 *    results view; without results, edits stay input-mode only.
 *
 * The handler treated any edit-while-results as "start over": it reset
 * showResults and cleared displayedPrompt, which disabled the span-labeling
 * pipeline (enableMLHighlighting = video && showResults). Highlights and
 * click-to-enhance vanished on the first keystroke and only returned after
 * the next generation. The displayed-prompt update path (with autosave)
 * already existed and was wired down to the canvas — the canvas just
 * stopped calling it.
 */

function makeEditor(text: string): React.RefObject<HTMLElement> {
  const editor = document.createElement("div");
  editor.textContent = text;
  document.body.appendChild(editor);
  return { current: editor };
}

interface HarnessOverrides {
  showResults: boolean;
  onDisplayedPromptChange?: ((text: string) => void) | undefined;
  onResetResultsForEditing?: (() => void) | undefined;
  onInputPromptChange?: ((text: string) => void) | undefined;
}

function renderInput(overrides: HarnessOverrides): {
  handleInput: () => void;
} {
  const { result } = renderHook(() =>
    useEditorInput({
      editorRef: makeEditor("a fox trots, soft rim light"),
      editorDisplayText: "a fox trots",
      showResults: overrides.showResults,
      onInputPromptChange: overrides.onInputPromptChange ?? vi.fn(),
      onResetResultsForEditing: overrides.onResetResultsForEditing,
      onDisplayedPromptChange: overrides.onDisplayedPromptChange,
      handleAutocomplete: vi.fn(),
      handleAutocompleteKeyDown: vi.fn(),
      closeAutocomplete: vi.fn(),
      validateTriggers: vi.fn(),
      registerInsertHandler: vi.fn(),
      logAction: vi.fn(),
    }),
  );
  return { handleInput: result.current.handleInput };
}

describe("regression: editing while results are shown keeps the results view", () => {
  it("routes the edit into the displayed prompt and does not reset results", () => {
    const onDisplayedPromptChange = vi.fn();
    const onResetResultsForEditing = vi.fn();
    const onInputPromptChange = vi.fn();

    const { handleInput } = renderInput({
      showResults: true,
      onDisplayedPromptChange,
      onResetResultsForEditing,
      onInputPromptChange,
    });
    act(() => handleInput());

    expect(onDisplayedPromptChange).toHaveBeenCalledWith(
      "a fox trots, soft rim light",
    );
    expect(onResetResultsForEditing).not.toHaveBeenCalled();
    // The input prompt stays in sync — it is what the next generation reads.
    expect(onInputPromptChange).toHaveBeenCalledWith(
      "a fox trots, soft rim light",
    );
  });

  it("leaves input-mode editing alone (no displayed-prompt writes)", () => {
    const onDisplayedPromptChange = vi.fn();
    const onInputPromptChange = vi.fn();

    const { handleInput } = renderInput({
      showResults: false,
      onDisplayedPromptChange,
      onInputPromptChange,
    });
    act(() => handleInput());

    expect(onDisplayedPromptChange).not.toHaveBeenCalled();
    expect(onInputPromptChange).toHaveBeenCalledWith(
      "a fox trots, soft rim light",
    );
  });

  it("falls back to the legacy reset when no displayed-prompt handler is wired", () => {
    const onResetResultsForEditing = vi.fn();

    const { handleInput } = renderInput({
      showResults: true,
      onResetResultsForEditing,
    });
    act(() => handleInput());

    expect(onResetResultsForEditing).toHaveBeenCalledTimes(1);
  });
});
