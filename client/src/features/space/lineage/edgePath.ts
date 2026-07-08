export interface EdgePoint {
  x: number;
  y: number;
}

/**
 * SVG path for a spine connector between two node anchor points — a cubic
 * bezier whose control points sit at the horizontal midpoint, so the curve
 * leaves the source and meets the target tangent to horizontal (the handoff's
 * left→right lineage flow). Coordinates are rounded to keep the string tidy.
 */
export function edgePath(from: EdgePoint, to: EdgePoint): string {
  const fx = Math.round(from.x);
  const fy = Math.round(from.y);
  const tx = Math.round(to.x);
  const ty = Math.round(to.y);
  const mx = Math.round((from.x + to.x) / 2);
  return `M${fx},${fy} C${mx},${fy} ${mx},${ty} ${tx},${ty}`;
}
