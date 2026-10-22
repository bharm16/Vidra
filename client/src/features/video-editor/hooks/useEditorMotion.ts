import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import { spring } from "@/components/motion/easing";
import { stretch, travel, type FlipChanges } from "@/components/motion/FlipScope";
import { placeGhost, stillCopy } from "@/components/motion/ghost";
import { canAnimate, group, play } from "@/components/motion/play";
import { cornerOf, delayed, DIALOG_FOLD, layoutRect, MENU_FOLD, MENU_GROW, MENU_TO_DIALOG, NOTICE_FOLD, NOTICE_GROW, originOf, TIMING_FOLD, type Origin } from "@/components/motion/surface";
import { useSurfacePresence } from "@/components/motion/useSurfacePresence";

/** Clips swap and close gaps with one spring; a removed clip collapses with a stiffer one (frames 2700, 2713). */
const CLIP_TRAVEL = { duration: 420, easing: spring(0.06) };
const CLIP_COLLAPSE = { duration: 420, easing: spring(0.04) };
/** A moved clip's caption and sound follow it 20ms behind. */
const FOLLOW_MS = 20;
/** "Clip moved" grows 0.2s after the clips start; "Clip removed" 0.3s after the clip collapses. */
const NOTICE_AFTER = { move: 200, removal: 300 } as const;
/** DIALOG_FOLD lands after its 40ms delay and 300ms fold. */
const DIALOG_LANDS_MS = 340;
/** After a removal the preview crossfades to what is now under the playhead, 120ms into the collapse. */
const PREVIEW_SWAP = { after: 120, duration: 300 };

interface MenuHandover {
  origin: Origin;
  rect: DOMRect;
  ghost: HTMLElement | undefined;
  parent: Element | null;
}

interface EditorMotionInput {
  stage: RefObject<HTMLElement | null>;
  /** Clip timing and the clip menu, which grow out of the selected clip. */
  clipPanelOpen: boolean;
  selectedItemId: string | undefined;
  removing: boolean;
  removingItemId: string | undefined;
  change: "move" | "removal" | undefined;
}

/**
 * The editor's continuity: clip menus grow out of their clip, the clip menu becomes the
 * remove dialog, the dialog folds into the clip before it collapses, clips travel to their
 * new places and the change notice grows from the stage's corner.
 */
export function useEditorMotion({ stage, clipPanelOpen, selectedItemId, removing, removingItemId, change }: EditorMotionInput): {
  clipPanel: { present: boolean; ref(node: HTMLElement | null): void };
  removal: { present: boolean; ref(node: HTMLElement | null): void; backdrop: RefObject<HTMLDivElement> };
  notice: { present: boolean; ref(node: HTMLElement | null): void; change: "move" | "removal" | undefined };
  timeline: RefObject<HTMLElement | null>;
  reflowTimeline(changes: FlipChanges): void;
  capturePreview(node: HTMLElement): HTMLElement | undefined;
  crossfadePreview(changes: FlipChanges): void;
  movedFromTiming(itemId: string): void;
  wasMovedFromTiming(itemId: string): boolean;
  handOverMenu(): void;
  confirmRemoval(): void;
} {
  const timeline = useRef({ get current(): HTMLElement | null { return stage.current?.querySelector<HTMLElement>(".ve-timeline") ?? null; } }).current;
  const clipOrigin = useCallback((id: string | undefined): Origin | undefined => {
    const node = id ? stage.current?.querySelector<HTMLElement>(`.ve-timeline-item[data-item-id="${id}"]`) : null;
    return node ? { rect: layoutRect(node), radius: getComputedStyle(node).borderRadius } : undefined;
  }, [stage]);
  const selected = useRef(selectedItemId);
  selected.current = selectedItemId;
  const moved = useRef<string>();
  const handover = useRef<MenuHandover>();
  const collapseAt = useRef(0);
  const removalPending = useRef(false);
  const collapseDelay = useRef(0);
  const removed = useRef(removingItemId);
  if (removingItemId) removed.current = removingItemId;
  const lastChange = useRef(change);
  if (change) lastChange.current = change;
  const backdrop = useRef<HTMLDivElement>(null);
  const clipPanelNode = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => { if (clipPanelOpen) moved.current = undefined; }, [clipPanelOpen]);
  const clipPresence = useSurfacePresence(clipPanelOpen, {
    origin: () => clipOrigin(selected.current),
    target: () => clipOrigin(moved.current ?? selected.current),
    grow: MENU_GROW,
    fold: () => (moved.current ? TIMING_FOLD : MENU_FOLD),
    handOff: () => handover.current !== undefined,
  });
  const { ref: attachClipPanel } = clipPresence;
  const clipPanelRef = useCallback((node: HTMLElement | null): void => { clipPanelNode.current = node; attachClipPanel(node); }, [attachClipPanel]);
  const removalPresence = useSurfacePresence(removing, {
    origin: () => handover.current?.origin ?? clipOrigin(removed.current),
    target: () => clipOrigin(removed.current),
    backdrop: () => backdrop.current,
    grow: () => (handover.current ? MENU_TO_DIALOG : MENU_GROW),
    fold: DIALOG_FOLD,
  });
  const noticePresence = useSurfacePresence(Boolean(change), {
    origin: surface => cornerOf(surface),
    grow: () => delayed(NOTICE_GROW, lastChange.current === "removal" ? collapseDelay.current + NOTICE_AFTER.removal : NOTICE_AFTER.move),
    fold: NOTICE_FOLD,
  });

  // The menu's words leave while its surface becomes the dialog; its box is the dialog's shell.
  useLayoutEffect(() => {
    const menu = handover.current;
    if (!removing || !menu?.ghost || !menu.parent?.isConnected) return;
    const ghost = placeGhost(menu.ghost, menu.rect, menu.parent);
    Object.assign(ghost.style, { background: "transparent", borderColor: "transparent", boxShadow: "none" });
    const words = group([play(ghost, [{ opacity: 1, filter: "blur(0px)" }, { opacity: 0, filter: "blur(4px)" }], { duration: 100 }, "both")], () => { ghost.remove(); handover.current = undefined; });
    return () => words.cancel();
  }, [removing]);

  const reflowTimeline = useCallback(({ moved: travelled, left, entered }: FlipChanges): void => {
    // A removal waits until its dialog has folded into the clip.
    const delay = Math.max(0, collapseAt.current - performance.now());
    collapseDelay.current = delay;
    const follow = left.length ? 0 : FOLLOW_MS;
    for (const { node, box, to } of travelled) {
      const follower = node.classList.contains("ve-caption-cue") || (node.classList.contains("ve-audio-track") && !node.classList.contains("ve-music-track"));
      const timing = { ...CLIP_TRAVEL, delay: delay + (follower ? follow : 0) };
      travel(node, box, to, timing);
      stretch(node, box, to, timing);
    }
    for (const { node, from, parent, next } of left) {
      const ghost = placeGhost(node, from.rect, parent, next);
      group([play(ghost, [{ width: ghost.style.width }, { width: "1px" }], { ...CLIP_COLLAPSE, delay }, "both"), play(ghost, [{ opacity: 1 }, { opacity: 0 }], { delay, duration: 360 }, "both")], () => ghost.remove());
    }
    // Something new in the lane, such as Add media where the edit now ends, waits for the gap to close.
    for (const node of entered) play(node, [{ opacity: 0 }, { opacity: 1 }], { delay: left.length ? delay + CLIP_TRAVEL.duration : 0, duration: 200 });
  }, []);
  const capturePreview = useCallback((node: HTMLElement): HTMLElement | undefined => (removalPending.current ? stillCopy(node) : undefined), []);
  const crossfadePreview = useCallback(({ moved: previews }: FlipChanges): void => {
    for (const { node, box, still } of previews) {
      if (!still || !node.parentElement) continue;
      removalPending.current = false;
      const ghost = placeGhost(still, box, node.parentElement, node.nextSibling);
      const delay = Math.max(0, collapseAt.current - performance.now()) + PREVIEW_SWAP.after;
      group([play(ghost, [{ opacity: 1 }, { opacity: 0 }], { delay, duration: PREVIEW_SWAP.duration }, "both")], () => ghost.remove());
    }
  }, []);

  return {
    clipPanel: { present: clipPresence.present, ref: clipPanelRef },
    removal: { present: removalPresence.present, ref: removalPresence.ref, backdrop },
    notice: { present: noticePresence.present, ref: noticePresence.ref, change: change ?? lastChange.current },
    timeline,
    reflowTimeline,
    capturePreview,
    crossfadePreview,
    movedFromTiming: itemId => { moved.current = itemId; },
    wasMovedFromTiming: itemId => moved.current === itemId,
    handOverMenu: () => {
      const menu = clipPanelNode.current;
      if (!menu?.isConnected || !canAnimate()) return;
      const copy = menu.cloneNode(true);
      handover.current = { origin: originOf(menu, true), rect: menu.getBoundingClientRect(), ghost: copy instanceof HTMLElement ? copy : undefined, parent: menu.parentElement };
    },
    confirmRemoval: () => { collapseAt.current = performance.now() + DIALOG_LANDS_MS; removalPending.current = true; },
  };
}
