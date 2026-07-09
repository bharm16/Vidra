import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useComposerFocus } from "../useComposerFocus";

/**
 * ADR-0015: the composer is bound to the words node's focus. Focus follows
 * the step — words focused by default while writing (no take yet), a take
 * steals focus the moment it exists — with manual override via the demoted
 * words chip.
 */
describe("useComposerFocus", () => {
  it("words are focused by default while writing (no take yet)", () => {
    const { result } = renderHook(() => useComposerFocus(null));
    expect(result.current.wordsFocused).toBe(true);
    expect(result.current.focusedWordsId).toBeNull();
  });

  it("a live take means words are not focused — composer collapses", () => {
    const { result } = renderHook(() => useComposerFocus("take-1"));
    expect(result.current.wordsFocused).toBe(false);
  });

  it("clicking a words node focuses it — composer reopens", () => {
    const { result } = renderHook(() => useComposerFocus("take-1"));
    act(() => result.current.focusWords("words-1"));
    expect(result.current.wordsFocused).toBe(true);
    expect(result.current.focusedWordsId).toBe("words-1");
  });

  it("a newly forming take steals focus from manually focused words", () => {
    const { result, rerender } = renderHook(
      ({ hero }: { hero: string | null }) => useComposerFocus(hero),
      { initialProps: { hero: "take-1" as string | null } },
    );
    act(() => result.current.focusWords("words-1"));
    expect(result.current.wordsFocused).toBe(true);

    rerender({ hero: "take-2" });
    expect(result.current.wordsFocused).toBe(false);
    expect(result.current.focusedWordsId).toBeNull();
  });

  it("blurring (take select / empty-canvas click) collapses again", () => {
    const { result } = renderHook(() => useComposerFocus("take-1"));
    act(() => result.current.focusWords("words-1"));
    act(() => result.current.blurWords());
    expect(result.current.wordsFocused).toBe(false);
    expect(result.current.focusedWordsId).toBeNull();
  });
});
