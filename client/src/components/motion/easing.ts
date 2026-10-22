/**
 * Vidra's motion values, decoded from the approved Figma Motion timelines
 * (page 04 › "Motion (2026-10-20)"). Nothing here reuses the retired
 * duration/ease tokens.
 */

/**
 * Figma exports each spring as `1 − e^(−a·t)·(cos(b·t) + (a/b)·sin(b·t))`, with t
 * normalised over its keyframe segment. The damping ratio is a/√(a²+b²) and the
 * bounce is 1 − ratio, so each key below is the bounce the design names.
 */
const SPRINGS = {
  0: [11.1803, 0.1581],
  0.04: [8.3958, 2.4488],
  0.06: [8.2309, 2.9874],
  0.08: [8.1159, 3.4574],
  0.1: [8.0277, 3.888],
  0.12: [7.956, 4.2942],
  0.14: [7.8955, 4.6849],
  0.15: [7.8685, 4.8764],
} as const;

export type Bounce = keyof typeof SPRINGS;

/** Progress along a Figma spring at normalised time t. */
export function springAt(bounce: Bounce, t: number): number {
  if (t >= 1) return 1;
  const [a, b] = SPRINGS[bounce];
  return 1 - Math.exp(-a * t) * (Math.cos(b * t) + (a / b) * Math.sin(b * t));
}

/** Fades, blurs, radii, colours and every move that closes. */
export const OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

const STOPS = 48;
const springs = new Map<Bounce, string>();

/** A CSS easing that replays a Figma spring; browsers without `linear()` fall back to OUT. */
export function spring(bounce: Bounce): string {
  const cached = springs.get(bounce);
  if (cached) return cached;
  const supported = typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("animation-timing-function", "linear(0, 1)");
  const easing = supported ? `linear(${Array.from({ length: STOPS + 1 }, (_, index) => Number(springAt(bounce, index / STOPS).toFixed(4))).join(", ")})` : OUT;
  springs.set(bounce, easing);
  return easing;
}
