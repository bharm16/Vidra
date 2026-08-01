import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Invariant: the font stack is declared on `html`, not only on `body`.
 *
 * base.css styled `body` alone, so the root element computed to the UA default
 * — a serif. Anything resolving against `html` rather than `body` inherited it:
 * portalled overlays mounted outside `#root`, the scrollbar, and UA form
 * control defaults. It is invisible on most screens, which is why it survived.
 */

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const baseCss = readFileSync(
  path.join(repoRoot, "packages/promptstudio-system/src/base.css"),
  "utf8",
);

/** The declaration block of a top-level selector inside base.css. */
function ruleBody(selector: string): string {
  const needle = `\n  ${selector} {`;
  const start = baseCss.indexOf(needle);
  expect(start, `base.css should declare ${selector}`).toBeGreaterThan(-1);
  const open = start + needle.length;
  const close = baseCss.indexOf("\n  }", open);
  expect(close, `${selector} block should terminate`).toBeGreaterThan(-1);
  return baseCss.slice(open, close);
}

describe("root font stack", () => {
  it("declares font-family on html", () => {
    expect(ruleBody("html")).toContain("font-family: var(--font-sans)");
  });

  it("resolves the stack from a token, never a literal family", () => {
    const html = ruleBody("html");
    expect(html).not.toContain("serif");
    expect(html).not.toContain("Geist,");
  });

  it("still declares it on body, so body-scoped overrides keep working", () => {
    expect(ruleBody("body")).toContain("font-family: var(--font-sans)");
  });
});
