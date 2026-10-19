import type { LabeledSpan } from "@/features/span-highlighting/hooks/useSpanLabeling";

export interface SelectionPaintBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PromptSelectionPaint {
  start: number;
  end: number;
  viewport: SelectionPaintBox;
  boxes: SelectionPaintBox[];
  presentation: "phrase" | "wrapped-phrase" | "range";
}

/** A decorative reading of the native range. It never changes text, focus or selection. */
export function measurePromptSelection(field: HTMLTextAreaElement, editor: HTMLElement, spans: LabeledSpan[]): PromptSelectionPaint | undefined {
  const start = field.selectionStart;
  const end = field.selectionEnd;
  if (start === end || !field.clientWidth || !field.clientHeight) return undefined;
  const style = getComputedStyle(field);
  const lineHeight = Number.parseFloat(style.lineHeight);
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) return undefined;

  const mirror = document.createElement("div");
  for (const name of ["font", "font-family", "font-size", "font-weight", "font-style", "font-kerning", "font-feature-settings", "line-height", "letter-spacing", "word-spacing", "tab-size", "text-align", "padding", "box-sizing", "overflow-wrap", "word-break"]) mirror.style.setProperty(name, style.getPropertyValue(name));
  Object.assign(mirror.style, { position: "fixed", left: "0px", top: "0px", width: `${field.clientWidth}px`, height: "auto", border: "0px", whiteSpace: field.wrap === "off" ? "pre" : "pre-wrap", visibility: "hidden", pointerEvents: "none" });
  mirror.setAttribute("aria-hidden", "true");
  mirror.append(document.createTextNode(field.value.slice(0, start)));
  const selected = document.createElement("span");
  selected.textContent = field.value.slice(start, end);
  mirror.append(selected, document.createTextNode(field.value.slice(end)));
  document.body.append(mirror);
  const origin = mirror.getBoundingClientRect();
  const rectangles = Array.from(selected.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0).map(rect => ({ left: rect.left - origin.left - field.scrollLeft, top: rect.top - origin.top - field.scrollTop - Math.max(0, (lineHeight - rect.height) / 2), width: rect.width, height: lineHeight }));
  mirror.remove();
  if (!rectangles.length) return undefined;

  const lines: SelectionPaintBox[] = [];
  for (const rect of rectangles) {
    const line = lines.find(row => Math.abs(row.top - rect.top) < 1);
    if (line) { const right = Math.max(line.left + line.width, rect.left + rect.width); line.left = Math.min(line.left, rect.left); line.width = right - line.left; }
    else lines.push({ ...rect });
  }
  lines.sort((a, b) => a.top - b.top);
  const first = lines[0];
  const last = lines.at(-1);
  if (!first || !last) return undefined;
  const semantic = spans.some(span => span.start === start && span.end === end && (span.quote ?? span.text) === field.value.slice(start, end));
  const wrapped = semantic && lines.length > 1 && first.left <= Number.parseFloat(style.paddingLeft || "0") + 1;
  // A wrapped phrase occupies one source reading block. Arbitrary cross-line
  // selections retain separate line ranges so unselected words are never painted.
  const boxes = wrapped ? [{ left: 0, top: first.top, width: field.clientWidth, height: last.top + last.height - first.top - 2 }] : lines.map(line => {
    const left = Math.max(0, line.left - 2);
    return { left, top: line.top, width: Math.min(field.clientWidth - left, line.left + line.width + 2 - left), height: line.height };
  });
  const visible = boxes.filter(box => box.top < field.clientHeight && box.top + box.height > 0 && box.width > 0);
  if (!visible.length) return undefined;
  const fieldBounds = field.getBoundingClientRect();
  const editorBounds = editor.getBoundingClientRect();
  return { start, end, viewport: { left: fieldBounds.left - editorBounds.left, top: fieldBounds.top - editorBounds.top, width: field.clientWidth, height: field.clientHeight }, boxes: visible, presentation: wrapped ? "wrapped-phrase" : semantic ? "phrase" : "range" };
}
