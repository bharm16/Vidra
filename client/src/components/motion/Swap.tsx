import { Component, type ReactNode } from "react";
import { placeGhost } from "./ghost";
import { canAnimate, group, play, reducedMotion } from "./play";

export interface SwapPhase {
  delay?: number;
  duration: number;
  /** Blur in px the leaving content blurs to, or the arriving content sharpens from. */
  blur?: number;
}

export interface SwapMotion {
  out: SwapPhase;
  in: SwapPhase;
}

/** A chip's value changing as its menu folds (frame 2687). */
export const CHIP_VALUE: SwapMotion = { out: { delay: 100, duration: 120 }, in: { delay: 100, duration: 120 } };
/** The same change as the B13 sheet folds (frame 2702). */
export const CHIP_VALUE_SHEET: SwapMotion = { out: { delay: 160, duration: 140 }, in: { delay: 160, duration: 140 } };
/** Content swapping inside a control as it reshapes, such as Export becoming "Exporting N%" (frame 2694). */
export const CONTENT_SWAP: SwapMotion = { out: { duration: 140, blur: 3 }, in: { delay: 30, duration: 170, blur: 3 } };
/** Words changing as the composer reshapes for another output: a chip's contents, the primary's label (frame 2681). */
export const RESHAPE_VALUE: SwapMotion = { out: { duration: 140, blur: 3 }, in: { delay: 30, duration: 200, blur: 3 } };
/** A panel turning Ready in place (frame 2694). */
export const PANEL_STATE: SwapMotion = { out: { duration: 140, blur: 3 }, in: { delay: 50, duration: 200, blur: 3 } };

interface SwapProps {
  /** A new key crossfades the old content into the new; equal keys update in place. */
  swapKey: string | number | boolean | undefined;
  motion?: SwapMotion;
  /** Changes in place because another motion carries the change. */
  still?: boolean;
  className?: string;
  /** A div for block content such as a panel's text or action row. */
  as?: "span" | "div";
  children: ReactNode;
}

interface Snapshot {
  ghost: HTMLElement;
  rect: DOMRect;
}

/**
 * Crossfades content that changes in place: the old content stays where it was and
 * blurs out while the new content sharpens in, as in the Figma timelines' layered swaps.
 */
export class Swap extends Component<SwapProps> {
  private readonly root: { current: HTMLElement | null } = { current: null };
  private readonly attach = (element: HTMLElement | null): void => { this.root.current = element; };

  override getSnapshotBeforeUpdate(previous: Readonly<SwapProps>): Snapshot | null {
    const node = this.root.current;
    if (previous.swapKey === this.props.swapKey || this.props.still || !node || !canAnimate() || reducedMotion()) return null;
    const ghost = node.cloneNode(true);
    return ghost instanceof HTMLElement ? { ghost, rect: node.getBoundingClientRect() } : null;
  }

  override componentDidUpdate(_previous: Readonly<SwapProps>, _state: unknown, snapshot: Snapshot | null): void {
    const node = this.root.current;
    const parent = node?.parentElement;
    if (!snapshot || !node || !parent) return;
    const { out, in: arrive } = this.props.motion ?? CONTENT_SWAP;
    const ghost = placeGhost(snapshot.ghost, snapshot.rect, parent, node);
    group([
      play(ghost, [{ opacity: 1, filter: "blur(0px)" }, { opacity: 0, filter: `blur(${out.blur ?? 0}px)` }], { delay: out.delay ?? 0, duration: out.duration }, "both"),
      play(node, [{ opacity: 0, filter: `blur(${arrive.blur ?? 0}px)` }, { opacity: 1, filter: "blur(0px)" }], { delay: arrive.delay ?? 0, duration: arrive.duration }),
    ], () => ghost.remove());
  }

  override render(): ReactNode {
    const className = this.props.className ? `m-swap ${this.props.className}` : "m-swap";
    return this.props.as === "div" ? <div ref={this.attach} className={className}>{this.props.children}</div> : <span ref={this.attach} className={className}>{this.props.children}</span>;
  }
}
