import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { FreshButton, FreshIcon, FreshIconButton } from "@/components/fresh/FreshButton";
import { Popover, PopoverContent, PopoverTrigger } from "@promptstudio/system/components/ui/popover";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { useProjectSketchPreview } from "./hooks/useProjectSketchPreview";
import { useProjectSketchCapture } from "./hooks/useProjectSketchCapture";
import { DrawingCanvas, type DrawingCanvasHandle, type DrawingTool } from "./components/DrawingCanvas";
import { SketchToolButton } from "./components/SketchToolButton";
import "./project-sketch.css";

export interface ProjectSketchProps {
  ownerId: string; projectId: string; projectName?: string; rail?: ReactNode;
  onAccepted(version: MediaVersion): void; onClose(): void; onUseAsInput?(version: MediaVersion): void;
}

export function ProjectSketch({ ownerId, projectId, projectName = "this project", rail, onAccepted, onClose, onUseAsInput }: ProjectSketchProps): ReactElement {
  const preview = useProjectSketchPreview();
  const capture = useProjectSketchCapture({ ownerId, projectId, settings: preview.settings, onAccepted });
  const [tool, setTool] = useState<DrawingTool>("brush");
  const [ink, setInk] = useState("#514a3e");
  const [size, setSize] = useState(12);
  const [undo, setUndo] = useState(false); const [redo, setRedo] = useState(false);
  const [fileError, setFileError] = useState<string>();
  const [panelOpen, setPanelOpen] = useState(false);
  const drawing = useRef<DrawingCanvasHandle>(null);
  const file = useRef<HTMLInputElement>(null);
  const updateSettings = preview.updateSettings;
  useEffect(() => { if (capture.recoveredSettings) updateSettings(capture.recoveredSettings); }, [capture.recoveredSettings, updateSettings]);
  const displayed = preview.state.liveOutput ?? undefined;
  const picture = displayed?.imageUrl ?? capture.pending?.outputDataUri;
  const shownStatus = !displayed && picture && preview.status === "off" ? "paused" : preview.status;
  const close = (): void => { preview.pause(); onClose(); };
  const save = (): void => { setPanelOpen(true); void capture.save(displayed); };
  const controls = <div className="ps-tools" role="toolbar" aria-label="Sketch tools">
    <SketchToolButton name="select" label="Select" selected={tool === "select"} onClick={() => setTool("select")} />
    <SketchToolButton name="brush" label="Brush" selected={tool === "brush"} onClick={() => setTool("brush")} />
    <SketchToolButton name="eraser" label="Eraser" selected={tool === "eraser"} onClick={() => setTool("eraser")} />
    <span className="ps-divider" />
    <SketchToolButton name="rectangle" label="Draw rectangle" selected={tool === "rectangle"} onClick={() => setTool("rectangle")} />
    <SketchToolButton name="ellipse" label="Draw circle" selected={tool === "ellipse"} onClick={() => setTool("ellipse")} />
    <SketchToolButton name="picture" label="Add picture to drawing" onClick={() => file.current?.click()} />
    <span className="ps-divider" />
    <SketchToolButton name="undo" label="Undo stroke" disabled={!undo} onClick={() => drawing.current?.undo()} />
    <SketchToolButton name="redo" label="Redo stroke" disabled={!redo} onClick={() => drawing.current?.redo()} />
  </div>;
  const settings = <div className="ps-settings">
    <label>Prompt<input className="vf-field" maxLength={32000} value={preview.settings.prompt} onChange={event => preview.updateSettings({ prompt: event.target.value })} /></label>
    <label>Ink<input type="color" aria-label="Ink" value={ink} onChange={event => setInk(event.target.value)} /></label>
    <label>Brush size<input type="range" min={1} max={96} value={size} onChange={event => setSize(Number(event.target.value))} /><output>{size}</output></label>
    <label>Strength<input type="range" min={0.751} max={0.875} step={0.001} value={preview.settings.strength} onChange={event => preview.updateSettings({ strength: Number(event.target.value) })} /><output>{preview.settings.strength.toFixed(3)}</output></label>
    <label>Seed<input className="vf-field" type="number" step={1} value={preview.settings.seed} onChange={event => { const value = Number(event.target.value); if (Number.isSafeInteger(value)) preview.updateSettings({ seed: value }); }} /></label>
    <FreshButton tone="quiet" onClick={() => drawing.current?.clear()}>Clear drawing</FreshButton>
  </div>;
  return <main className="vf ps-page" data-sketch-state={shownStatus}>
    {rail}
    <div className="ps-content">
      <header className="ps-header"><FreshIconButton icon="folder" label="Back to project" onClick={close} /><span className="ps-header-spacer" /><Popover modal={false}><PopoverTrigger asChild><FreshIconButton icon="more" label="Sketch settings" /></PopoverTrigger><PopoverContent className="vf ps-settings-panel" sideOffset={6} align="end">{settings}</PopoverContent></Popover></header>
      {capture.localError ? <p className="vf-notice" role="status">{capture.localError}</p> : null}
      {fileError ? <p className="vf-notice" role="alert">{fileError}</p> : null}
      {capture.restore ? <section className="vf-notice ps-restore" aria-label="Drawing recovery"><p>A drawing is saved on this device. Preview stays paused.</p><FreshButton onClick={capture.chooseRestore}>Restore drawing</FreshButton><FreshButton tone="quiet" onClick={capture.chooseBlank}>Start blank</FreshButton></section> : null}
      <section className="ps-stage" aria-label="Sketch">
        <div className="ps-monitor">
          {picture ? <img className="ps-ambient" src={picture} alt="" aria-hidden="true" /> : null}
          <div className="ps-pair">
            <div className="ps-drawing-slot">{capture.loaded && !capture.restore ? <DrawingCanvas ref={drawing} tool={tool} ink={ink} brushSize={size} {...(capture.initialDrawing ? { initialDataUri: capture.initialDrawing } : {})} onError={setFileError} onSnapshot={(dataUri, encodeMs) => { preview.snapshot(dataUri, encodeMs); capture.checkpoint(dataUri); }} onHistory={(canUndo, canRedo) => { setUndo(canUndo); setRedo(canRedo); }} /> : <div className="ps-drawing-placeholder" />}</div>
            <div className="ps-output" aria-label="Sketch output">
              {picture ? <img className="ps-output-picture" src={picture} alt="Last displayed Sketch picture" /> : null}
              {shownStatus === "off" || shownStatus === "connecting" ? <FreshButton className="ps-start" disabled={shownStatus === "connecting" || !preview.settings.prompt.trim() || !capture.loaded || Boolean(capture.restore)} onClick={preview.start}>{shownStatus === "off" ? <FreshIcon name="play" /> : <img className="ps-loader" src="/design-assets/fidelity-sketch-loader.svg" alt="" />}{shownStatus === "connecting" ? "Starting preview…" : "Start preview"}</FreshButton> : null}
              {shownStatus === "live" || shownStatus === "paused" || shownStatus === "error" && picture ? <FreshButton className="ps-preview-control" onClick={shownStatus === "paused" ? preview.start : preview.pause}><FreshIcon name={shownStatus === "paused" ? "play" : "pause"} />{shownStatus === "paused" ? "Resume" : "Pause"}</FreshButton> : null}
              {shownStatus === "error" ? <div className="ps-output-notice" data-tone="danger" role="alert"><img src="/design-assets/fidelity-sketch-error.svg" alt="" /><span>Preview stopped updating</span><FreshButton onClick={preview.start}>Retry</FreshButton></div> : null}
              {shownStatus === "limit" ? <div className="ps-output-notice" data-tone="warning" role="status"><img src="/design-assets/fidelity-sketch-warning.svg" alt="" /><span>Preview limit resets at {new Date(preview.state.halted?.resumeAtMs ?? 0).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></div> : null}
            </div>
          </div>
        </div>
        <footer className="ps-toolbar">
          {controls}<span className="ps-divider ps-prompt-divider" />
          <input className="ps-prompt" aria-label="Sketch prompt" maxLength={32000} placeholder="Describe the picture" value={preview.settings.prompt} onChange={event => preview.updateSettings({ prompt: event.target.value })} />
          <span className="ps-divider ps-prompt-divider" />
          <Popover modal={false} open={panelOpen} onOpenChange={setPanelOpen}><PopoverTrigger asChild><FreshButton className="ps-save" tone="primary" disabled={!picture || capture.saving} onClick={save}>Save image</FreshButton></PopoverTrigger><PopoverContent className="vf ps-save-panel" side="top" sideOffset={6} align="end" collisionPadding={8}>
            <div className="ps-save-heading">{capture.pending ? <img src={capture.pending.outputDataUri} alt="Captured picture being saved" /> : null}<p role="status">{capture.saving ? "Saving image…" : capture.saved ? `Saved to ${projectName}` : "Saving was not confirmed"}</p></div>
            {capture.saveError ? <p className="ps-save-error" role="alert">{capture.saveError}</p> : null}
            {capture.saveError ? <FreshButton onClick={() => { void capture.save(); }}>Retry saving</FreshButton> : null}
            <FreshButton tone="primary" disabled={!capture.saved || !onUseAsInput} onClick={() => { if (capture.saved) onUseAsInput?.(capture.saved); }}>Use as input</FreshButton>
          </PopoverContent></Popover>
        </footer>
      </section>
      <input ref={file} className="ps-hidden-input" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Add picture to drawing" onChange={event => { const selected = event.target.files?.[0]; if (!selected) return; event.target.value = ""; if (selected.size > 8 * 1024 * 1024) { setFileError("Choose a picture under 8 MB for the drawing."); return; } const reader = new FileReader(); reader.onload = () => { if (typeof reader.result === "string") { drawing.current?.importPicture(reader.result); setFileError(undefined); } }; reader.onerror = () => setFileError("This picture could not be opened."); reader.readAsDataURL(selected); }} />
    </div>
  </main>;
}
