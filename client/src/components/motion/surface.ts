import { spring } from "./easing";
import { group, play, reducedMotion, STILL, type Motion, type Timing } from "./play";

/** The two colours Figma's shells morph; everything else comes from the surface itself. */
export interface Paint {
  backgroundColor: string;
  borderColor: string;
  borderWidth: string;
}

/** Where a surface grows out of, folds back into, or was before it changed shape. */
export interface Origin {
  rect: DOMRect;
  radius: string;
  paint?: Paint;
}

export interface GrowMotion {
  geometry: Timing;
  radius?: Timing;
  /** Omitted when the shell starts opaque, as a button that changes shape does. */
  fade?: Timing;
  paint?: Timing;
  /** The surface's own content sharpens in from a blur. */
  content?: { delay: number; opacity: number; blur: number; from: number };
  /** A sheet's or dialog's backdrop dims in alongside. */
  backdrop?: Timing;
}

export interface FoldMotion {
  content: { duration: number; to: number };
  geometry: Timing;
  radius?: Timing;
  fade: Timing;
  backdrop?: Timing;
}

/** G04 chip menu, the Export and Import panels and the clip menu (frames 2687, 2694, 2697, 2713). */
export const MENU_GROW: GrowMotion = { geometry: { duration: 360, easing: spring(0.15) }, radius: { duration: 300 }, fade: { duration: 80 }, content: { delay: 140, opacity: 180, blur: 200, from: 6 } };
export const MENU_FOLD: FoldMotion = { content: { duration: 80, to: 4 }, geometry: { delay: 40, duration: 240 }, radius: { delay: 40, duration: 240 }, fade: { delay: 140, duration: 130 } };
/** B13 bottom sheet growing out of the tapped chip (frame 2702). */
export const SHEET_GROW: GrowMotion = { geometry: { duration: 420, easing: spring(0.12) }, radius: { duration: 360 }, fade: { duration: 80 }, content: { delay: 200, opacity: 200, blur: 220, from: 6 }, backdrop: { duration: 300 } };
export const SHEET_FOLD: FoldMotion = { content: { duration: 100, to: 4 }, geometry: { delay: 40, duration: 300 }, radius: { delay: 40, duration: 280 }, fade: { delay: 200, duration: 140 }, backdrop: { delay: 40, duration: 280 } };
/** "Clip moved" / "Clip removed" growing from the stage's corner (frames 2700, 2713). */
export const NOTICE_GROW: GrowMotion = { geometry: { duration: 360, easing: spring(0.12) }, fade: { duration: 80 }, content: { delay: 140, opacity: 180, blur: 200, from: 6 } };
export const NOTICE_FOLD: FoldMotion = { content: { duration: 100, to: 4 }, geometry: { delay: 40, duration: 240 }, fade: { delay: 180, duration: 120 } };
/** The Import panel folding back once the upload lands (frame 2697). */
export const IMPORT_FOLD: FoldMotion = { content: { duration: 120, to: 4 }, geometry: { delay: 60, duration: 260 }, radius: { delay: 60, duration: 260 }, fade: { delay: 180, duration: 140 } };
/** The timing popover folding into the clip it just moved (frame 2700). */
export const TIMING_FOLD: FoldMotion = { content: { duration: 100, to: 4 }, geometry: { delay: 30, duration: 360, easing: spring(0.06) }, radius: { delay: 30, duration: 300 }, fade: { delay: 60, duration: 140 } };
/** The clip menu's own surface becoming the confirm dialog, and the dialog folding into the clip (frame 2713). */
export const MENU_TO_DIALOG: GrowMotion = { geometry: { duration: 420, easing: spring(0.1) }, radius: { duration: 340 }, paint: { duration: 360 }, content: { delay: 240, opacity: 200, blur: 220, from: 6 }, backdrop: { duration: 300 } };
export const DIALOG_FOLD: FoldMotion = { content: { duration: 100, to: 4 }, geometry: { delay: 40, duration: 300 }, radius: { delay: 40, duration: 240 }, fade: { delay: 240, duration: 100 }, backdrop: { duration: 260 } };
/** Export becoming "Exporting N%" and back; the toolbar travels with the same spring (frame 2694). */
export const BUTTON_RESHAPE = { geometry: { duration: 340, easing: spring(0.08) }, paint: { duration: 250 } };
/** A switch's selection: the leading edge reaches the new choice in 0.1s and the trailing edge follows with a b12 spring (frames 2681, 2715). */
export const PILL_STRETCH = { lead: { duration: 100 }, trail: { delay: 100, duration: 240, easing: spring(0.12) } };

export function paintOf(element: Element): Paint {
  const style = getComputedStyle(element);
  const transparent = style.backgroundColor === "rgba(0, 0, 0, 0)" || style.backgroundColor === "transparent";
  // Fresh buttons are transparent and paint a ::before layer instead.
  return { backgroundColor: transparent && getComputedStyle(element, "::before").content !== "none" ? buttonPaint(element) : style.backgroundColor, borderColor: style.borderTopColor, borderWidth: style.borderTopWidth };
}

export function originOf(element: Element, withPaint = false): Origin {
  const style = getComputedStyle(element);
  const rect = paintedRect(element, style);
  return withPaint ? { rect, radius: style.borderRadius, paint: paintOf(element) } : { rect, radius: style.borderRadius };
}

/** What is on screen: a Fresh button's ::before layer, which may still be travelling, or the element's own box. */
function paintedRect(element: Element, style: CSSStyleDeclaration): DOMRect {
  const box = element.getBoundingClientRect();
  if (style.backgroundColor !== "rgba(0, 0, 0, 0)") return box;
  const layer = getComputedStyle(element, "::before");
  if (layer.content === "none" || layer.position !== "absolute") return box;
  const [left, top, right, bottom] = [layer.left, layer.top, layer.right, layer.bottom].map(value => Number.parseFloat(value) || 0) as [number, number, number, number];
  return new DOMRect(box.left + left, box.top + top, box.width - left - right, box.height - top - bottom);
}

interface Stage {
  shell: HTMLElement;
  box(rect: DOMRect): Keyframe;
  restore(): void;
}

const HIDDEN_PAINT: ReadonlyArray<readonly [string, string]> = [["background-color", "transparent"], ["background-image", "none"], ["border-color", "transparent"], ["box-shadow", "none"], ["backdrop-filter", "none"]];

/**
 * Puts a shell carrying the surface's paint just beneath it, as the Figma shells do,
 * so the box can change size while the content inside never stretches. The shell is a
 * sibling because surfaces such as menus clip their own overflow.
 */
function stage(surface: HTMLElement): Stage {
  const style = getComputedStyle(surface);
  const positioned = style.position !== "static";
  const shell = document.createElement("div");
  shell.setAttribute("aria-hidden", "true");
  shell.dataset.motionShell = "";
  Object.assign(shell.style, {
    position: style.position === "fixed" ? "fixed" : "absolute", left: "0px", top: "0px", width: "100px", height: "100px", margin: "0", padding: "0",
    boxSizing: "border-box", pointerEvents: "none", zIndex: positioned ? style.zIndex : "auto",
    backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage, borderStyle: style.borderTopStyle, borderColor: style.borderTopColor,
    borderTopWidth: style.borderTopWidth, borderRightWidth: style.borderRightWidth, borderBottomWidth: style.borderBottomWidth, borderLeftWidth: style.borderLeftWidth,
    borderRadius: style.borderRadius, boxShadow: style.boxShadow, backdropFilter: style.backdropFilter,
  });
  surface.before(shell);
  // The shell's own rect at 0,0 maps viewport pixels into its containing block, scale included.
  const frame = shell.getBoundingClientRect();
  const scaleX = frame.width / 100 || 1;
  const scaleY = frame.height / 100 || 1;
  // Buttons transition their colours, which would fade the paint out under the shell and back in after it.
  const overrides = [...HIDDEN_PAINT, ["transition", "none"] as const, ...(positioned ? [] : [["position", "relative"] as const])];
  const previous = overrides.map(([name]) => [name, surface.style.getPropertyValue(name), surface.style.getPropertyPriority(name)] as const);
  for (const [name, value] of overrides) surface.style.setProperty(name, value, "important");
  const put = ([name, value, priority]: (typeof previous)[number]): void => {
    if (value) surface.style.setProperty(name, value, priority);
    else surface.style.removeProperty(name);
  };
  return {
    shell,
    box: rect => ({ left: `${(rect.left - frame.left) / scaleX}px`, top: `${(rect.top - frame.top) / scaleY}px`, width: `${rect.width / scaleX}px`, height: `${rect.height / scaleY}px` }),
    restore: () => {
      shell.remove();
      for (const entry of previous) if (entry[0] !== "transition") put(entry);
      // The paint returns while transitions are still off, so it does not fade back in.
      void getComputedStyle(surface).backgroundColor;
      for (const entry of previous) if (entry[0] === "transition") put(entry);
    },
  };
}

/** The surface reaches its size first; its content sharpens in a little later. */
export function grow(surface: HTMLElement, origin: Origin | undefined, motion: GrowMotion, backdrop?: Element | null): Motion {
  if (reducedMotion()) return group([play(surface, [{ opacity: 0 }, { opacity: 1 }], { duration: 150 }), backdrop ? play(backdrop, [{ opacity: 0 }, { opacity: 1 }], { duration: 150 }) : undefined]);
  const target = surface.getBoundingClientRect();
  const finalRadius = getComputedStyle(surface).borderRadius;
  const finalPaint = paintOf(surface);
  const { shell, box, restore } = stage(surface);
  const from = origin ?? { rect: target, radius: finalRadius };
  const { content } = motion;
  return group([
    play(shell, [box(from.rect), box(target)], motion.geometry, "both"),
    motion.radius ? play(shell, [{ borderRadius: from.radius }, { borderRadius: finalRadius }], motion.radius, "both") : undefined,
    motion.fade ? play(shell, [{ opacity: 0 }, { opacity: 1 }], motion.fade, "both") : undefined,
    from.paint && motion.paint ? repaint(shell, from.paint, finalPaint, motion.paint) : undefined,
    content ? play(surface, [{ opacity: 0 }, { opacity: 1 }], { delay: content.delay, duration: content.opacity }) : undefined,
    content ? play(surface, [{ filter: `blur(${content.from}px)` }, { filter: "blur(0px)" }], { delay: content.delay, duration: content.blur }) : undefined,
    backdrop && motion.backdrop ? play(backdrop, [{ opacity: 0 }, { opacity: 1 }], motion.backdrop) : undefined,
  ], restore);
}

/** The shell changes colour; a borderless surface keeps the old border, fading it into its fill (frame 2713). */
function repaint(shell: HTMLElement, from: Paint, to: Paint, timing: Timing): Animation | undefined {
  const borderless = Number.parseFloat(to.borderWidth) === 0 && Number.parseFloat(from.borderWidth) > 0;
  if (borderless) Object.assign(shell.style, { borderWidth: from.borderWidth, borderStyle: "solid" });
  return play(shell, [{ backgroundColor: from.backgroundColor, borderColor: from.borderColor }, { backgroundColor: to.backgroundColor, borderColor: borderless ? to.backgroundColor : to.borderColor }], timing, "both");
}

/** Content leaves first; the box then folds into `target` and fades as it lands. */
export function fold(surface: HTMLElement, target: Origin | undefined, motion: FoldMotion, backdrop?: Element | null): Motion {
  if (reducedMotion()) return group([play(surface, [{ opacity: 1 }, { opacity: 0 }], { duration: 120 }, "forwards"), backdrop ? play(backdrop, [{ opacity: 1 }, { opacity: 0 }], { duration: 120 }, "forwards") : undefined]);
  if (!surface.isConnected) return STILL;
  const source = surface.getBoundingClientRect();
  const radius = getComputedStyle(surface).borderRadius;
  const { shell, box, restore } = stage(surface);
  const end = target ?? { rect: source, radius };
  return group([
    play(surface, [{ opacity: 1, filter: "blur(0px)" }, { opacity: 0, filter: `blur(${motion.content.to}px)` }], { duration: motion.content.duration }, "forwards"),
    play(shell, [box(source), box(end.rect)], motion.geometry, "both"),
    motion.radius ? play(shell, [{ borderRadius: radius }, { borderRadius: end.radius }], motion.radius, "both") : undefined,
    play(shell, [{ opacity: 1 }, { opacity: 0 }], motion.fade, "both"),
    backdrop && motion.backdrop ? play(backdrop, [{ opacity: 1 }, { opacity: 0 }], motion.backdrop, "both") : undefined,
  ], restore);
}

const reshaping = new WeakMap<Element, Motion>();

/**
 * A box that paints itself changes size and place in a shell, from its old box to where
 * layout now puts it, while its content travels on its own. Call it before any travel
 * starts, so the box measured is the layout one.
 */
export function reshape(surface: HTMLElement, from: DOMRect, timing: Timing): Motion {
  if (reducedMotion()) return STILL;
  // A shell staged over a shell would take the hidden paint for the real one.
  reshaping.get(surface)?.cancel();
  const to = surface.getBoundingClientRect();
  const { shell, box, restore } = stage(surface);
  const motion = group([play(shell, [box(from), box(to)], timing, "both")], () => { restore(); reshaping.delete(surface); });
  reshaping.set(surface, motion);
  return motion;
}

/**
 * A Fresh button keeps its paint in ::before, so a button that changes size takes its new
 * box at once and only that layer travels: its edges move from the old box and its colour
 * changes, while the label inside is already where it belongs.
 */
export function reshapeButton(button: HTMLElement, from: DOMRect, motion: { geometry: Timing }): Motion {
  if (reducedMotion()) return STILL;
  const to = button.getBoundingClientRect();
  const layer = getComputedStyle(button, "::before");
  const edges = (rect: DOMRect): Keyframe => ({ left: `${rect.left - to.left}px`, top: `${rect.top - to.top}px`, right: `${to.right - rect.right}px`, bottom: `${to.bottom - rect.bottom}px` });
  return group([play(button, [edges(from), { left: layer.left, top: layer.top, right: layer.right, bottom: layer.bottom }], { ...motion.geometry, pseudoElement: "::before" })]);
}

/** Stretches a selected Fresh button's ::before out of the choice it replaces, leading edge first. */
export function stretchButton(button: HTMLElement, from: DOMRect, motion = PILL_STRETCH): Motion {
  if (reducedMotion()) return STILL;
  const to = button.getBoundingClientRect();
  const layer = getComputedStyle(button, "::before");
  const left = parseFloat(layer.left) || 0;
  const right = parseFloat(layer.right) || 0;
  const start = { left: `${left + from.left - to.left}px`, right: `${right + to.right - from.right}px` };
  const [lead, trail] = to.left > from.left ? (["right", "left"] as const) : (["left", "right"] as const);
  return group([
    play(button, [{ [lead]: start[lead] }, { [lead]: layer[lead] }], { ...motion.lead, pseudoElement: "::before" }),
    play(button, [{ [trail]: start[trail] }, { [trail]: layer[trail] }], { ...motion.trail, pseudoElement: "::before" }),
  ]);
}

/** The colour a Fresh button shows, which lives on its ::before layer. */
export function buttonPaint(button: Element): string {
  return getComputedStyle(button, "::before").backgroundColor;
}

/** Fades a Fresh button's ::before from one colour to its current one. */
export function repaintButton(button: HTMLElement, from: string, motion: Timing): Motion {
  if (reducedMotion()) return STILL;
  const to = buttonPaint(button);
  return from === to ? STILL : group([play(button, [{ backgroundColor: from }, { backgroundColor: to }], { ...motion, pseudoElement: "::before" })]);
}

/** An element's box where layout puts it, ignoring a FLIP translate still in flight. */
export function layoutRect(element: Element): DOMRect {
  const box = element.getBoundingClientRect();
  const [x = 0, y = 0] = getComputedStyle(element).translate.split(" ").map(value => Number.parseFloat(value) || 0);
  return new DOMRect(box.left - x, box.top - y, box.width, box.height);
}

/** The square a notice grows out of: its own top-right corner (frames 2700, 2713). */
export function cornerOf(surface: Element, size = 40): Origin {
  const box = surface.getBoundingClientRect();
  return { rect: new DOMRect(box.right - size, box.top, size, size), radius: getComputedStyle(surface).borderRadius };
}

/** The same motion starting `ms` later. */
export function delayed(motion: GrowMotion, ms: number): GrowMotion {
  const later = (timing: Timing | undefined): Timing | undefined => (timing ? { ...timing, delay: (timing.delay ?? 0) + ms } : undefined);
  const { geometry, radius, fade, paint, content, backdrop } = motion;
  return { geometry: { ...geometry, delay: (geometry.delay ?? 0) + ms }, ...(radius ? { radius: later(radius) as Timing } : {}), ...(fade ? { fade: later(fade) as Timing } : {}), ...(paint ? { paint: later(paint) as Timing } : {}), ...(content ? { content: { ...content, delay: content.delay + ms } } : {}), ...(backdrop ? { backdrop: later(backdrop) as Timing } : {}) };
}
