/**
 * The words-version signature — the value a words-version is deduplicated by.
 *
 * The client mints every words-version from the editor and compares this
 * signature to decide whether a new one is needed; a server that mints the
 * ROOT words-version of a session (issue #87's accept bridge) has to agree
 * with it, or the creator's first action in that session forks a second
 * words-node carrying identical text. Both sides therefore compute it here:
 * "pure functions that prevent client/server implementation drift" is exactly
 * what `shared/` is for.
 *
 * FNV-1a over the NFC-normalized text, base-36. No I/O, no Node APIs.
 */
export function wordsVersionSignature(text: string): string {
  const normalized = text.normalize("NFC");
  if (!normalized) return "0";

  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    // FNV prime: 16777619
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(36);
}
