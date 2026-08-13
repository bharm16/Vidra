import type { Generation } from "@features/generations/types";

/**
 * What the generations panel should start from for the selected words-version.
 *
 * `undefined` means "keep whatever the panel already has"; an empty array means
 * "clear it". The distinction matters when switching to a fresh session: no
 * version is selected yet, and carrying the previous session's local state over
 * would show the last session's takes under a new idea.
 */
export function resolveInitialGenerations(
  initialGenerations: Generation[] | undefined,
  promptVersionId: string,
): Generation[] | undefined {
  if (Array.isArray(initialGenerations)) return initialGenerations;
  if (!promptVersionId) return [];
  return undefined;
}
