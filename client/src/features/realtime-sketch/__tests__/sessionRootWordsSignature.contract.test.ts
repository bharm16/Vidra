import { describe, expect, it } from "vitest";

import { wordsVersionSignature } from "@shared/utils/wordsVersionSignature";
import { createHighlightSignature } from "@features/span-highlighting/hooks/useSpanLabeling";

/**
 * The server mints the ROOT words-version of a session born from an accepted
 * live output (issue #87). The client decides whether a new words-version is
 * needed by comparing THIS signature — so if the two ever disagree, the
 * creator's first action in that fresh session forks a second words-node
 * carrying the identical text, and the session has two roots instead of one.
 *
 * Nothing else makes that drift visible: both sides type-check, both sides
 * run, and the damage only shows up as an extra node in the space. Hence this
 * test, which lives on the client because it is the only project that can
 * import both spellings.
 */
describe("the server's root words-version signature", () => {
  it("is the same value the client deduplicates words-versions by", () => {
    const texts = [
      "an ergonomic desk lamp glowing, studio lighting",
      "",
      "a runner on a rain-slicked street at dawn",
      "café façade at dusk",
      "  leading and trailing space  ",
    ];

    for (const text of texts) {
      expect(wordsVersionSignature(text)).toBe(createHighlightSignature(text));
    }
  });
});
