/**
 * Regression: removing a camera spec must not damage the words around it.
 *
 * The f-stop pattern carries `\s*` on both ends and around its slash, so that
 * "( f/2.8 )" and "f / 2.8" are recognised. Both allowances leaked:
 *
 *  1. The `\s*` after the slash let the pattern reach across a space into the
 *     next word. "f/ 8k" matched as "f/ 8", and stripping it left "k" — the
 *     resolution lost its leading digit. Found by fast-check, counterexample
 *     ["kling-26","4k","F/",""].
 *
 *  2. The outer `\s*` put the neighbours' separator inside the match, and the
 *     match was replaced with "". "portrait f/1.8 award winning" became
 *     "portraitaward winning" — ordinary, well-formed input.
 *
 * The invariant both violate: stripping a spec removes the spec and nothing
 * else. Every other character in the prompt survives, and words that were
 * separate stay separate.
 *
 * Pinned here with literal inputs because the property test that found (1) is
 * now seeded and scoped to neutral context (a5affc6f), so it will not
 * rediscover these.
 */

import { describe, expect, it } from "vitest";

import { TechStripper } from "../TechStripper";

describe("regression: stripping a camera spec damages nothing around it", () => {
  const stripper = new TechStripper();

  // A keep-model, so placebo tokens ("4k", "8k") are preserved and any damage
  // to them is the camera-spec pass, not the placebo pass.
  const KEEP_MODEL = "kling-2.1";

  it("leaves a resolution intact when an f-stop abuts it", () => {
    // "f/ 8" is not an aperture followed by "k" — the 8 belongs to "8k".
    expect(stripper.strip("f/ 8k", KEEP_MODEL).text).toBe("f/ 8k");
    expect(stripper.strip("f/ 4k", KEEP_MODEL).text).toBe("f/ 4k");
  });

  it("keeps neighbouring words separate when the spec between them goes", () => {
    expect(
      stripper.strip("portrait f/1.8 award winning", KEEP_MODEL).text,
    ).toBe("portrait award winning");
  });

  it("still strips the spacing forms the pattern's \\s* exists for", () => {
    // These are why the whitespace allowances are there; the fix must not cost
    // them. Each should lose the spec and keep everything else.
    expect(stripper.strip("a runner f / 2.8 in rain", KEEP_MODEL).text).toBe(
      "a runner in rain",
    );
    expect(stripper.strip("(f/2.8) closeup", KEEP_MODEL).text).toBe("closeup");
    expect(stripper.strip("shot (f/1.8-f/2.8) wide", KEEP_MODEL).text).toBe(
      "shot wide",
    );
  });

  it("still strips an f-stop that is followed by a separate resolution", () => {
    // The digit-adjacency guard must not over-fire: here "f/4" is a complete
    // aperture and "8k" is a separate token, so the spec goes and 8k stays.
    expect(stripper.strip("f/4 8k render", KEEP_MODEL).text).toBe("8k render");
    expect(stripper.strip("shot at f/2.8, 4k detail", KEEP_MODEL).text).toBe(
      "shot at, 4k detail",
    );
  });

  it("applies the same protection to ISO values", () => {
    // Same pattern shape, same hazard: the digits must not be taken out of a
    // word that follows them.
    expect(stripper.strip("iso 800 portrait", KEEP_MODEL).text).toBe(
      "portrait",
    );
    expect(stripper.strip("ISO 800", KEEP_MODEL).text).toBe("");
  });

  it("reports the spec as stripped only when it actually was", () => {
    const rejected = stripper.strip("f/ 8k", KEEP_MODEL);
    expect(rejected.tokensWereStripped).toBe(false);
    expect(rejected.strippedTokens).toEqual([]);

    const stripped = stripper.strip("portrait f/1.8 award winning", KEEP_MODEL);
    expect(stripped.tokensWereStripped).toBe(true);
    expect(stripped.strippedTokens).toContain("f-stop");
  });
});
