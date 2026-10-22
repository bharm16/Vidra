import { useLayoutEffect, useRef, type ReactElement } from "react";
import "./motion.css";
import { play, reducedMotion } from "./play";

/** The ring's centre line, 2px outside a 64×36 r6 thumbnail, from the Figma vector (2694:21169). Starts top-centre, runs clockwise. */
const RING_PATH = "M35 1H61C63.1217 1 65.1566 1.84285 66.6569 3.34315C68.1571 4.84344 69 6.87827 69 9V33C69 35.1217 68.1571 37.1566 66.6569 38.6569C65.1566 40.1571 63.1217 41 61 41H9C6.87827 41 4.84344 40.1571 3.34315 38.6569C1.84285 37.1566 1 35.1217 1 33V9C1 6.87827 1.84285 4.84344 3.34315 3.34315C4.84344 1.84285 6.87827 1 9 1H34.5";

/**
 * Each real update travels over the gap since the previous one, so the ring keeps moving
 * between polls. The Figma steps are 270ms apart; export status polls every 1.5s.
 */
const STEP = { min: 270, max: 1500 };

interface ProgressRingProps {
  /** 0–1 of real progress. */
  value: number;
  /** While false the ring is hidden (CSS); the change between the two fades. */
  active: boolean;
  label: string;
}

/**
 * Real progress (export, upload) traced around the thumbnail's edge; it replaces the
 * progress bar (frames 2694, 2697). Generations never use it.
 */
export function ProgressRing({ value, active, label }: ProgressRingProps): ReactElement {
  const ring = useRef<SVGSVGElement>(null);
  const path = useRef<SVGPathElement>(null);
  const step = useRef<Animation>();
  const updated = useRef(0);
  const shown = useRef(active);
  const clamped = Math.min(1, Math.max(0, value));
  const offset = useRef(1 - clamped);

  useLayoutEffect(() => {
    const node = path.current;
    const target = 1 - clamped;
    // A step still in flight hands its current position to the next one.
    const from = node && step.current?.playState === "running" ? Number.parseFloat(getComputedStyle(node).strokeDashoffset) : offset.current;
    offset.current = target;
    step.current?.cancel();
    const now = performance.now();
    const gap = updated.current ? now - updated.current : STEP.min;
    updated.current = now;
    if (!node || !Number.isFinite(from) || from === target || reducedMotion()) return;
    // Progress moves linearly, like a playhead.
    step.current = play(node, [{ strokeDashoffset: from }, { strokeDashoffset: target }], { duration: Math.min(STEP.max, Math.max(STEP.min, gap)), easing: "linear" });
  }, [clamped]);

  useLayoutEffect(() => {
    const node = ring.current;
    const was = shown.current;
    shown.current = active;
    if (!node || was === active || reducedMotion()) return;
    if (active) play(node, [{ opacity: 0 }, { opacity: 1 }], { delay: 200, duration: 150 });
    else play(node, [{ opacity: 1 }, { opacity: 0 }], { duration: 250 });
  }, [active]);

  return <svg ref={ring} className="m-progress-ring" data-active={active || undefined} width="70" height="42" viewBox="0 0 70 42" fill="none" role="progressbar" aria-label={label} aria-hidden={!active || undefined} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clamped * 100)}>
    <path ref={path} d={RING_PATH} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - clamped} strokeWidth="2" strokeLinecap="round" stroke="#f7f7f7" visibility={clamped > 0 ? undefined : "hidden"} />
  </svg>;
}
