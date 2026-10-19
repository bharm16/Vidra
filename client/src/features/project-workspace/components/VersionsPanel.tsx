import { Button } from "@promptstudio/system/components/ui/button";
import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import type { AcceptedRequest } from "@shared/schemas/workflow/request.schemas";
import { FreshButton, FreshIcon, FreshIconButton } from "@/components/fresh/FreshButton";
import { Dialog, DialogContent, DialogTitle } from "@promptstudio/system/components/ui/dialog";
import { MediaThumbnail } from "./MediaThumbnail";
import { versionTree } from "../state/versionTree";
import "./viewer-fidelity.css";

export interface VersionsPanelProps {
  versions: MediaVersion[];
  selectedVersionId: string | undefined;
  preferredVersionId?: string | undefined;
  requests?: AcceptedRequest[];
  access(versionId: string): Promise<{ url: string }>;
  onView(versionId: string): void;
  onClose(): void;
  onPreferred?(version: MediaVersion): void;
  onVariation?(version: MediaVersion): void;
  onEdit?(version: MediaVersion): void;
  canVary?(version: MediaVersion): boolean;
  readOnly?: boolean;
}

/** A sibling panel: selecting a history row only changes the media being viewed. */
export function VersionsPanel({ versions, selectedVersionId, preferredVersionId, requests = [], access, onView, onClose, onPreferred, onVariation, onEdit, canVary, readOnly = false }: VersionsPanelProps): ReactElement {
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && (window.matchMedia?.("(width < 768px)").matches ?? false));
  const returnFocus = useRef(typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : undefined);
  useEffect(() => { const query = window.matchMedia?.("(width < 768px)"); if (!query) return; const update = (): void => setMobile(query.matches); update(); query.addEventListener("change", update); return () => query.removeEventListener("change", update); }, []);
  const rows = versionTree(versions, selectedVersionId);
  const selected = rows.find(row => row.version.id === selectedVersionId);
  const variationAvailable = selected !== undefined && (canVary?.(selected.version) ?? true);
  const readOnlyReason = "This project or conversation is read only.";
  const content = <><header className="vf-side-heading">{mobile ? <DialogTitle asChild><h2>Versions</h2></DialogTitle> : <h2>Versions</h2>}<FreshIconButton icon="close" label="Close versions" onClick={onClose} /></header><div className="vf-version-list" role="list" aria-label="Version history">{rows.map(row => {
    const depth = Math.min(row.depth, 3);
    const requestId = row.version.origin.kind === "generated" ? row.version.origin.requestId : undefined;
    const detail = row.depth === 0 ? "Original" : requests.find(request => request.id === requestId)?.snapshot.instructions ?? row.version.label;
    const style: CSSProperties = { paddingLeft: depth * 24 };
    return <div role="listitem" className="vf-version-row" key={row.version.id} style={style} data-depth={depth}>
      {depth ? <><span className="vf-version-elbow" style={{ left: (depth - 1) * 24 + 12 }} data-continues={row.nextSibling || undefined} aria-hidden="true" />{row.ancestorRails.slice(0, 2).map((continues, index) => continues ? <span className="vf-version-rail" style={{ left: index * 24 + 12 }} key={index} aria-hidden="true" /> : null)}</> : null}
      {row.hasChildren ? <span className="vf-version-stem" style={{ left: depth * 24 + 12 }} aria-hidden="true" /> : null}
      <Button variant="ghost" type="button" className="vf-version-content" aria-pressed={row.version.id === selectedVersionId} aria-label={`View version ${row.number}: ${detail}`} onClick={() => onView(row.version.id)}><MediaThumbnail version={row.version} access={access} className="vf-version-picture" /><span className="vf-version-description"><span>v{row.number}</span><span className="vf-version-detail">{detail}</span></span>{row.version.id === preferredVersionId ? <span className="vf-version-marker">Preferred</span> : null}</Button>
    </div>;
  })}{!rows.length ? <p className="vf-muted">No versions yet.</p> : null}</div>{selected ? <footer className="vf-versions-footer">{onPreferred ? <FreshButton disabled={readOnly || preferredVersionId === selected.version.id} title={readOnly ? readOnlyReason : undefined} onClick={() => onPreferred(selected.version)}>{preferredVersionId === selected.version.id ? <><FreshIcon name="check" /> Preferred</> : "Make preferred"}</FreshButton> : null}{onVariation ? <FreshButton disabled={readOnly || !variationAvailable} title={readOnly ? readOnlyReason : !variationAvailable ? "The setup for this version is unavailable." : undefined} onClick={() => onVariation(selected.version)}>New variation</FreshButton> : null}{onEdit ? <FreshButton tone="primary" disabled={readOnly} title={readOnly ? readOnlyReason : undefined} onClick={() => onEdit(selected.version)}>Edit v{selected.number}</FreshButton> : null}</footer> : null}</>;
  return mobile ? <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent hideClose className="vf vf-versions vf-viewer-dialog" overlayClassName="vf-viewer-sheet-backdrop" aria-modal="true" aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); const target = returnFocus.current?.isConnected ? returnFocus.current : document.querySelector<HTMLButtonElement>('.vf-viewer-mobile-heading button[aria-label="Media actions"]'); target?.focus(); }}>{content}</DialogContent></Dialog> : <aside className="vf-versions" aria-label="Versions">{content}</aside>;
}
