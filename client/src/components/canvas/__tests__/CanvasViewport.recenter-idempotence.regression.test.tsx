import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanvasViewport } from '../CanvasViewport';

/**
 * Regression: mounting under React.StrictMode double-ran the recenter effect,
 * and because the effect applied a RELATIVE pan from rects the DOM had not
 * repainted yet, the delta stacked twice — the live editor's pair landed
 * off-center, cut off at the viewport edges (observed camera exactly 2× the
 * correct pan). Recentering must be idempotent: any number of effect runs
 * against the same layout converges to the single centering camera.
 */
describe('regression: recentering is idempotent across StrictMode re-runs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const rect = (r: Partial<DOMRect>): DOMRect =>
    ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => ({}),
      ...r,
    }) as DOMRect;

  it('mounting with a live node under StrictMode centers it once, not twice', () => {
    // jsdom never lays out, so rects are static across effect runs — the same
    // frame-of-reference the real bug hit (updaters run before any repaint).
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: Element) {
        if (this.getAttribute('data-testid') === 'space-canvas') {
          return rect({ left: 0, top: 0, width: 800, height: 600 });
        }
        if (this.getAttribute('data-live') === 'true') {
          return rect({ left: 900, top: 700, width: 200, height: 120 });
        }
        return rect({});
      }
    );

    render(
      <React.StrictMode>
        <CanvasViewport liveNodeId="editor-pair">
          <div data-live="true">live node</div>
        </CanvasViewport>
      </React.StrictMode>
    );

    // Node center (1000, 760) lands on the viewport center (400, 300): the
    // camera is (−600, −460) — once. The doubled bug produced (−1200, −920).
    expect(screen.getByTestId('space-viewport-content').style.transform).toBe(
      'translate(-600px, -460px) scale(1)'
    );
  });
});
