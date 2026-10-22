import { useLayoutEffect, useRef } from "react";
import { spring } from "@/components/motion/easing";
import { travel, type FlipChanges } from "@/components/motion/FlipScope";
import { placeGhost } from "@/components/motion/ghost";
import { group, play } from "@/components/motion/play";
import { BUTTON_RESHAPE, reshape } from "@/components/motion/surface";
import { RESHAPE_VALUE } from "@/components/motion/Swap";
import type { OutputGroup } from "../components/OutputSwitch";

/** Chips and tiles the new output drops fade in 0.16s, their words blurring out with the others', while a chip's shell closes in 0.2s (frame 2681). */
const LEAVE = { fade: { duration: 160 }, close: { duration: 200 } };
/** Chips it adds open with a b08 spring as they fade in; new tiles wait 0.1s for their slot to clear. */
const ENTER = { open: { duration: 300, easing: spring(0.08) }, fade: { duration: 200 }, tileWait: 100 };
const TRAVEL = BUTTON_RESHAPE.geometry;

interface Placed {
  rect: DOMRect;
}
interface OldChip extends Placed {
  /** The chip as it was: a copy, or React's detached node. */
  copy: HTMLElement | undefined;
}
interface NewChip extends Placed {
  node: HTMLElement;
}

/** Chips wrap like words, so reading order is their slot order. */
function reading(a: Placed, b: Placed): number {
  return Math.abs(a.rect.top - b.rect.top) > 4 ? a.rect.top - b.rect.top : a.rect.left - b.rect.left;
}

/** A chip or tile the new output drops fades out where it was; a chip's shell also closes. */
function vanish(ghost: HTMLElement, rect: DOMRect, parent: Element, next: Node | null, close: boolean): void {
  placeGhost(ghost, rect, parent, next);
  ghost.style.overflow = "hidden";
  const { out } = RESHAPE_VALUE;
  group([
    play(ghost, [{ opacity: 1 }, { opacity: 0 }], LEAVE.fade, "both"),
    play(ghost, [{ filter: "blur(0px)" }, { filter: `blur(${out.blur ?? 0}px)` }], { duration: out.duration }, "both"),
    close ? play(ghost, [{ width: ghost.style.width }, { width: "0px" }], LEAVE.close, "both") : undefined,
  ], () => ghost.remove());
}

/** The chip in this slot becomes the new one: its shell springs to the new box while the words ride it, old out and new in. */
function morph({ node, rect: to }: NewChip, { rect: from, copy }: OldChip): void {
  const changed = copy?.textContent !== node.textContent;
  const still = Math.abs(from.left - to.left) < 0.5 && Math.abs(from.top - to.top) < 0.5 && Math.abs(from.width - to.width) < 0.5;
  if (!changed && still) return;
  reshape(node, from, TRAVEL);
  travel(node, from, to, TRAVEL);
  if (!changed || !copy || !node.parentElement) return;
  const { out, in: arrive } = RESHAPE_VALUE;
  // The old words leave as a copy without paint; the shell is the box now.
  const ghost = placeGhost(copy, from, node.parentElement, node);
  for (const name of ["background-color", "border-color"]) ghost.style.setProperty(name, "transparent", "important");
  group([
    play(ghost, [{ translate: "0px 0px" }, { translate: `${to.left - from.left}px ${to.top - from.top}px` }], TRAVEL, "both"),
    play(ghost, [{ opacity: 1, filter: "blur(0px)" }, { opacity: 0, filter: `blur(${out.blur ?? 0}px)` }], { duration: out.duration }, "both"),
  ], () => ghost.remove());
  play(node, [{ opacity: 0, filter: `blur(${arrive.blur ?? 0}px)` }, { opacity: 1, filter: "blur(0px)" }], { delay: arrive.delay ?? 0, duration: arrive.duration });
}

/** A chip with no slot before grows its shell from nothing while it fades in. */
function appear({ node, rect }: NewChip): void {
  reshape(node, new DOMRect(rect.left, rect.top, 0, rect.height), ENTER.open);
  play(node, [{ opacity: 0 }, { opacity: 1 }], ENTER.fade);
}

export interface OutputReshape {
  /** What FlipScope watches: the output the request makes. */
  output: OutputGroup | undefined;
  /** True while rendering the commit that switches Video ↔ Image. */
  switching: boolean;
  /** Keeps a copy of each chip before the commit, for its words to leave from. */
  capture(node: HTMLElement): HTMLElement | undefined;
  chips(changes: FlipChanges): void;
  tiles(changes: FlipChanges): void;
}

/**
 * Switching Video ↔ Image reshapes the composer in place (frame 2681): each chip slot's
 * shell springs to the new output's chip while its words cross-fade, surplus chips fade out
 * and new ones grow in; tiles slide to their slots, and the words stay.
 */
export function useOutputReshape(output: OutputGroup | undefined): OutputReshape {
  const shown = useRef(output);
  const switching = shown.current !== undefined && output !== undefined && shown.current !== output;
  useLayoutEffect(() => { shown.current = output; });
  return {
    output,
    switching,
    capture: node => {
      if (!switching) return undefined;
      const copy = node.cloneNode(true);
      return copy instanceof HTMLElement ? copy : undefined;
    },
    chips: ({ moved, left, entered }) => {
      const row = moved[0]?.node.parentElement ?? left[0]?.parent ?? entered[0]?.parentElement;
      if (!switching || !row) return;
      const before: OldChip[] = [...moved.map(({ box, still }) => ({ rect: box, copy: still })), ...left.map(({ node, from }) => ({ rect: from.rect, copy: node }))].sort(reading);
      const after: NewChip[] = [...moved.map(({ node, to }) => ({ node, rect: to })), ...entered.map(node => ({ node, rect: node.getBoundingClientRect() }))].sort(reading);
      after.forEach((chip, slot) => {
        const old = before[slot];
        if (old) morph(chip, old);
        else appear(chip);
      });
      for (const { rect, copy } of before.slice(after.length)) if (copy) vanish(copy, rect, row, null, true);
    },
    tiles: ({ moved, left, entered }) => {
      if (!switching) return;
      for (const { node, box, to } of moved) travel(node, box, to, TRAVEL);
      for (const { node, from, parent, next } of left) vanish(node, from.rect, parent, next, false);
      for (const node of entered) play(node, [{ opacity: 0 }, { opacity: 1 }], { ...ENTER.fade, delay: ENTER.tileWait });
    },
  };
}
