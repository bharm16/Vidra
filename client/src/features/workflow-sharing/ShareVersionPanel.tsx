import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { Button } from "@promptstudio/system/button";
import { FreshButton, FreshIconButton } from "@/components/fresh/FreshButton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@promptstudio/system/dropdown-menu";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { useVersionSharing } from "./hooks/useVersionSharing";
import type { OwnedSharesPort } from "./api/sharingApi";
import lock from "./assets/share-lock.svg";
import globe from "./assets/share-globe.svg";
import chevron from "./assets/share-chevron.svg";
import menuLock from "./assets/share-menu-lock.svg";
import menuGlobe from "./assets/share-menu-globe.svg";
import selectedCheck from "./assets/share-check.svg";
import "./sharing.css";

export interface ShareVersionPanelProps { ownerId: string; projectId: string; version: MediaVersion; onClose(): void; api?: OwnedSharesPort; placement?: "viewer" | "editor" }
export function ShareVersionPanel(props: ShareVersionPanelProps): ReactElement {
  if (props.version.ownerId !== props.ownerId || props.version.projectId !== props.projectId) return <section className="vf vf-share-panel" role="dialog" aria-label="Sharing unavailable"><p>This version does not belong to the current account and project.</p><FreshButton onClick={props.onClose}>Close</FreshButton></section>;
  return <ShareVersionPanelState key={`${props.ownerId}:${props.projectId}:${props.version.id}`} {...props} />;
}
function ShareVersionPanelState({ ownerId, projectId, version, onClose, api, placement = "viewer" }: ShareVersionPanelProps): ReactElement {
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
    const dismiss = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || event.defaultPrevented || event.target instanceof Element && event.target.closest(".vf-share-access-menu")) return;
      close.current();
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, []);
  const control = useVersionSharing({ ownerId, projectId, versionId: version.id }, api);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const id = useId();
  const { state, share, thumbnail } = control;
  const busy = state.phase === "loading" || state.phase === "publishing" || state.phase === "revoking";
  const eligible = version.kind !== "audio" && version.object.identity === "verified" && version.metadata.state === "verified" && version.association === "linked";
  const accessLabel = state.phase === "loading" ? "Checking access…" : state.phase === "revoking" ? "Turning off access…" : state.pending || state.phase === "error" ? "Access unconfirmed" : share ? "Anyone with the link" : "Only you";
  const publicLink = share && state.phase === "published" ? new URL(`/share/media/${share.id}`, window.location.origin).toString() : undefined;
  const copyLink = async (): Promise<void> => {
    if (!publicLink) return;
    try { await navigator.clipboard.writeText(publicLink); setCopy("copied"); } catch { setCopy("failed"); }
  };
  return <>{createPortal(<Button variant="ghost" className="vf-share-backdrop" aria-label="Close sharing overlay" onClick={onClose} />, document.body)}<section ref={panel} className="vf vf-share-panel" data-placement={placement} role="dialog" aria-labelledby={`${id}-title`} aria-busy={busy} tabIndex={-1} onKeyDown={event => { if (event.key === "Escape" && !(event.target instanceof Element && event.target.closest(".vf-share-access-menu"))) { event.stopPropagation(); onClose(); } }}>
    <header>{thumbnail ? version.kind === "image" ? <img className="vf-share-thumbnail" src={thumbnail} alt="" /> : <video className="vf-share-thumbnail" src={thumbnail} muted playsInline preload="metadata" aria-hidden="true" /> : <span className="vf-share-thumbnail vf-share-thumbnail-empty" aria-hidden="true" />}<h2 id={`${id}-title`}>Share {version.label}</h2><FreshIconButton icon="close" label="Close sharing" onClick={onClose} /></header>
    <label id={`${id}-access`}>Who has access</label>
    <DropdownMenu><DropdownMenuTrigger asChild><FreshButton className="vf-share-access" tone="secondary" aria-labelledby={`${id}-access ${id}-value`} disabled={busy || !eligible || (state.phase === "error" && !state.pending && !state.revokeIds.length)}><img src={share && !state.pending ? globe : lock} alt="" /><span id={`${id}-value`}>{accessLabel}</span><img src={chevron} alt="" /></FreshButton></DropdownMenuTrigger><DropdownMenuContent className="vf vf-share-access-menu" align="start" sideOffset={6}><DropdownMenuRadioGroup value={share && !state.pending ? "public" : "private"} onValueChange={value => { setCopy("idle"); if (value === "public") void control.publish(); else void control.revoke(); }}><DropdownMenuRadioItem value="private" disabled={Boolean(state.pending)}><img src={menuLock} alt="" />Only you{!share ? <img className="vf-share-selected-check" src={selectedCheck} alt="" /> : null}</DropdownMenuRadioItem><DropdownMenuRadioItem value="public" disabled={Boolean(state.revokeIds.length)}><img src={menuGlobe} alt="" />Anyone with the link{share ? <img className="vf-share-selected-check" src={selectedCheck} alt="" /> : null}</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
    <div className="vf-share-actions"><FreshButton tone="primary" disabled={!publicLink} onClick={() => { void copyLink(); }}>{copy === "copied" && publicLink ? "Copied" : "Copy link"}</FreshButton></div>
    {state.phase === "loading" ? <p role="status">Checking access…</p> : state.phase === "publishing" ? <p role="status">Making this version available…</p> : state.phase === "revoking" ? <p role="status">Turning off link access…</p> : null}
    {!eligible ? <p>This version must be ready before you can share it.</p> : null}
    {state.error ? <div role="alert"><p>{state.error}</p><FreshButton onClick={() => { if (state.revokeIds.length) void control.revoke(); else if (state.pending) void control.publish(); else void control.refresh(); }}>{state.revokeIds.length ? "Retry stop sharing" : state.pending ? "Retry publication" : "Try again"}</FreshButton></div> : null}
    {state.localOnly ? <p role="status">This browser could not keep the publication for a reload. Keep this panel open until the outcome is confirmed.</p> : null}
    {copy === "failed" && publicLink ? <div className="vf-share-copy-fallback" role="status"><p>Could not copy. Select and copy this link manually.</p><input readOnly aria-label="Share link" value={publicLink} onFocus={event => event.currentTarget.select()} /></div> : null}
  </section></>;
}
