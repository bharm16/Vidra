import { Button } from "@promptstudio/system/components/ui/button";
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { FreshButton, FreshIcon, FreshIconButton } from "@/components/fresh/FreshButton";
import { Dialog, DialogContent, DialogTitle } from "@promptstudio/system/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@promptstudio/system/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@promptstudio/system/components/ui/tooltip";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { AreaMaskFilter } from "@/features/project-sketch/components/AreaMaskFilter";
import "./viewer-fidelity.css";

function time(value: number): string { const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0; return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
export interface MediaViewerProps {
  readOnly?: boolean;
  version: MediaVersion | undefined;
  access(versionId: string): Promise<{ url: string }>;
  onUseInput(version: MediaVersion): void;
  onReuseSetup(version: MediaVersion): void;
  canReuseSetup: boolean;
  onEdit?(version: MediaVersion): void;
  onAnimate?(version: MediaVersion): void;
  onEditRegion?(version: MediaVersion): void;
  onExtend?(version: MediaVersion): void;
  onAddToVideo?(version: MediaVersion): void;
  onVersions?(): void;
  onPreferred?(version: MediaVersion): void;
  preferredVersionId?: string | undefined;
  onHide?(version: MediaVersion): void;
  onShare?(version: MediaVersion): void;
  onRename?(version: MediaVersion): void;
  onFavorite?(version: MediaVersion): void;
  favorite?: boolean | undefined;
  onPictureTools?(version: MediaVersion): void;
  onUseFrame?(version: MediaVersion, positionSeconds: number): void;
  onDownload?(version: MediaVersion): void;
  areaMask?: { versionId: string; dataUri: string } | undefined;
  timeline?: ReactNode;
  timelineControl?: ReactNode;
  onBack?(): void;
  banner?: ReactNode;
  mobilePreview?: boolean;
  onView?(): void;
  renderRequestDetails?(onClose: () => void): ReactNode;
  inspectionActions?: ReactNode;
  onBackToEdit?(): void;
}

/** Playback and browsing are local view facts; they never change the execution draft. */
export function MediaViewer({ version, access, onReuseSetup, canReuseSetup, readOnly = false, onEdit, onAnimate, onEditRegion, onExtend, onAddToVideo, onVersions, onPreferred, preferredVersionId, onHide, onShare, onRename, onFavorite, favorite, onUseFrame, onDownload, areaMask, timeline, timelineControl, onBack, banner, mobilePreview = false, onView, renderRequestDetails, inspectionActions, onBackToEdit }: MediaViewerProps): ReactElement {
  const maskFilterId = `viewer-mask-${useId().replaceAll(":", "")}`;
  const [resource, setResource] = useState<{ id: string; url: string }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [retry, setRetry] = useState(0);
  const [menu, setMenu] = useState<"use" | "more" | "utilities">("use");
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const player = useRef<HTMLVideoElement>(null);
  const backdrop = useRef<HTMLVideoElement>(null);
  const surface = useRef<HTMLElement>(null);
  const actionsTrigger = useRef<HTMLButtonElement>(null);
  const accessRef = useRef(access);
  accessRef.current = access;
  const isVideo = version?.kind === "video" || version?.kind === "export";
  const editorInspection = Boolean(inspectionActions || onBackToEdit);
  const versionId = version?.id;

  useEffect(() => {
    let current = true;
    setError(undefined); setNotice(undefined); setPlaying(false); setEnded(false); setPosition(0); setDuration(0); setMenuOpen(false); setMobileActionsOpen(false); setDetailsOpen(false);
    if (!versionId) { setResource(undefined); setLoading(false); return () => { current = false; }; }
    setLoading(true);
    void accessRef.current(versionId).then(result => { if (current) setResource({ id: versionId, url: result.url }); }).catch((failure: unknown) => { if (current) setError(failure instanceof Error ? failure.message : "This media could not open."); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [versionId, retry]);

  useEffect(() => { if (player.current) { player.current.volume = volume; player.current.muted = muted; } }, [volume, muted, resource?.url]);
  useEffect(() => {
    const query = window.matchMedia?.("(width < 768px)"); if (!query) return;
    const update = (): void => { if (!query.matches) setMobileActionsOpen(false); };
    query.addEventListener("change", update); return () => query.removeEventListener("change", update);
  }, []);
  const togglePlayback = (): void => { const video = player.current; if (!video) return; if (video.paused) { if (video.ended) video.currentTime = 0; void video.play().catch(() => setError("Playback could not start. Try again or download this clip.")); } else video.pause(); };
  const fullscreen = async (): Promise<void> => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await surface.current?.requestFullscreen(); } catch { setNotice("Full screen is unavailable in this browser."); } };
  const url = resource && resource.id === version?.id ? resource.url : undefined;
  const audible = version?.metadata.state === "verified" && version.metadata.audio === "present";
  const closeAction = (action: () => void): void => { setMenuOpen(false); setMobileActionsOpen(false); action(); };
  const actionRow = (icon: string, label: string, action: () => void, disabled = false): ReactElement => <FreshButton className="vf-media-action-row" tone="quiet" disabled={disabled} onClick={() => closeAction(action)}><img src={`/design-assets/fidelity-media-${icon}.svg`} alt="" data-muted={icon === "remove-background" || icon === "vectorize-image" || undefined} /><span>{label}</span></FreshButton>;
  const actions = (mobile: boolean): ReactElement => <>{onFavorite ? actionRow("star", favorite ? "Remove favorite" : "Add to favorites", () => { if (version) onFavorite(version); }) : null}{onPreferred ? actionRow("check", preferredVersionId === version?.id ? "Preferred" : mobile ? "Make preferred version" : "Make preferred", () => { if (version) onPreferred(version); }, preferredVersionId === version?.id) : null}{onVersions ? actionRow(mobile ? "history-mobile" : "history", "View versions", onVersions) : null}{!mobile && onRename ? actionRow("pencil", "Rename", () => { if (version) onRename(version); }) : null}{!mobile && version?.kind === "image" ? <FreshButton className="vf-media-action-row" tone="quiet" onClick={() => setMenu("utilities")}><img src="/design-assets/fidelity-media-settings-2.svg" alt="" /><span>Image tools</span></FreshButton> : null}{onShare ? actionRow("share-2", "Share", () => { if (version) onShare(version); }) : null}{onHide ? actionRow("archive", version?.hidden ? "Restore to media" : "Hide from media", () => { if (version) onHide(version); }) : null}</>;
  const metadata = version?.metadata.state === "verified" ? version.metadata : undefined;
  const previewStyle: CSSProperties & { "--vf-preview-aspect": string } = { "--vf-preview-aspect": isVideo && metadata?.width && metadata.height ? `${metadata.width} / ${metadata.height}` : "3 / 2" };
  const seekStyle: CSSProperties & { "--vf-playback-progress": string } = { "--vf-playback-progress": `${duration ? Math.max(0, Math.min(100, position / duration * 100)) : 0}%` };
  const details = [version?.label, metadata?.width && metadata.height ? `${metadata.width} × ${metadata.height}` : undefined, isVideo && metadata ? time(metadata.durationSeconds) : undefined].filter(Boolean).join(" · ");
  const detailControl = renderRequestDetails ? <Popover modal={false} open={detailsOpen} onOpenChange={setDetailsOpen}><PopoverTrigger asChild><FreshButton tone="quiet" className="vf-toolbar-details">{onBackToEdit ? "Details" : "Media details"}</FreshButton></PopoverTrigger><PopoverContent portalContainer={surface.current} className="vf vf-request-details-popover" side={onBackToEdit ? "bottom" : "top"} align="end" sideOffset={6}>{renderRequestDetails(() => setDetailsOpen(false))}</PopoverContent></Popover> : <TooltipProvider><Tooltip><TooltipTrigger asChild><FreshButton tone="quiet" className="vf-toolbar-details">{onBackToEdit ? "Details" : "Media details"}</FreshButton></TooltipTrigger><TooltipContent side="top">{details}</TooltipContent></Tooltip></TooltipProvider>;

  if (!version) return <section ref={surface} className="vf-viewer vf-empty-viewer" aria-label="Media viewer">{banner ? <div className="vf-viewer-banner">{banner}</div> : null}<div className="vf-viewer-surface" aria-label="Empty media preview" />{timeline ? <div className="vf-viewer-timeline">{timeline}</div> : null}{timelineControl ? <footer className="vf-viewer-toolbar" aria-label="Media controls">{timelineControl}</footer> : null}</section>;
  return <section ref={surface} className="vf-viewer" style={previewStyle} data-edit-inspection={editorInspection || undefined} data-mobile-clip={isVideo && !timeline || undefined} data-mobile-preview={mobilePreview || undefined} data-media-kind={isVideo ? "video" : "image"} aria-label="Media viewer" onKeyDown={event => { const target = event.target; if (event.key === "Escape" && mobileActionsOpen) { event.preventDefault(); setMobileActionsOpen(false); } if (event.code === "Space" && target instanceof HTMLElement && !target.closest("input,textarea,select,button,a,[contenteditable=true]")) { event.preventDefault(); togglePlayback(); } }}>
    <AreaMaskFilter id={maskFilterId} />
    {onBackToEdit ? <header className="vf-inspection-heading">{detailControl}<FreshButton tone="secondary" onClick={onBackToEdit}>Back to edit</FreshButton></header> : null}
    <div className="vf-viewer-mobile-heading">{onBack ? isVideo && !timeline ? <FreshButton tone="quiet" className="vf-mobile-clip-back" onClick={onBack}>Back to chat</FreshButton> : <Button variant="ghost" className="vf-icon-button !h-auto" aria-label="Back to conversation" onClick={onBack}><span className="vf-viewer-back-glyph" aria-hidden="true" /></Button> : <span />}<FreshIconButton ref={actionsTrigger} icon="more" label="Media actions" disabled={readOnly} onClick={() => setMobileActionsOpen(true)} /></div>
    {banner ? <div className="vf-viewer-banner">{banner}</div> : null}
    {notice ? <div className="vf-viewer-notice" role="status"><p>{notice}</p><FreshIconButton icon="close" label="Dismiss viewer notice" onClick={() => setNotice(undefined)} /></div> : null}
    <div className="vf-viewer-surface" tabIndex={isVideo ? 0 : undefined} aria-label={isVideo ? "Clip preview. Space toggles playback." : "Picture preview"}>
      {url && !error ? isVideo ? <video ref={backdrop} className="vf-media-blur vf-media-blur-video" src={url} muted playsInline preload="metadata" aria-hidden="true" tabIndex={-1} /> : <div className="vf-media-blur" style={{ backgroundImage: `url(${JSON.stringify(url)})` }} aria-hidden="true" /> : null}
      {loading ? <p role="status">Opening this version…</p> : null}
      {error ? <div className="vf-media-error" role="status"><p>{error}</p><FreshButton onClick={() => setRetry(value => value + 1)}>Retry {isVideo ? "playback" : "opening"}</FreshButton></div> : null}
      {url && !error ? isVideo ? <video key={version.id} ref={player} src={url} className="vf-media-display" preload="metadata" playsInline onLoadedMetadata={event => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)} onTimeUpdate={event => { setPosition(event.currentTarget.currentTime); setEnded(event.currentTarget.ended); if (backdrop.current && Math.abs(backdrop.current.currentTime - event.currentTarget.currentTime) > .2) backdrop.current.currentTime = event.currentTarget.currentTime; }} onPlay={() => { setPlaying(true); setEnded(false); }} onPause={() => setPlaying(false)} onEnded={event => { setPlaying(false); setEnded(true); setPosition(event.currentTarget.duration); }} onError={() => setError("This browser could not play this clip. Try again or download the original.")} /> : version.kind === "audio" ? <audio src={url} controls preload="metadata" aria-label={version.label} /> : <div className="vf-picture-stage"><img src={url} alt={version.label} className="vf-media-display" onError={() => setError("This picture could not display. Try again or download the original.")} />{areaMask?.versionId === version.id ? <img className="vf-viewer-area" src={areaMask.dataUri} alt="Selected picture area" style={{ filter: `url(#${maskFilterId})` }} /> : null}</div> : null}
    </div>
    {!isVideo && mobilePreview ? <p className="vf-mobile-picture-caption">{version.origin.kind === "upload" ? `${version.label} · v1` : version.label}</p> : null}
    {isVideo ? <div className="vf-mobile-preview-info"><p>{time(position)} / {time(duration || metadata?.durationSeconds || 0)}</p><FreshButton tone="quiet" onClick={onView} disabled={!onView}>View clip</FreshButton></div> : null}
    {timeline ? <div className="vf-viewer-timeline">{timeline}</div> : null}
    <footer className="vf-viewer-toolbar" aria-label="Media controls">
      <div className="vf-viewer-transport" data-kind={isVideo ? "video" : "picture"}>
        {isVideo ? <><FreshIconButton icon={playing ? "pause" : ended ? "undo" : "play"} label={playing ? "Pause clip" : ended ? "Replay clip" : "Play clip"} disabled={!url || Boolean(error)} onClick={togglePlayback} /><span className="vf-playback-time">{time(position)}<span className="vf-playback-duration"> / {time(duration)}</span></span><input className="vf-viewer-seek" style={seekStyle} type="range" aria-label="Clip position" min={0} max={duration || 0} step={0.001} value={Math.min(position, duration || 0)} disabled={!duration || Boolean(error)} onChange={event => { const value = Number(event.target.value); if (player.current) player.current.currentTime = value; setPosition(value); setEnded(value === duration); }} />{audible ? <Popover modal={false}><PopoverTrigger asChild><FreshIconButton icon="volume" label="Preview volume" aria-pressed={muted} /></PopoverTrigger><PopoverContent portalContainer={surface.current} className="vf vf-volume-menu" side="top" sideOffset={6} align="end"><FreshButton tone="quiet" onClick={() => setMuted(value => !value)}>{muted ? "Unmute" : "Mute"}</FreshButton><input type="range" aria-label="Preview volume" min={0} max={1} step={0.01} value={muted ? 0 : volume} onChange={event => { setVolume(Number(event.target.value)); setMuted(false); }} /></PopoverContent></Popover> : null}</> : <span className="vf-flex" />}
        <FreshIconButton icon="fullscreen" label="Toggle full screen" disabled={!url} onClick={() => { void fullscreen(); }} />
      </div>
      <span className="vf-toolbar-divider" aria-hidden="true" />
      {timelineControl}{inspectionActions}
      {!editorInspection ? <>{detailControl}
      {onDownload ? <Button variant="ghost" size="icon-xs" type="button" className="vf-toolbar-download !h-auto" aria-label="Download original" disabled={loading} onClick={() => onDownload(version)}><span className="vf-download-glyph" /></Button> : url ? <a className="vf-toolbar-download" aria-label="Download original" href={url} download rel="noreferrer"><span className="vf-download-glyph" /></a> : <Button variant="ghost" size="icon-xs" type="button" className="vf-toolbar-download !h-auto" aria-label="Download original" disabled><span className="vf-download-glyph" /></Button>}
      {version.kind !== "audio" ? <Popover modal={false} open={menuOpen} onOpenChange={open => { setMenuOpen(open); if (open) setMenu("use"); }}><PopoverTrigger asChild><FreshButton className="vf-setting-chip vf-use-trigger" disabled={readOnly} title={readOnly ? "This project or conversation is read only." : undefined}>Use <FreshIcon name="down" /></FreshButton></PopoverTrigger><PopoverContent portalContainer={surface.current} className="vf vf-use-menu" side="top" align="end" sideOffset={6} collisionPadding={12}>
        {menu === "use" ? <>{canReuseSetup ? actionRow("copy", "Reuse setup", () => onReuseSetup(version)) : null}{version.kind === "image" && onEdit ? actionRow("pencil", "Edit image", () => onEdit(version)) : null}{version.kind === "image" && onEditRegion ? actionRow("area", "Edit a region", () => onEditRegion(version)) : null}{version.kind === "image" && onAnimate ? actionRow("video", "Animate", () => onAnimate(version)) : null}{version.kind === "video" && onExtend ? actionRow("extend", "Extend", () => onExtend(version)) : null}{isVideo && onUseFrame ? actionRow("use-frame", "Use a frame", () => onUseFrame(version, position), !url || Boolean(error)) : null}{isVideo && onAddToVideo ? actionRow("add-to-edit", "Add to edit", () => onAddToVideo(version)) : null}{onVersions || onPreferred || onHide || onShare || onRename || onFavorite ? <FreshButton className="vf-media-action-row vf-desktop-media-actions" tone="quiet" onClick={() => setMenu("more")}><img src="/design-assets/fidelity-media-more.svg" alt="" /><span>Media actions</span></FreshButton> : null}</> : menu === "utilities" ? <>{actionRow("remove-background", "Remove background", () => undefined, true)}{actionRow("vectorize-image", "Vectorize image", () => undefined, true)}<p className="vf-image-tools-reason">No compatible model is currently available.</p></> : actions(false)}
      </PopoverContent></Popover> : null}</> : null}
    </footer>
    {mobileActionsOpen ? <Dialog open onOpenChange={setMobileActionsOpen}><DialogContent hideClose overlayClassName="vf-viewer-sheet-backdrop" className="vf vf-mobile-media-actions vf-viewer-dialog" aria-modal="true" aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); if (!document.querySelector('.vf-versions[data-state="open"]')) actionsTrigger.current?.focus(); }}><DialogTitle className="sr-only">Media actions</DialogTitle><header><FreshIconButton icon="close" label="Close media actions" onClick={() => setMobileActionsOpen(false)} /></header>{actions(true)}</DialogContent></Dialog> : null}
  </section>;
}
