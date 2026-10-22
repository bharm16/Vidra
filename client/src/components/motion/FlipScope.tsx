import { Component, type RefObject } from "react";
import { canAnimate, play, reducedMotion, type Timing } from "./play";
import { originOf, type Origin } from "./surface";

export interface FlipMove {
  node: HTMLElement;
  /** Where its box was, transforms included. */
  box: DOMRect;
  /** What was painted there (a Fresh button's ::before), with its colour. */
  from: Origin;
  to: DOMRect;
  /** Whatever `capture` took before the commit. */
  still: HTMLElement | undefined;
}

export interface FlipLeave {
  /** React's detached node, still holding its media, ready to be put back as a ghost. */
  node: HTMLElement;
  from: Origin;
  parent: Element;
  next: Node | null;
}

export interface FlipChanges {
  moved: FlipMove[];
  left: FlipLeave[];
  entered: HTMLElement[];
}

interface FlipScopeProps {
  /** Elements are measured and replayed only when this value changes. */
  watch: unknown;
  root: RefObject<HTMLElement | null>;
  /** Selector, relative to `root`, for the elements that travel. */
  items: string;
  /** Takes a copy of an element as it is before the commit, such as a still of a preview. */
  capture?(node: HTMLElement): HTMLElement | undefined;
  onFlip(changes: FlipChanges): void;
}

interface Before {
  box: DOMRect;
  origin: Origin;
  parent: Element | null;
  next: Node | null;
  still: HTMLElement | undefined;
}

const flights = new WeakMap<Element, Animation[]>();

/** Stops an element's travel so its layout position can be measured. */
export function land(node: Element): void {
  for (const animation of flights.get(node) ?? []) animation.cancel();
  flights.delete(node);
}

function track(node: Element, animation: Animation | undefined): void {
  if (animation) flights.set(node, [...(flights.get(node) ?? []), animation]);
}

function scaleOf(node: HTMLElement, rect: DOMRect): number {
  return rect.width && node.offsetWidth ? rect.width / node.offsetWidth : 1;
}

/** Moves an element from where it was to where layout now puts it. */
export function travel(node: HTMLElement, from: DOMRect, to: DOMRect, timing: Timing): void {
  const scale = scaleOf(node, to);
  const dx = (from.left - to.left) / scale;
  const dy = (from.top - to.top) / scale;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
  track(node, play(node, [{ translate: `${dx}px ${dy}px` }, { translate: "0px 0px" }], timing));
}

/** Changes an element's width from its old size to its new one; content inside keeps its own layout. */
export function stretch(node: HTMLElement, from: DOMRect, to: DOMRect, timing: Timing): void {
  const scale = scaleOf(node, to);
  if (Math.abs(from.width - to.width) < 0.5) return;
  track(node, play(node, [{ width: `${from.width / scale}px` }, { width: `${to.width / scale}px` }], timing));
}

/**
 * FLIP for React: measures elements just before a commit changes them, then hands the
 * caller every element that moved, left or arrived so each can travel the Figma way.
 */
export class FlipScope extends Component<FlipScopeProps> {
  override getSnapshotBeforeUpdate(previous: Readonly<FlipScopeProps>): Map<HTMLElement, Before> | null {
    const root = this.props.root.current;
    if (Object.is(previous.watch, this.props.watch) || !root || !canAnimate() || reducedMotion()) return null;
    const before = new Map<HTMLElement, Before>();
    for (const node of root.querySelectorAll<HTMLElement>(this.props.items)) {
      if (node.dataset.motionGhost === undefined) before.set(node, { box: node.getBoundingClientRect(), origin: originOf(node, true), parent: node.parentElement, next: node.nextSibling, still: this.props.capture?.(node) });
    }
    return before;
  }

  override componentDidUpdate(_previous: Readonly<FlipScopeProps>, _state: unknown, before: Map<HTMLElement, Before> | null): void {
    const root = this.props.root.current;
    if (!before || !root) return;
    const changes: FlipChanges = { moved: [], left: [], entered: [] };
    for (const [node, { box, origin, parent, next, still }] of before) {
      if (node.isConnected) {
        land(node);
        changes.moved.push({ node, box, from: origin, to: node.getBoundingClientRect(), still });
      } else if (parent?.isConnected) changes.left.push({ node, from: { ...origin, rect: box }, parent, next });
    }
    for (const node of root.querySelectorAll<HTMLElement>(this.props.items)) {
      if (!before.has(node) && node.dataset.motionGhost === undefined) changes.entered.push(node);
    }
    this.props.onFlip(changes);
  }

  override render(): null {
    return null;
  }
}
