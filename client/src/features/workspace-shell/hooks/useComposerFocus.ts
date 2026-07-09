import { useCallback, useState } from "react";

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
 * words are focused by default while writing (no take yet); a take steals
 * focus the moment it exists or changes; clicking a words node overrides
 * manually. Ephemeral — never persisted.
 */
export function useComposerFocus(
  heroGenerationId: string | null,
): ComposerFocus {
  const [focusedWordsId, setFocusedWordsId] = useState<string | null>(null);

  // A newly forming take steals focus (render-phase reset on prop change,
  // so the collapse lands in the same frame the take appears).
  const [lastHero, setLastHero] = useState(heroGenerationId);
  if (lastHero !== heroGenerationId) {
    setLastHero(heroGenerationId);
    setFocusedWordsId(null);
  }

  const focusWords = useCallback((id: string) => setFocusedWordsId(id), []);
  const blurWords = useCallback(() => setFocusedWordsId(null), []);

  return {
    wordsFocused: heroGenerationId === null || focusedWordsId !== null,
    focusedWordsId,
    focusWords,
    blurWords,
  };
}
