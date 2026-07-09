import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  MAX_SCALE,
  MIN_SCALE,
  cameraToCenter,
  panBy,
  zoomAtPoint,
  type CanvasCamera,
} from "../canvasCamera";

/**
 * The infinite-canvas camera (Figma-style). Screen = world · scale + (x, y).
 * The whole gesture layer reduces to these pure ops, so correctness lives here.
 */
const cameraArb = fc.record({
  x: fc.double({ min: -5000, max: 5000, noNaN: true }),
  y: fc.double({ min: -5000, max: 5000, noNaN: true }),
  scale: fc.double({ min: MIN_SCALE, max: MAX_SCALE, noNaN: true }),
});

/** Where a camera says a screen point sits in world coordinates. */
const worldUnder = (
  camera: CanvasCamera,
  point: { x: number; y: number },
): { x: number; y: number } => ({
  x: (point.x - camera.x) / camera.scale,
  y: (point.y - camera.y) / camera.scale,
});

describe("zoomAtPoint", () => {
  it("keeps the world point under the cursor fixed while zooming", () => {
    // Camera at identity, cursor over (100, 100), zoom to 2×. The world point
    // (100, 100) must still render at screen (100, 100): offset −100.
    const next = zoomAtPoint({ x: 0, y: 0, scale: 1 }, { x: 100, y: 100 }, 2);
    expect(next).toEqual({ x: -100, y: -100, scale: 2 });
  });

  it("anchors the cursor's world point across any zoom (property)", () => {
    fc.assert(
      fc.property(
        cameraArb,
        fc.record({
          x: fc.double({ min: 0, max: 2000, noNaN: true }),
          y: fc.double({ min: 0, max: 2000, noNaN: true }),
        }),
        fc.double({ min: MIN_SCALE, max: MAX_SCALE, noNaN: true }),
        (camera, cursor, targetScale) => {
          const before = worldUnder(camera, cursor);
          const next = zoomAtPoint(camera, cursor, targetScale);
          const after = worldUnder(next, cursor);
          expect(after.x).toBeCloseTo(before.x, 6);
          expect(after.y).toBeCloseTo(before.y, 6);
        },
      ),
    );
  });

  it("clamps the scale to the camera bounds", () => {
    const tooFar = zoomAtPoint({ x: 0, y: 0, scale: 1 }, { x: 0, y: 0 }, 99);
    expect(tooFar.scale).toBe(MAX_SCALE);
    const tooClose = zoomAtPoint({ x: 0, y: 0, scale: 1 }, { x: 0, y: 0 }, 0);
    expect(tooClose.scale).toBe(MIN_SCALE);
  });
});

describe("panBy", () => {
  it("moves the camera by the screen-space delta, scale untouched", () => {
    expect(panBy({ x: 10, y: 20, scale: 1.5 }, 30, -5)).toEqual({
      x: 40,
      y: 15,
      scale: 1.5,
    });
  });

  it("composes additively (property)", () => {
    fc.assert(
      fc.property(
        cameraArb,
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        (camera, dx1, dy1, dx2, dy2) => {
          const stepped = panBy(panBy(camera, dx1, dy1), dx2, dy2);
          const direct = panBy(camera, dx1 + dx2, dy1 + dy2);
          expect(stepped.x).toBeCloseTo(direct.x, 6);
          expect(stepped.y).toBeCloseTo(direct.y, 6);
        },
      ),
    );
  });
});

describe("cameraToCenter", () => {
  it("pans the camera so the node's rendered rect lands dead-center", () => {
    // Viewport 800×600 at the origin; the live node renders at (900, 700)
    // sized 200×120 — its center (1000, 760) must move to (400, 300), so the
    // camera slides by (−600, −460). Scale is untouched; rects are
    // post-transform, so no separate scale factor applies.
    const next = cameraToCenter(
      { x: 50, y: 20, scale: 1.5 },
      { left: 0, top: 0, width: 800, height: 600 },
      { left: 900, top: 700, width: 200, height: 120 },
    );
    expect(next).toEqual({ x: -550, y: -440, scale: 1.5 });
  });

  it("is a no-op when the node is already centered", () => {
    const camera = { x: 12, y: -8, scale: 2 };
    const next = cameraToCenter(
      camera,
      { left: 100, top: 40, width: 400, height: 300 },
      { left: 200, top: 130, width: 200, height: 120 },
    );
    expect(next).toEqual(camera);
  });
});
