import { OUT } from "./easing";

/** Milliseconds; easing defaults to OUT. */
export interface Timing {
  duration: number;
  delay?: number;
  easing?: string;
  /** e.g. "::before", where a Fresh button keeps its paint. */
  pseudoElement?: string;
}

/** A running piece of motion that can be stopped part-way and still leaves the page clean. */
export interface Motion {
  finished: Promise<void>;
  cancel(): void;
}

export const STILL: Motion = { finished: Promise.resolve(), cancel: () => undefined };

/** People who ask for less motion get opacity only, 150ms at most, and no loops. */
export function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

/** Where the Web Animations API is missing (jsdom, old browsers) every change is immediate. */
export function canAnimate(): boolean {
  return typeof Element !== "undefined" && typeof Element.prototype.animate === "function";
}

/** One Web Animation, or undefined where nothing can animate. */
export function play(element: Element, keyframes: Keyframe[], { duration, delay = 0, easing = OUT, pseudoElement }: Timing, fill: FillMode = "backwards"): Animation | undefined {
  if (!canAnimate()) return undefined;
  return element.animate(keyframes, { duration, delay, easing, fill, ...(pseudoElement ? { pseudoElement } : {}) });
}

/** Groups animations into one Motion; `cleanup` runs once, on finish or on cancel. */
export function group(animations: ReadonlyArray<Animation | undefined>, cleanup: () => void = () => undefined): Motion {
  const running = animations.filter((animation): animation is Animation => animation !== undefined);
  let done = false;
  const finish = (): void => {
    if (done) return;
    done = true;
    cleanup();
  };
  const finished = Promise.all(running.map(animation => animation.finished.then(() => undefined, () => undefined))).then(finish);
  return { finished, cancel: () => { for (const animation of running) animation.cancel(); finish(); } };
}
