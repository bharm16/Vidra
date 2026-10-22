/**
 * Puts a copy of something that just left (or its detached node) back where it was on
 * screen, out of layout and out of reach, so it can animate away. Inserting it beside its
 * old siblings keeps the cascade that styled it.
 */
export function placeGhost(ghost: HTMLElement, rect: DOMRect, parent: Element, before: Node | null = null): HTMLElement {
  ghost.setAttribute("aria-hidden", "true");
  ghost.setAttribute("inert", "");
  ghost.dataset.motionGhost = "";
  Object.assign(ghost.style, { position: "absolute", left: "0px", top: "0px", width: `${rect.width}px`, height: `${rect.height}px`, margin: "0", translate: "none", pointerEvents: "none", boxSizing: "border-box" });
  parent.insertBefore(ghost, before && before.parentNode === parent ? before : null);
  // Measured at 0,0: the containing block's origin and any scale between it and the screen.
  const frame = ghost.getBoundingClientRect();
  const scaleX = rect.width ? frame.width / rect.width || 1 : 1;
  const scaleY = rect.height ? frame.height / rect.height || 1 : 1;
  Object.assign(ghost.style, { left: `${(rect.left - frame.left) / scaleX}px`, top: `${(rect.top - frame.top) / scaleY}px`, width: `${rect.width / scaleX}px`, height: `${rect.height / scaleY}px` });
  return ghost;
}

const FRAME_STYLE = ["position", "left", "top", "right", "bottom", "width", "height", "objectFit", "objectPosition", "transform", "transformOrigin", "borderRadius"] as const;

/** A still copy of an element: videos become canvases holding the frame they show now. */
export function stillCopy(element: HTMLElement): HTMLElement | undefined {
  const copy = element.cloneNode(true);
  if (!(copy instanceof HTMLElement)) return undefined;
  const videos = element.querySelectorAll("video");
  const copies = copy.querySelectorAll("video");
  videos.forEach((video, index) => {
    const target = copies[index];
    if (!target) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1;
    canvas.height = video.videoHeight || 1;
    try { canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height); } catch { /* A frame that cannot be read leaves the canvas blank. */ }
    const style = getComputedStyle(video);
    canvas.className = video.className;
    for (const name of FRAME_STYLE) canvas.style[name] = style[name];
    target.replaceWith(canvas);
  });
  return copy;
}
