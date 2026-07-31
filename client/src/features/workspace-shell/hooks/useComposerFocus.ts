import { useCallback, useState } from "react";
import type { GenerationMediaType } from "@features/generations/types";

/** The newest take on the canvas, reduced to what focus needs to know. */
export interface ComposerFocusHero {
  id: string;
  mediaType: GenerationMediaType;
}

export interface ComposerFocus {
  /** ADR-0015: the composer's open box renders exactly when this is true. */
  wordsFocused: boolean;
  /** The words node rendering full-size in the space; null = all demoted. */
  focusedWordsId: string | null;
  /** Manual override — clicking a demoted words chip. */
  focusWords: (id: string) => void;
  /** Take select / empty-canvas click — back to the collapsed toolbar. */
  blurWords: () => void;
}

/**
 * The composer↔words-node focus rule (ADR-0015). Focus follows the step:
 * words are focused by default while writing; a CLIP steals focus the moment
 * it exists or changes; clicking a words node overrides manually. A still
 * picture never steals — it is the words step's input (describe its motion),
 * not its output, and hydrated sessions reload their accepted frame as a
 * completed image generation. Ephemeral — never persisted.
 */
export function useComposerFocus(
  hero: ComposerFocusHero | null,
): ComposerFocus {
  const heroClipId = hero && hero.mediaType !== "image" ? hero.id : null;

  const [focusedWordsId, setFocusedWordsId] = useState<string | null>(null);

  // A newly forming clip steals focus (render-phase reset on prop change,
  // so the collapse lands in the same frame the clip appears).
  const [lastHeroClipId, setLastHeroClipId] = useState(heroClipId);
  if (lastHeroClipId !== heroClipId) {
    setLastHeroClipId(heroClipId);
    setFocusedWordsId(null);
  }

  const focusWords = useCallback((id: string) => setFocusedWordsId(id), []);
  const blurWords = useCallback(() => setFocusedWordsId(null), []);

  return {
    wordsFocused: heroClipId === null || focusedWordsId !== null,
    focusedWordsId,
    focusWords,
    blurWords,
  };
}
