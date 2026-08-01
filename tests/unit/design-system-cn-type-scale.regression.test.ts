import { describe, expect, it } from "vitest";

import { cn } from "@promptstudio/system/lib/utils";

/**
 * Invariant: a type-scale token and a text color survive `cn()` together.
 *
 * tailwind-merge resolves conflicts by utility group. Its default config only
 * knows Tailwind's stock font sizes, so it classified the preset's custom
 * sizes (`text-ui`, `text-meta`, `text-label-sm`, …) as text *colors* and
 * dropped whichever came first — leaving an element with no color, or no size,
 * and no error anywhere. Badge worked around it by hardcoding arbitrary pixel
 * sizes; the real fix is extending twMerge with the preset's font-size keys.
 *
 * This fails loudly if a size key is added to tailwind.preset.js without being
 * added to FONT_SIZE_KEYS in lib/utils.ts.
 */
describe("cn() keeps type-scale tokens and colors distinct", () => {
  const SIZE_TOKENS = [
    "text-display-xl",
    "text-display-lg",
    "text-display-md",
    "text-display-sm",
    "text-heading",
    "text-subhead",
    "text-body-lg",
    "text-body",
    "text-ui",
    "text-meta",
    "text-h4",
    "text-h5",
    "text-heading-20",
    "text-heading-18",
    "text-body-xl",
    "text-body-sm",
    "text-copy-13",
    "text-button-16",
    "text-button-14",
    "text-button-12",
    "text-button-11",
    "text-label-16",
    "text-label",
    "text-label-sm",
    "text-label-12",
    "text-label-11",
    "text-label-10",
    "text-overline",
  ] as const;

  it.each(SIZE_TOKENS)(
    "%s coexists with an arbitrary color value",
    (sizeToken) => {
      const result = cn(sizeToken, "text-[color:var(--badge-danger-text)]");

      expect(result).toContain(sizeToken);
      expect(result).toContain("text-[color:var(--badge-danger-text)]");
    },
  );

  it.each(SIZE_TOKENS)(
    "%s coexists with a semantic color class",
    (sizeToken) => {
      const result = cn(sizeToken, "text-muted-foreground");

      expect(result).toContain(sizeToken);
      expect(result).toContain("text-muted-foreground");
    },
  );

  it("still collapses two competing sizes to the last one", () => {
    expect(cn("text-meta", "text-ui")).toBe("text-ui");
    expect(cn("text-ui", "text-meta")).toBe("text-meta");
  });

  it("still collapses two competing text colors to the last one", () => {
    expect(cn("text-foreground", "text-muted-foreground")).toBe(
      "text-muted-foreground",
    );
  });
});
