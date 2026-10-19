import { useId, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { ProjectAreaMaskSchema, type ProjectAreaMask } from "@shared/schemas/workflow/sketch.schemas";
import { FreshButton, FreshIconButton } from "@/components/fresh/FreshButton";
import { DrawingCanvas, type DrawingCanvasHandle } from "./components/DrawingCanvas";
import { SketchToolButton } from "./components/SketchToolButton";
import { AreaMaskFilter } from "./components/AreaMaskFilter";
import "./project-sketch.css";

export interface AreaEditPanelProps { version: MediaVersion; sourceUrl: string; initialMask?: ProjectAreaMask; standalone?: boolean; rail?: ReactNode; onDone(mask: ProjectAreaMask): void; onClose?(): void; onOptions?(): void; }

/** Selection remains tied to the exact picture. Unsupported submission is explicit. */
export function AreaEditPanel({ version, sourceUrl, initialMask, standalone = false, rail, onDone, onClose, onOptions }: AreaEditPanelProps): ReactElement {
  const filterId = `area-selection-${useId().replaceAll(":", "")}`;
  const metadata = version.metadata.state === "verified" ? version.metadata : undefined;
  const width = metadata?.width ?? 0; const height = metadata?.height ?? 0;
  const mismatch = Boolean(initialMask && (initialMask.versionId !== version.id || initialMask.width !== width || initialMask.height !== height || initialMask.transform !== "identity"));
  const sourceKey = `${version.id}:${width}x${height}`;
  const [redrawnFor, setRedrawnFor] = useState<string>();
  const [tool, setTool] = useState<"brush" | "eraser">("brush");
  const [size, setSize] = useState(48);
  const [hasPaint, setHasPaint] = useState(false); const [undo, setUndo] = useState(false); const [redo, setRedo] = useState(false);
  const [mask, setMask] = useState<{ sourceKey: string; dataUri: string }>(); const canvas = useRef<DrawingCanvasHandle>(null);
  const invalid = mismatch && redrawnFor !== sourceKey;
  const validGeometry = version.kind === "image" && width > 0 && height > 0 && width <= 16384 && height <= 16384 && width * height <= 40_000_000;
  const selection = <section className="vf ps-area-stage" aria-label="Paint an area" data-source-version={version.id}>
    <AreaMaskFilter id={filterId} />
    <div className="ps-area-monitor">
      <img className="ps-ambient" src={sourceUrl} alt="" aria-hidden="true" />
      {validGeometry ? <div className="ps-area-picture" style={{ aspectRatio: `${width} / ${height}`, width: `min(100%, calc(100cqh * ${width / height}))`, "--ps-area-filter": `url(#${filterId})` } as CSSProperties}><img src={sourceUrl} alt={version.label} /><DrawingCanvas key={sourceKey} ref={canvas} mask label="Paint area on the exact source picture" tool={tool} ink="#b8a0ff" brushSize={size} width={width} height={height} {...(!mismatch && initialMask ? { initialDataUri: initialMask.dataUri } : {})} onSnapshot={dataUri => setMask({ sourceKey, dataUri })} onHistory={(canUndo, canRedo, painted) => { setUndo(canUndo); setRedo(canRedo); setHasPaint(painted); }} /></div> : <p role="alert">{metadata && width > 0 && height > 0 ? "This picture is too large for area selection. Use another picture." : "Open a verified picture before painting an area."}</p>}
    </div>
    <footer className="ps-area-toolbar" aria-label="Area tools">
      <div className="ps-tools ps-area-drawing-tools"><SketchToolButton name="brush" label="Paint area" selected={tool === "brush"} onClick={() => setTool("brush")} /><SketchToolButton name="eraser" label="Erase selection" selected={tool === "eraser"} onClick={() => setTool("eraser")} /><span className="ps-divider" /><label className="ps-mask-size">Size<input type="range" aria-label="Area brush size" min={1} max={96} value={size} style={{ "--ps-range-value": `${(size - 1) / 95 * 100}%` } as CSSProperties} onChange={event => setSize(Number(event.target.value))} /><output>{size}</output></label><span className="ps-divider" /><SketchToolButton name="undo" label="Undo area stroke" disabled={!undo} onClick={() => canvas.current?.undo()} /><SketchToolButton name="redo" label="Redo area stroke" disabled={!redo} onClick={() => canvas.current?.redo()} /><FreshButton className="ps-area-clear" tone="quiet" onClick={() => canvas.current?.clear()}>Clear</FreshButton></div>
      {invalid ? <FreshButton tone="primary" onClick={() => { canvas.current?.clear(); setHasPaint(false); setRedrawnFor(sourceKey); }}>Redraw selection</FreshButton> : <FreshButton tone="primary" disabled={!hasPaint || !validGeometry || mask?.sourceKey !== sourceKey} onClick={() => { if (mask?.sourceKey === sourceKey) onDone(ProjectAreaMaskSchema.parse({ versionId: version.id, width, height, transform: "identity", dataUri: mask.dataUri })); }}>Done</FreshButton>}
    </footer>
    {invalid ? <p className="vf-notice" role="alert">This selection belongs to a different picture or size. Redraw it on this exact version.</p> : null}
    <p className="sr-only" role="status">Area edits are unavailable for the current models. Your selection can be kept; making a picture with it is disabled.</p>
  </section>;
  return standalone ? <main className="vf ps-page ps-area-page">{rail}<div className="ps-content"><header className="ps-header"><FreshIconButton icon="folder" label="Back to project" onClick={onClose} /><span className="ps-header-spacer" /><FreshIconButton icon="more" label="Project options" onClick={onOptions} disabled={!onOptions} /></header>{selection}</div></main> : selection;
}
