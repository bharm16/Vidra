import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, type PointerEvent, type ReactElement } from "react";
import { SNAPSHOT_INTERVAL_MS } from "@/features/realtime-sketch/config/constants";

export type DrawingTool = "select" | "brush" | "eraser" | "rectangle" | "ellipse";
interface Point { x: number; y: number; }
/** "clear" is an undoable step that wipes everything drawn (and an imported picture) before it. */
interface Stroke { tool: DrawingTool | "clear"; ink: string; size: number; points: Point[]; }
export interface DrawingCanvasHandle { undo(): void; redo(): void; clear(): void; importPicture(dataUri: string): void; }
export interface DrawingCanvasProps {
  tool: DrawingTool; ink: string; brushSize: number; initialDataUri?: string;
  width?: number; height?: number; mask?: boolean; label?: string;
  onSnapshot(dataUri: string, encodeMs: number): void; onHistory?(canUndo: boolean, canRedo: boolean, hasPaint: boolean): void; onError?(message: string): void;
}

/** Draws at exact source pixels; preview dimensions never rewrite the source transform. */
export const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(function DrawingCanvas({ tool, ink, brushSize, initialDataUri, width = 512, height = 512, mask = false, label = "Sketch drawing", onSnapshot, onHistory, onError }, ref): ReactElement {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const redo = useRef<Stroke[]>([]);
  const active = useRef<Stroke>();
  const base = useRef<HTMLImageElement>();
  const latestSnapshot = useRef(onSnapshot); latestSnapshot.current = onSnapshot;
  const history = useRef(onHistory); history.current = onHistory;
  const errors = useRef(onError); errors.current = onError;
  const lastAt = useRef(0);
  const background = mask ? "transparent" : "#e3dac7";
  const snapshot = useCallback((): void => {
    const element = canvas.current; if (!element) return;
    const start = performance.now();
    latestSnapshot.current(element.toDataURL(mask ? "image/png" : "image/jpeg", .85), Math.round(performance.now() - start));
    const cleared = strokes.current.map(stroke => stroke.tool).lastIndexOf("clear");
    let painted = strokes.current.slice(cleared + 1).some(stroke => stroke.tool !== "eraser") || (cleared < 0 && Boolean(base.current));
    if (mask) { const pixels = element.getContext("2d")?.getImageData(0, 0, element.width, element.height).data; painted = pixels ? pixels.some((value, index) => index % 4 === 3 && value > 0) : false; }
    history.current?.(strokes.current.length > 0, redo.current.length > 0, painted);
  }, [mask]);
  const redraw = useCallback((): void => {
    const element = canvas.current; const context = element?.getContext("2d"); if (!element || !context) return;
    context.clearRect(0, 0, element.width, element.height);
    if (!mask) { context.fillStyle = background; context.fillRect(0, 0, element.width, element.height); }
    if (base.current) context.drawImage(base.current, 0, 0, element.width, element.height);
    for (const stroke of strokes.current) {
      if (stroke.tool === "clear") { context.clearRect(0, 0, element.width, element.height); if (!mask) { context.fillStyle = background; context.fillRect(0, 0, element.width, element.height); } continue; }
      context.globalCompositeOperation = mask && stroke.tool === "eraser" ? "destination-out" : "source-over";
      context.strokeStyle = stroke.tool === "eraser" && !mask ? background : stroke.ink;
      context.fillStyle = context.strokeStyle;
      context.lineWidth = stroke.size; context.lineJoin = "round"; context.lineCap = "round";
      const first = stroke.points[0]; const last = stroke.points.at(-1); if (!first || !last) continue;
      context.beginPath();
      if (stroke.tool === "rectangle") context.rect(first.x, first.y, last.x - first.x, last.y - first.y);
      else if (stroke.tool === "ellipse") context.ellipse((first.x + last.x) / 2, (first.y + last.y) / 2, Math.abs(last.x - first.x) / 2, Math.abs(last.y - first.y) / 2, 0, 0, 2 * Math.PI);
      else if (stroke.points.length === 1) { context.arc(first.x, first.y, stroke.size / 2, 0, 2 * Math.PI); context.fill(); }
      else stroke.points.forEach((point, index) => { if (index === 0) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y); });
      context.stroke();
    }
    context.globalCompositeOperation = "source-over";
  }, [mask, background]);
  const importPicture = useCallback((dataUri: string): void => {
    const picture = new Image(); picture.onload = () => { if (picture.naturalWidth * picture.naturalHeight > 40_000_000) { errors.current?.("Choose a picture with fewer than 40 million pixels."); return; } base.current = picture; strokes.current = []; redo.current = []; redraw(); snapshot(); }; picture.onerror = () => errors.current?.("This picture could not be read. Choose a readable PNG, JPEG or WebP picture."); picture.src = dataUri;
  }, [redraw, snapshot]);
  useEffect(() => { strokes.current = []; redo.current = []; base.current = undefined; if (initialDataUri) importPicture(initialDataUri); else { redraw(); snapshot(); } }, [initialDataUri, width, height, importPicture, redraw, snapshot]);
  useImperativeHandle(ref, () => ({
    undo(): void { const previous = strokes.current.pop(); if (previous) redo.current.push(previous); redraw(); snapshot(); },
    redo(): void { const next = redo.current.pop(); if (next) strokes.current.push(next); redraw(); snapshot(); },
    clear(): void {
      const last = strokes.current.at(-1);
      if ((!last && !base.current) || last?.tool === "clear") return;
      strokes.current.push({ tool: "clear", ink: "", size: 0, points: [] }); redo.current = []; redraw(); snapshot();
    },
    importPicture,
  }), [redraw, snapshot, importPicture]);
  const point = (event: PointerEvent<HTMLCanvasElement>): Point => { const rect = event.currentTarget.getBoundingClientRect(); return { x: Math.max(0, Math.min(width, (event.clientX - rect.left) * width / Math.max(rect.width, 1))), y: Math.max(0, Math.min(height, (event.clientY - rect.top) * height / Math.max(rect.height, 1))) }; };
  const end = (): void => { if (!active.current) return; active.current = undefined; snapshot(); };
  return <canvas ref={canvas} width={width} height={height} className="ps-drawing-canvas" data-mask={mask || undefined} aria-label={label} role="img"
    onPointerDown={event => { if (tool === "select") return; event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId); const stroke = { tool, ink, size: brushSize, points: [point(event)] }; active.current = stroke; strokes.current.push(stroke); redo.current = []; redraw(); }}
    onPointerMove={event => { if (!active.current) return; active.current.points.push(point(event)); redraw(); if (!mask && Date.now() - lastAt.current >= SNAPSHOT_INTERVAL_MS) { lastAt.current = Date.now(); snapshot(); } }}
    onPointerUp={end} onPointerCancel={end} />;
});
