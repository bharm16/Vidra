import { useCallback, useEffect, useRef, useState } from "react";
import { canAnimate, STILL, type Motion } from "./play";
import { fold, grow, originOf, type FoldMotion, type GrowMotion, type Origin } from "./surface";

export type MotionSource = Element | Origin | null | undefined;

export interface SurfacePresenceOptions {
  /** What the surface grows out of and, unless `target` says otherwise, folds back into. */
  origin(surface: HTMLElement): MotionSource;
  target?(surface: HTMLElement): MotionSource;
  backdrop?(): Element | null | undefined;
  grow: GrowMotion | (() => GrowMotion);
  fold: FoldMotion | (() => FoldMotion);
  /** True when another surface takes over this one's shell, so it leaves without folding. */
  handOff?(): boolean;
}

const resolve = <T,>(motion: T | (() => T)): T => (typeof motion === "function" ? (motion as () => T)() : motion);

export function resolveOrigin(source: MotionSource): Origin | undefined {
  if (!source) return undefined;
  if (source instanceof Element) return source.isConnected ? originOf(source) : undefined;
  return source;
}

/** Radix holds a popper at translate(0, -200%) until floating-ui has placed it. */
function whenPlaced(surface: HTMLElement): Promise<void> {
  const wrapper = surface.closest<HTMLElement>("[data-radix-popper-content-wrapper]");
  if (!wrapper) return Promise.resolve();
  return new Promise(placed => {
    let frames = 0;
    const check = (): void => {
      if (!wrapper.style.transform.includes("-200%") || frames++ > 30) placed();
      else requestAnimationFrame(check);
    };
    check();
  });
}

/**
 * Keeps a surface mounted while it folds back into where it came from. Mount the
 * surface while `present` is true, and put `ref` on its element.
 */
export function useSurfacePresence(open: boolean, options: SurfacePresenceOptions): { present: boolean; ref(node: HTMLElement | null): void } {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  if (!open && mounted && !canAnimate()) setMounted(false);
  const surface = useRef<HTMLElement | null>(null);
  const settings = useRef(options);
  settings.current = options;
  const motion = useRef<Motion>(STILL);
  const folding = useRef(false);

  const growFromOrigin = useCallback((node: HTMLElement): void => {
    motion.current.cancel();
    folding.current = false;
    // Hidden until placed, so the first painted frame is the grow's first frame.
    const inline = node.style.opacity;
    node.style.opacity = "0";
    void whenPlaced(node).then(() => {
      if (surface.current !== node) return;
      const current = settings.current;
      motion.current = grow(node, resolveOrigin(current.origin(node)), resolve(current.grow), current.backdrop?.());
      node.style.opacity = inline;
    });
  }, []);

  const ref = useCallback((node: HTMLElement | null): void => {
    // Radix composes inline refs, so every render detaches and re-attaches the same node; only a new node grows.
    if (!node || node === surface.current) return;
    surface.current = node;
    if (canAnimate()) growFromOrigin(node);
  }, [growFromOrigin]);

  useEffect(() => {
    const node = surface.current;
    if (open) {
      if (folding.current && node) growFromOrigin(node);
      return;
    }
    if (!mounted) return;
    if (!node?.isConnected) {
      setMounted(false);
      return;
    }
    motion.current.cancel();
    const current = settings.current;
    if (current.handOff?.()) {
      setMounted(false);
      return;
    }
    folding.current = true;
    const folded = fold(node, resolveOrigin(current.target?.(node) ?? current.origin(node)), resolve(current.fold), current.backdrop?.());
    motion.current = folded;
    let live = true;
    void folded.finished.then(() => {
      if (!live || !folding.current) return;
      folding.current = false;
      setMounted(false);
    });
    return () => { live = false; };
  }, [open, mounted, growFromOrigin]);

  useEffect(() => {
    const running = motion;
    return () => running.current.cancel();
  }, []);
  return { present: open || mounted, ref };
}
