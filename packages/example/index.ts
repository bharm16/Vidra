import { normalizeLabel } from "./lib/impl";

/** Normalize display text, using "Untitled" when it is blank. */
export function formatLabel(value: string): string {
  return normalizeLabel(value);
}
