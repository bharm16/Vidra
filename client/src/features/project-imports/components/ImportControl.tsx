import { useCallback, useEffect, useRef, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { Button } from "@promptstudio/system/button";
import { Popover, PopoverAnchor, PopoverContent } from "@promptstudio/system/popover";
import { FreshButton, FreshIconButton } from "@/components/fresh/FreshButton";
import { snapshotPicture } from "@/components/motion/flight";
import { canAnimate, reducedMotion } from "@/components/motion/play";
import { IMPORT_FOLD, MENU_GROW } from "@/components/motion/surface";
import { useSurfacePresence } from "@/components/motion/useSurfacePresence";
import { importedVersionId } from "@shared/schemas/workflow/import.schemas";
import type { VersionId } from "@shared/schemas/workflow/identity.schemas";
import { ImportPanel } from "./ImportPanel";
import type { ImportJob, ProjectImportsController } from "../hooks/useProjectImports";
import "../imports.css";

/** A finished upload's picture and where it was, so the view showing the new media can fly it home (frame 2697). */
export interface ImportLanding {
  versionId: VersionId;
  rect: DOMRect;
  picture: HTMLCanvasElement;
}

export function ImportControl({ imports, selectedId, onSelect, placement = "library", disabled = false, onStarted, onLanded, accept = "image/png,image/jpeg,image/webp,video/mp4,video/webm" }: { imports: ProjectImportsController; selectedId: string | undefined; onSelect(id: string | undefined): void; placement?: "library" | "composer" | "editor"; disabled?: boolean; accept?: string; onStarted?: (id: string, kind: "image" | "video" | "audio") => void; onLanded?: (landing: ImportLanding) => void }): ReactElement {
  const input = useRef<HTMLInputElement>(null);
  const reselect = useRef<string>();
  const replaceRejected = useRef<string>();
  const trigger = useRef<HTMLElement | null>(null);
  const attachTrigger = useCallback((node: HTMLElement | null): void => { trigger.current = node; }, []);
  const panel = useRef<HTMLDivElement | null>(null);
  const cancelled = useRef<string>();
  const job = imports.jobs.find(candidate => candidate.id === selectedId);
  // The panel grows out of the button and folds back into it still showing its last state.
  const last = useRef<ImportJob>();
  if (job) last.current = job;
  const shown = job ?? last.current;
  const { present, ref: attachSurface } = useSurfacePresence(Boolean(job), { origin: () => trigger.current, grow: MENU_GROW, fold: IMPORT_FOLD });
  const attachPanel = useCallback((node: HTMLDivElement | null): void => { panel.current = node; attachSurface(node); }, [attachSurface]);
  const landed = useRef(onLanded);
  landed.current = onLanded;
  useEffect(() => {
    // An upload that leaves while still selected has landed; cancelling clears the selection itself.
    const finished = last.current;
    if (job || !selectedId || finished?.id !== selectedId || finished.state !== "uploading" || cancelled.current === selectedId || !canAnimate() || reducedMotion()) return;
    const media = panel.current?.querySelector(".vf-import-preview img, .vf-import-preview video");
    const picture = media ? snapshotPicture(media) : undefined;
    if (media && picture) landed.current?.({ versionId: importedVersionId(finished.id), rect: media.getBoundingClientRect(), picture });
  }, [job, selectedId]);
  const choose = (id?: string, rejectedId?: string): void => { reselect.current = id; replaceRejected.current = rejectedId; input.current?.click(); };
  return <Popover modal={false} open={Boolean(job)} onOpenChange={open => { if (!open) onSelect(undefined); }}>
    <PopoverAnchor asChild ref={attachTrigger}><FreshButton tone={placement === "library" ? "primary" : "quiet"} disabled={disabled} className="vf-import-trigger" onClick={() => choose()}>{placement === "library" ? "Import media" : "Upload"}</FreshButton></PopoverAnchor>
    <input ref={input} hidden type="file" accept={accept} aria-label="Choose media file" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) { if (replaceRejected.current) imports.forgetRejected(replaceRejected.current); onSelect(reselect.current); void imports.choose(file, reselect.current, id => { onSelect(id); onStarted?.(id, file.type.startsWith("audio/") ? "audio" : file.type.startsWith("video/") ? "video" : "image"); }); } }} />
    {present && shown ? <>{job ? createPortal(<Button variant="ghost" className="vf-import-sheet-backdrop" aria-label="Close import overlay" onClick={() => onSelect(undefined)} />, document.body) : null}<PopoverContent forceMount className="vf vf-import-popover" align={placement === "composer" ? "start" : "end"} side={placement === "composer" ? "top" : "bottom"} alignOffset={placement === "editor" ? -1 : 0} sideOffset={placement === "editor" ? 7 : 6} collisionPadding={12} onOpenAutoFocus={event => event.preventDefault()} aria-label="Import progress"><div className="vf-import-sheet-heading"><FreshIconButton icon="close" label="Close import panel" onClick={() => onSelect(undefined)} /></div><ImportPanel ref={attachPanel} job={shown} onCancel={() => { cancelled.current = shown.id; void imports.cancel(shown.id).then(done => { if (done) onSelect(undefined); }); }} onRetry={() => { void imports.retry(shown.id); }} onChoose={() => choose(shown.state === "file-needed" ? shown.id : undefined, shown.state === "unsupported" ? shown.id : undefined)} /></PopoverContent></> : null}
  </Popover>;
}
