/**
 * Space camera math (ADR-0012 / M5). Pure so the fiddly parts — anchored
 * zooming and centering — are testable without a DOM.
 *
 * The infinite-canvas camera: the content plane renders under
 * `translate(x, y) scale(scale)` with origin 0 0, so a world point maps to the
 * screen as `screen = world · scale + (x, y)`. Panning and zooming are pure
 * transforms of this triple; nothing spatial is ever stored (ADR-0012).
 */
export interface CanvasCamera {
  x: number;
  y: number;
  scale: number;
}

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 4;

export const clampScale = (scale: number): number =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/** Slide the camera by a screen-space delta; the scale is untouched. */
export function panBy(
  camera: CanvasCamera,
  dx: number,
  dy: number,
): CanvasCamera {
  return { x: camera.x + dx, y: camera.y + dy, scale: camera.scale };
}

/**
 * Zoom to `targetScale` keeping the world point under `point` fixed on screen
 * (the Figma anchor invariant). Solving `screen = world · s' + offset'` for the
 * unchanged screen/world pair gives the new offset directly.
 */
export function zoomAtPoint(
  camera: CanvasCamera,
  point: { x: number; y: number },
  targetScale: number,
): CanvasCamera {
  const scale = clampScale(targetScale);
  const worldX = (point.x - camera.x) / camera.scale;
  const worldY = (point.y - camera.y) / camera.scale;
  return {
    x: point.x - worldX * scale,
    y: point.y - worldY * scale,
    scale,
  };
}

interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Pan the camera so a node's rendered rect lands dead-center in the viewport.
 * Both rects come from `getBoundingClientRect()` — already post-transform, so
 * the delta is pure screen-space and the scale is untouched.
 */
export function cameraToCenter(
  camera: CanvasCamera,
  viewport: ScreenRect,
  node: ScreenRect,
): CanvasCamera {
  const dx = viewport.left + viewport.width / 2 - (node.left + node.width / 2);
  const dy = viewport.top + viewport.height / 2 - (node.top + node.height / 2);
  return panBy(camera, dx, dy);
}
