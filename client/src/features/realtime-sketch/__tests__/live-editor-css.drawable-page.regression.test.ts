import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression: the sketch page rendered as a 700×860 panel while the drawable
 * canvas kept its intrinsic square size (512×512, the model's fast-path
 * generation frame), letterboxed invisibly in the middle — strokes near the
 * page's top/bottom (and left/right) silently vanished, and the square render
 * was cover-cropped in the taller output panel. The page must BE the
 * generation frame: square panels, canvas filling them edge-to-edge.
 *
 * jsdom computes no layout from stylesheets, so the contract is asserted on
 * the stylesheet itself — the failure boundary where the letterbox lived.
 */

// jsdom rewrites import.meta.url to a non-file URL; vitest always runs from
// the repo root, so anchor on cwd instead.
const css = readFileSync(
  resolve(process.cwd(), 'client/src/features/realtime-sketch/live-editor.css'),
  'utf8'
);

function declarations(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start, `selector ${selector} present`).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('}', start);
  const body = css.slice(start + selector.length + 2, end);
  const map: Record<string, string> = {};
  for (const entry of body.split(';')) {
    const colon = entry.indexOf(':');
    if (colon === -1) continue;
    map[entry.slice(0, colon).trim()] = entry.slice(colon + 1).trim();
  }
  return map;
}

describe('regression: the entire visible page is drawable', () => {
  it('the sketch page is square — its shape IS the square generation frame', () => {
    const sketch = declarations('.le-panel-sketch');
    expect(sketch.width).toBeDefined();
    expect(sketch.width).toBe(sketch.height);
  });

  it('the output pane mirrors the page, so no pixel of the render is cropped away', () => {
    const sketch = declarations('.le-panel-sketch');
    const output = declarations('.le-panel-output');
    expect(output.width).toBe(sketch.width);
    expect(output.height).toBe(sketch.height);
  });

  it('the canvas fills the page edge-to-edge — no letterbox rules', () => {
    const canvas = declarations('.le-canvas');
    expect(canvas.width).toBe('100%');
    expect(canvas.height).toBe('100%');
    // The letterbox recipe that caused the dead zones must not return:
    expect(canvas['aspect-ratio']).toBeUndefined();
    expect(canvas['max-width']).toBeUndefined();
    expect(canvas['max-height']).toBeUndefined();
    expect(canvas.margin).toBeUndefined();
  });
});
