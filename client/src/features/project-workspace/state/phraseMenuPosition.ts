/** Measure the actual selected text, including wrapping and textarea scroll, without moving it. */
export function phraseMenuPosition(field: HTMLTextAreaElement, start: number, end: number, menuHeight: number, menuWidth = 280): { left: number; top: number } {
  const rect = field.getBoundingClientRect();
  const style = getComputedStyle(field);
  const mirror = document.createElement("div");
  for (const name of ["font", "font-family", "font-size", "font-weight", "line-height", "letter-spacing", "padding", "border", "box-sizing", "text-align", "tab-size", "word-spacing", "overflow-wrap"]) mirror.style.setProperty(name, style.getPropertyValue(name));
  Object.assign(mirror.style, { position: "fixed", left: `${rect.left}px`, top: `${rect.top - field.scrollTop}px`, width: `${rect.width}px`, height: "auto", whiteSpace: "pre-wrap", visibility: "hidden", pointerEvents: "none" });
  mirror.append(document.createTextNode(field.value.slice(0, start)));
  const phrase = document.createElement("span");
  phrase.textContent = field.value.slice(start, end) || "\u200b";
  mirror.append(phrase, document.createTextNode(field.value.slice(end)));
  document.body.append(mirror);
  const rectangles = Array.from(phrase.getClientRects());
  const selection = rectangles[0] ?? rect;
  const lastLine = rectangles.at(-1) ?? selection;
  const lineHeight = Number.parseFloat(style.lineHeight);
  const firstLeading = Number.isFinite(lineHeight) ? Math.max(0, (lineHeight - selection.height) / 2) : 0;
  const lastLeading = Number.isFinite(lineHeight) ? Math.max(0, (lineHeight - lastLine.height) / 2) : 0;
  const width = Math.min(menuWidth, window.innerWidth - 24);
  const left = Math.max(12, Math.min(selection.left, window.innerWidth - width - 12));
  const above = selection.top - firstLeading - menuHeight - 6;
  const below = lastLine.bottom + lastLeading + 6;
  const top = above >= 12 ? above : Math.min(Math.max(12, below), Math.max(12, window.innerHeight - menuHeight - 12));
  mirror.remove();
  return { left, top };
}
