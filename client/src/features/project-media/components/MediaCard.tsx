import { Button } from "@promptstudio/system/components/ui/button";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@promptstudio/system/components/ui/dropdown-menu";
import { FreshIcon, FreshIconButton } from "@/components/fresh/FreshButton";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";

export function MediaCard({ version, access, onOpen, onEdit, onCopy, onHide, selected, readonly = false }: { version: MediaVersion; access(id: string): Promise<{ url: string }>; onOpen(): void; onEdit(): void; onCopy?: ((trigger: HTMLButtonElement | null) => void) | undefined; onHide(): void; selected: boolean; readonly?: boolean }): ReactElement {
  const [url, setUrl] = useState<string>();
  const [unavailable, setUnavailable] = useState(false);
  const [reload, setReload] = useState(0);
  const handingOffFocus = useRef(false);
  const more = useRef<HTMLButtonElement>(null);
  useEffect(() => { let alive = true; setUnavailable(false); setUrl(undefined); void access(version.id).then(result => { if (alive) setUrl(result.url); }).catch(() => { if (alive) setUnavailable(true); }); return () => { alive = false; }; }, [access, version.id, reload]);
  const failed = (): void => { if (reload === 0) setReload(1); else setUnavailable(true); };
  const seconds = version.metadata.state === "verified" ? version.metadata.durationSeconds : 0;
  const duration = `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
  return <article className="vf-media-card" data-version-id={version.id} data-selected={selected || undefined} data-hidden={version.hidden || undefined}>
    <Button variant="ghost" className="vf-card-picture !h-auto" onClick={onOpen} aria-label={`Open ${version.label}`} disabled={unavailable}>
      {unavailable ? <span>Unavailable</span> : url ? version.kind === "video" || version.kind === "export" ? <video src={url} muted playsInline preload="metadata" onError={failed} /> : version.kind === "audio" ? <span className="vf-audio-slate"><FreshIcon name="volume" />Audio</span> : <img src={url} alt="" onError={failed} /> : <span className="vf-card-loader" aria-label="Loading media" />}
      {version.hidden ? <span className="vf-hidden-chip">Hidden</span> : null}
      {(version.kind === "video" || version.kind === "export" || version.kind === "audio") && seconds > 0 ? <span className="vf-duration-chip">{duration}</span> : null}
    </Button>
    <div className="vf-card-caption"><span title={version.label}>{version.label}</span>{!unavailable && !readonly ? <DropdownMenu modal={false}><DropdownMenuTrigger asChild><FreshIconButton ref={more} icon="more" label={`More for ${version.label}`} /></DropdownMenuTrigger><DropdownMenuContent className="vf vf-library-menu" align="end" sideOffset={6} onCloseAutoFocus={event => { if (handingOffFocus.current) { event.preventDefault(); handingOffFocus.current = false; } }}>{version.kind !== "audio" ? <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem> : null}{onCopy ? <DropdownMenuItem onSelect={() => { handingOffFocus.current = true; onCopy(more.current); }}>Copy to project</DropdownMenuItem> : null}<DropdownMenuItem onSelect={onHide}>{version.hidden ? "Restore" : "Hide"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : null}</div>
  </article>;
}
