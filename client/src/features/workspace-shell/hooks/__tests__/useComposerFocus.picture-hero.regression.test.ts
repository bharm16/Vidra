import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useComposerFocus } from "../useComposerFocus";
import type { ComposerFocusHero } from "../useComposerFocus";

/**
 * Regression (ADR-0015 / ADR-0011 D1): prompt weight tracks the working step.
 * A still picture is the words step's INPUT (describe its motion), not its
 * output — so a picture take must never steal words focus. Hydrated sessions
 * reload their accepted frame as a completed image generation; treating that
 * hero as "past the words step" hid the restored working prompt behind a
 * collapsed composer with no non-destructive way to reopen it.
 */
describe("regression: a picture hero leaves the words box open", () => {
  it("a hydrated picture take keeps words focused — the restored working prompt stays visible", () => {
    const hero: ComposerFocusHero = { id: "take-img", mediaType: "image" };
    const { result } = renderHook(() => useComposerFocus(hero));
    expect(result.current.wordsFocused).toBe(true);
  });

  it("a picture take appearing mid-writing does not steal focus", () => {
    const { result, rerender } = renderHook(
      ({ hero }: { hero: ComposerFocusHero | null }) => useComposerFocus(hero),
      { initialProps: { hero: null as ComposerFocusHero | null } },
    );
    expect(result.current.wordsFocused).toBe(true);

    rerender({ hero: { id: "take-img", mediaType: "image" } });
    expect(result.current.wordsFocused).toBe(true);
  });

  it("a clip hero still steals focus the moment it exists", () => {
    const { result } = renderHook(() =>
      useComposerFocus({ id: "take-vid", mediaType: "video" }),
    );
    expect(result.current.wordsFocused).toBe(false);
  });

  it("a motion sequence hero steals focus like a clip", () => {
    const { result } = renderHook(() =>
      useComposerFocus({ id: "take-seq", mediaType: "image-sequence" }),
    );
    expect(result.current.wordsFocused).toBe(false);
  });

  it("blur clears a manual focus but the picture step keeps the box open, matching the live flow", () => {
    const hero: ComposerFocusHero = { id: "take-img", mediaType: "image" };
    const { result } = renderHook(() => useComposerFocus(hero));
    act(() => result.current.focusWords("words-1"));
    act(() => result.current.blurWords());
    // With only a picture on the canvas the words remain the working step —
    // blur clears the manual override but the default keeps the box open.
    expect(result.current.focusedWordsId).toBeNull();
    expect(result.current.wordsFocused).toBe(true);
  });
});
