import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useComposerFocus } from "../useComposerFocus";
import type { ComposerFocusHero } from "../useComposerFocus";

/**
 * ADR-0015: the composer is bound to the words node's focus. Focus follows
 * the step — words focused by default while writing (no clip yet), a clip
 * steals focus the moment it exists — with manual override via the demoted
 * words chip. (Picture-hero behavior is covered by the
 * useComposerFocus.picture-hero regression suite.)
 */
describe("useComposerFocus", () => {
  const clip = (id: string): ComposerFocusHero => ({ id, mediaType: "video" });

  it("words are focused by default while writing (no take yet)", () => {
    const { result } = renderHook(() => useComposerFocus(null));
    expect(result.current.wordsFocused).toBe(true);
    expect(result.current.focusedWordsId).toBeNull();
  });

  it("a live clip means words are not focused — composer collapses", () => {
    const { result } = renderHook(() => useComposerFocus(clip("take-1")));
    expect(result.current.wordsFocused).toBe(false);
  });

  it("clicking a words node focuses it — composer reopens", () => {
    const { result } = renderHook(() => useComposerFocus(clip("take-1")));
    act(() => result.current.focusWords("words-1"));
    expect(result.current.wordsFocused).toBe(true);
    expect(result.current.focusedWordsId).toBe("words-1");
  });

  it("a newly forming clip steals focus from manually focused words", () => {
    const { result, rerender } = renderHook(
      ({ hero }: { hero: ComposerFocusHero | null }) => useComposerFocus(hero),
      { initialProps: { hero: clip("take-1") as ComposerFocusHero | null } },
    );
    act(() => result.current.focusWords("words-1"));
    expect(result.current.wordsFocused).toBe(true);

    rerender({ hero: clip("take-2") });
    expect(result.current.wordsFocused).toBe(false);
    expect(result.current.focusedWordsId).toBeNull();
  });

  it("blurring (take select / empty-canvas click) collapses again", () => {
    const { result } = renderHook(() => useComposerFocus(clip("take-1")));
    act(() => result.current.focusWords("words-1"));
    act(() => result.current.blurWords());
    expect(result.current.wordsFocused).toBe(false);
    expect(result.current.focusedWordsId).toBeNull();
  });
});
