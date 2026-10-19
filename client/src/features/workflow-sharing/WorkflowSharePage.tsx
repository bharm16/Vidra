import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { Link, useParams } from "react-router-dom";
import { FreshButton, FreshIconButton } from "@/components/fresh/FreshButton";
import { usePublicVersion } from "./hooks/usePublicVersion";
import type { PublicSharesPort } from "./api/sharingApi";
import publicUnavailableLock from "./assets/fidelity-media-public-unavailable-lock.svg";
import "./sharing.css";

function time(value: number): string {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Public metadata remains limited to the exact shared version. Transport is view-local. */
export function WorkflowSharePage({ shareId, api }: { shareId?: string; api?: PublicSharesPort }): ReactElement {
  const params = useParams<{ id?: string; uuid?: string }>();
  const id = shareId ?? params.id ?? params.uuid ?? "";
  const control = usePublicVersion(id, api);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [height, setHeight] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [playbackError, setPlaybackError] = useState<string>();
  const video = useRef<HTMLVideoElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  useEffect(() => { setMediaFailed(false); setPosition(0); setDuration(0); setHeight(0); setPlaying(false); setPlaybackError(undefined); }, [id]);
  const state = control.state;
  const seekStyle: CSSProperties & { "--vf-playback-progress": string } = { "--vf-playback-progress": `${duration ? Math.max(0, Math.min(100, position / duration * 100)) : 0}%` };
  const togglePlayback = (): void => {
    const element = video.current;
    if (!element) return;
    if (element.paused) { if (element.ended) element.currentTime = 0; void element.play().catch(() => setPlaybackError("Playback could not start. Try again or download this clip.")); }
    else element.pause();
  };
  const fullscreen = async (): Promise<void> => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await surface.current?.requestFullscreen(); }
    catch { setPlaybackError("Full screen is unavailable in this browser."); }
  };
  const create = <Link className="vf-public-share-create" to="/app">Create with Vidra</Link>;
  return <div className="vf vf-workflow-share" data-phase={state.phase} data-media-kind={state.phase === "ready" ? state.version.kind : undefined}><header><Link to="/" aria-label="Vidra home">Vidra</Link></header><main>
    {state.phase === "loading" ? <section className="vf-public-share-message" role="status"><h1>Opening the shared file…</h1>{create}</section> : state.phase === "unavailable" ? <section className="vf-public-share-message vf-public-share-unavailable"><img src={publicUnavailableLock} alt="" /><h1 className="vf-public-desktop-copy">This link is no longer available</h1><h1 className="vf-public-mobile-copy">This link is not available</h1><p className="vf-public-desktop-copy">The owner may have turned off access.</p><p className="vf-public-mobile-copy">The owner may have turned the link off. Ask them for a new link.</p>{create}</section> : state.phase === "error" ? <section className="vf-public-share-message"><h1>The shared file could not load</h1><p>Check your connection and try again.</p><FreshButton tone="primary" onClick={control.retry}>Try again</FreshButton>{create}</section> : <>
      {state.version.kind === "image" ? <h1 className="vf-public-share-title">{state.version.label}</h1> : null}
      <div ref={surface} className="vf-public-share-playable"><div className="vf-public-share-media">{mediaFailed ? <section className="vf-public-share-message"><p>{state.version.kind === "image" ? "This picture could not display." : "This browser could not play the clip."}</p><FreshButton onClick={() => { setMediaFailed(false); control.retry(); }}>Retry opening</FreshButton></section> : state.version.kind === "image" ? <img src={state.version.url} alt={state.version.label} onError={() => { setMediaFailed(true); control.retry(); }} /> : <video key={id} ref={video} src={state.version.url} playsInline preload="metadata" aria-label={state.version.label} muted={muted} onLoadedMetadata={event => { setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0); setHeight(event.currentTarget.videoHeight); }} onTimeUpdate={event => setPosition(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => { setMediaFailed(true); control.retry(); }} />}</div>
        {state.version.kind !== "image" && !mediaFailed ? <div className="vf-public-share-controls" aria-label="Shared video controls"><FreshIconButton icon={playing ? "pause" : "play"} label={playing ? "Pause shared video" : "Play shared video"} onClick={togglePlayback} /><span>{time(position)}<span className="vf-public-time-duration"> / {time(duration)}</span></span><input style={seekStyle} type="range" aria-label="Shared video position" min={0} max={duration || 0} value={Math.min(position, duration)} step={.001} disabled={!duration} onChange={event => { const next = Number(event.target.value); if (video.current) video.current.currentTime = next; setPosition(next); }} /><FreshIconButton icon="volume" label={muted ? "Unmute shared video" : "Mute shared video"} aria-pressed={muted} onClick={() => setMuted(value => !value)} /><FreshIconButton icon="fullscreen" label="Toggle shared video full screen" onClick={() => { void fullscreen(); }} /></div> : null}
      </div>
      <footer><p>{state.version.kind === "image" ? "Shared image" : height && duration ? `${state.version.label} · ${time(duration)} · ${height}p` : state.version.kind === "export" ? "Shared video" : "Shared clip"}</p><FreshButton tone="primary" onClick={() => { void control.download(); }} disabled={control.downloading}>{control.downloading ? "Opening download…" : "Download"}</FreshButton>{create}</footer>{control.downloadError ? <p role="alert" className="vf-public-share-error">{control.downloadError}</p> : null}{playbackError ? <p role="status" className="vf-public-share-error">{playbackError}</p> : null}
    </>}
  </main></div>;
}
