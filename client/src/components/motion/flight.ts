import { spring } from "./easing";
import { group, play, reducedMotion, STILL, type Motion } from "./play";
import type { Origin } from "./surface";

/** The Import thumbnail flying into grid slot 0 (frame 2697). */
export const LANDING = { geometry: { duration: 500, easing: spring(0.1) }, radius: { duration: 400 } };

/**
 * Copies what an image or video shows right now. An upload's preview URL is revoked the
 * moment it lands, so the copy is what flies.
 */
export function snapshotPicture(media: Element, maxWidth = 960): HTMLCanvasElement | undefined {
  const width = media instanceof HTMLVideoElement ? media.videoWidth : media instanceof HTMLImageElement ? media.naturalWidth : 0;
  const height = media instanceof HTMLVideoElement ? media.videoHeight : media instanceof HTMLImageElement ? media.naturalHeight : 0;
  if (!width || !height || !(media instanceof HTMLImageElement || media instanceof HTMLVideoElement)) return undefined;
  const scale = Math.min(1, maxWidth / width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  try {
    canvas.getContext("2d")?.drawImage(media, 0, 0, canvas.width, canvas.height);
  } catch {
    return undefined;
  }
  return canvas;
}

/** Flies a picture above the page from one box to another; `remove` hands the slot back. */
export function fly(picture: HTMLElement, from: Origin, to: Origin): { motion: Motion; remove(): void } {
  if (reducedMotion()) return { motion: STILL, remove: () => undefined };
  picture.setAttribute("aria-hidden", "true");
  Object.assign(picture.style, { position: "fixed", left: "0px", top: "0px", margin: "0", objectFit: "cover", pointerEvents: "none", zIndex: "90" });
  document.body.append(picture);
  const box = ({ rect }: Origin): Keyframe => ({ left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  const motion = group([
    play(picture, [box(from), box(to)], LANDING.geometry, "both"),
    play(picture, [{ borderRadius: from.radius }, { borderRadius: to.radius }], LANDING.radius, "both"),
  ]);
  return { motion, remove: () => picture.remove() };
}

function shown(media: Element | null): boolean {
  return media instanceof HTMLImageElement ? media.complete && media.naturalWidth > 0 : media instanceof HTMLVideoElement && media.readyState >= 2;
}

/** Resolves once a container shows its own picture (which may not exist yet), or after `limit` ms. */
export function pictureReady(container: Element, limit: number): Promise<void> {
  return new Promise(ready => {
    let observer: MutationObserver | undefined;
    const finish = (): void => { clearTimeout(timer); observer?.disconnect(); ready(); };
    const timer = setTimeout(finish, limit);
    const check = (): void => {
      const media = container.querySelector("img, video");
      if (shown(media)) { finish(); return; }
      media?.addEventListener(media instanceof HTMLVideoElement ? "loadeddata" : "load", check, { once: true });
      media?.addEventListener("error", finish, { once: true });
    };
    observer = new MutationObserver(check);
    observer.observe(container, { childList: true, subtree: true });
    check();
  });
}
