import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Regression (2026-07-24, found in live Chrome verification): the
 * design-system Button override block declared `height: auto !important`
 * on `.st-plane-cell`, and CSS !important beats INLINE styles — so the
 * computed layout's inline width/height was defeated and every plane cell
 * flattened to a line. The plane cell's height must come from the layout;
 * the override block may pin anything else, never the height.
 *
 * Same pattern as live-editor-css.drawable-page.regression.test.ts:
 * the invariant lives in a plain CSS file, so the test reads the file.
 */

const cssPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "studio.css",
);

function blocksOf(css: string, selector: string): string[] {
  const blocks: string[] = [];
  let from = 0;
  while (true) {
    const start = css.indexOf(selector, from);
    if (start === -1) break;
    const open = css.indexOf("{", start);
    const close = css.indexOf("}", open);
    if (open === -1 || close === -1) break;
    blocks.push(css.slice(open + 1, close));
    from = close + 1;
  }
  return blocks;
}

describe("studio.css plane-cell contract", () => {
  const css = readFileSync(cssPath, "utf8");

  it("never declares height on .st-plane-cell — the computed layout's inline style owns it", () => {
    const blocks = blocksOf(css, ".st-plane-cell {");
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block).not.toContain("height:");
    }
  });

  it("keeps the plane cell absolutely positioned so layout coordinates apply", () => {
    const blocks = blocksOf(css, ".st-plane-cell {");
    expect(blocks.some((block) => block.includes("position: absolute"))).toBe(
      true,
    );
  });
});
