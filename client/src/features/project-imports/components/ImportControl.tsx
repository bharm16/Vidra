import { useRef, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { Button } from "@promptstudio/system/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@promptstudio/system/components/ui/popover";
import { FreshButton, FreshIconButton } from "@/components/fresh/FreshButton";
import { ImportPanel } from "./ImportPanel";
import type { ProjectImportsController } from "../hooks/useProjectImports";
import "../imports.css";

export function ImportControl({ imports, selectedId, onSelect, placement = "library", disabled = false, onStarted, accept = "image/png,image/jpeg,image/webp,video/mp4,video/webm" }: { imports: ProjectImportsController; selectedId: string | undefined; onSelect(id: string | undefined): void; placement?: "library" | "composer" | "editor"; disabled?: boolean; accept?: string; onStarted?: (id: string, kind: "image" | "video" | "audio") => void }): ReactElement {
  const input = useRef<HTMLInputElement>(null);
  const reselect = useRef<string>();
  const replaceRejected = useRef<string>();
  const job = imports.jobs.find(candidate => candidate.id === selectedId);
  const choose = (id?: string, rejectedId?: string): void => { reselect.current = id; replaceRejected.current = rejectedId; input.current?.click(); };
  return <Popover modal={false} open={Boolean(job)} onOpenChange={open => { if (!open) onSelect(undefined); }}>
    <PopoverAnchor asChild><FreshButton tone={placement === "library" ? "primary" : "quiet"} disabled={disabled} className="vf-import-trigger" onClick={() => choose()}>{placement === "library" ? "Import media" : "Upload"}</FreshButton></PopoverAnchor>
    <input ref={input} hidden type="file" accept={accept} aria-label="Choose media file" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) { if (replaceRejected.current) imports.forgetRejected(replaceRejected.current); onSelect(reselect.current); void imports.choose(file, reselect.current, id => { onSelect(id); onStarted?.(id, file.type.startsWith("audio/") ? "audio" : file.type.startsWith("video/") ? "video" : "image"); }); } }} />
    {job ? <>{createPortal(<Button variant="ghost" className="vf-import-sheet-backdrop" aria-label="Close import overlay" onClick={() => onSelect(undefined)} />, document.body)}<PopoverContent className="vf vf-import-popover" align={placement === "composer" ? "start" : "end"} side={placement === "composer" ? "top" : "bottom"} alignOffset={placement === "editor" ? -1 : 0} sideOffset={placement === "editor" ? 7 : 6} collisionPadding={12} onOpenAutoFocus={event => event.preventDefault()} aria-label="Import progress"><div className="vf-import-sheet-heading"><FreshIconButton icon="close" label="Close import panel" onClick={() => onSelect(undefined)} /></div><ImportPanel job={job} onCancel={() => { void imports.cancel(job.id).then(done => { if (done) onSelect(undefined); }); }} onRetry={() => { void imports.retry(job.id); }} onChoose={() => choose(job.state === "file-needed" ? job.id : undefined, job.state === "unsupported" ? job.id : undefined)} /></PopoverContent></> : null}
  </Popover>;
}
