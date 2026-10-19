import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { FreshButton } from "@/components/fresh/FreshButton";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import type { VideoComposition, VideoText, VideoValidationIssue } from "@shared/schemas/workflow/video-edit.schemas";
import { absoluteText, compositionFrames, sourceAudioInterval, timelineItemAtFrame } from "@shared/video-edit/composition";
import type { VideoSource } from "../hooks/useVideoSources";

interface Props { composition: VideoComposition; issues?: readonly VideoValidationIssue[]; frame: number; playing: boolean; volume: number; muted: boolean; media: MediaVersion[]; sources: Record<string, VideoSource>; onFrame(frame: number): void; onPlaying(playing: boolean): void; onRetry(id: string): void; onFailed(id: string): void; onChooseMedia?(): void; chooseControl?: ReactNode; }

/** A rejected glyph stays editable in the saved words but has no qualified output paint. */
function captionPreviewText(caption: VideoText, issues: readonly VideoValidationIssue[]): string {
  const unsupported = new Set(issues.flatMap(issue => issue.elementId === caption.id && issue.code === "text_render_policy" ? issue.unsupportedCodePoints ?? [] : []));
  return unsupported.size ? [...caption.text].filter(character => !unsupported.has(character.codePointAt(0) ?? -1)).join("") : caption.text;
}

/** The playhead is a view preference. Sources and captions always use exact saved IDs. */
export function EditorPreview({ composition, issues = [], frame, playing, volume, muted, media, sources, onFrame, onPlaying, onRetry, onFailed, onChooseMedia, chooseControl }: Props): ReactElement {
  const player = useRef<HTMLVideoElement>(null); const background = useRef<HTMLAudioElement>(null); const output = useRef<HTMLDivElement>(null);
  const ambient = useRef<HTMLVideoElement>(null);
  const gainGraphs = useRef(new Map<HTMLMediaElement, { context: AudioContext; gain: GainNode }>());
  const sharedAudioContext = useRef<AudioContext>();
  const [audioError, setAudioError] = useState<string>();
  const applyGain = useCallback((element: HTMLMediaElement, gain: number, isMuted: boolean): void => {
    let graph = gainGraphs.current.get(element);
    if (!graph && gain > 1 && typeof AudioContext !== "undefined") {
      try { const context = sharedAudioContext.current ?? new AudioContext(); sharedAudioContext.current = context; const amplifier = context.createGain(); context.createMediaElementSource(element).connect(amplifier); amplifier.connect(context.destination); graph = { context, gain: amplifier }; gainGraphs.current.set(element, graph); } catch { setAudioError("This browser could not preview amplified audio. Lower its level to 100% or use another browser."); }
    }
    if (graph) { element.volume = 1; element.muted = false; graph.gain.gain.value = isMuted ? 0 : gain; if (playing && graph.context.state === "suspended") void graph.context.resume().catch(() => onPlaying(false)); }
    else { element.volume = Math.min(1, gain); element.muted = isMuted; if (gain > 1 && typeof AudioContext === "undefined") setAudioError("This browser cannot preview amplified audio. Lower its level to 100%."); }
  }, [playing, onPlaying]);
  useEffect(() => { const graphs = gainGraphs.current; return () => { for (const graph of graphs.values()) graph.gain.disconnect(); void sharedAudioContext.current?.close(); sharedAudioContext.current = undefined; graphs.clear(); }; }, []);
  const current = timelineItemAtFrame(composition, frame); const item = current?.item; const source = item ? sources[item.versionId] : undefined;
  const selected = media.find(version => version.id === item?.versionId); const duration = compositionFrames(composition);
  const state = useRef({ frame, onFrame, onPlaying, duration, blocked: false }); state.current = { frame, onFrame, onPlaying, duration, blocked: Boolean(item && (!source?.url || source.error)) };
  const sourceFrame = item && current ? item.inFrame + Math.max(0, Math.min(item.displayFrames - 1, frame - current.startFrame)) : 0;
  const bg = composition.backgroundAudio; const bgSource = bg ? sources[bg.versionId] : undefined; const bgActive = Boolean(bg && frame >= bg.startFrame && frame < Math.min(bg.endFrame, duration));
  useEffect(() => { const video = player.current; const audio = background.current; const atmosphere = ambient.current; return () => { if (video && !video.paused) video.pause(); if (audio && !audio.paused) audio.pause(); if (atmosphere && !atmosphere.paused) atmosphere.pause(); }; }, [source?.url, bgSource?.url]);
  useEffect(() => {
    if (!playing) return;
    let handle = 0; let previous = performance.now(); let carry = 0;
    const tick = (now: number): void => { const currentState = state.current; const elapsed = Math.min(100, now - previous); previous = now; if (currentState.blocked || (player.current && player.current.readyState < 2)) { handle = requestAnimationFrame(tick); return; } carry += elapsed * 30 / 1000; const step = Math.floor(carry); if (step) { carry -= step; const next = currentState.frame + step; if (next >= currentState.duration) { currentState.onFrame(currentState.duration); currentState.onPlaying(false); return; } currentState.onFrame(next); } handle = requestAnimationFrame(tick); };
    handle = requestAnimationFrame(tick); return () => cancelAnimationFrame(handle);
  }, [playing]);
  useEffect(() => {
    const video = player.current; if (!video || !item) return;
    const target = sourceFrame / 30; if (Math.abs(video.currentTime - target) > .12 || !playing) video.currentTime = target;
    const audio = sourceAudioInterval(item); const clipFrame = sourceFrame - item.inFrame;
    applyGain(video, volume * item.sourceAudio.gain, muted || item.sourceAudio.muted || Boolean(item.sourceAudio.removed) || clipFrame < audio.startFrame || clipFrame >= audio.endFrame);
    if (playing && video.paused) void video.play().catch(() => onPlaying(false)); else if (!playing && !video.paused) video.pause();
  }, [sourceFrame, playing, item, source?.url, volume, muted, onPlaying, applyGain]);
  useEffect(() => {
    const video = ambient.current;
    if (!video) return;
    const target = sourceFrame / 30;
    if (Math.abs(video.currentTime - target) > .12 || !playing) video.currentTime = target;
    if (playing && video.paused) void video.play().catch(() => undefined);
    else if (!playing && !video.paused) video.pause();
  }, [sourceFrame, playing, source?.url]);
  useEffect(() => {
    const audio = background.current; if (!audio || !bg) return;
    const target = Math.max(0, (bg.sourceInFrame + frame - bg.startFrame) / 30);
    if (Math.abs(audio.currentTime - target) > .15 || !playing) audio.currentTime = target;
    applyGain(audio, volume * bg.gain, muted);
    if (playing && bgActive && audio.paused) void audio.play().catch(() => onPlaying(false)); else if ((!playing || !bgActive) && !audio.paused) audio.pause();
  }, [bg, bgActive, frame, playing, volume, muted, bgSource?.url, onPlaying, applyGain]);
  useEffect(() => { if (item && source?.error) onPlaying(false); }, [item, source?.error, onPlaying]);
  const crop = item?.fit === "crop" ? item.crop : undefined;
  const ratio = composition.preset === "landscape" ? 16 / 9 : composition.preset === "portrait" ? 9 / 16 : 1;
  const sourceWidth = selected?.metadata.state === "verified" ? selected.metadata.width ?? 1 : 1; const sourceHeight = selected?.metadata.state === "verified" ? selected.metadata.height ?? 1 : 1;
  const cropScale = crop ? Math.max(ratio / (sourceWidth * crop.width), 1 / (sourceHeight * crop.height)) : 1;
  const style: CSSProperties = crop ? { width: `${sourceWidth * cropScale / ratio * 100}%`, height: `${sourceHeight * cropScale * 100}%`, left: `${((ratio - sourceWidth * crop.width * cropScale) / 2 - sourceWidth * crop.x * cropScale) / ratio * 100}%`, top: `${((1 - sourceHeight * crop.height * cropScale) / 2 - sourceHeight * crop.y * cropScale) * 100}%`, objectFit: "fill", position: "absolute" } : { objectFit: item?.fit === "fill" ? "cover" : "contain" };
  return <div className="ve-preview-monitor" ref={output} aria-label="Video preview">
    {source?.url && !source.error ? item?.kind === "clip" ? <video key={source.url} ref={ambient} className="ve-preview-ambient" src={source.url} muted playsInline preload="auto" aria-hidden="true" tabIndex={-1} onLoadedMetadata={event => { event.currentTarget.currentTime = sourceFrame / 30; }} /> : <div className="ve-preview-ambient" aria-hidden="true" style={{ backgroundImage: `url(${JSON.stringify(source.url)})` }} /> : null}
    {!item ? <div className="ve-empty-preview"><img src="/design-assets/fidelity-media-empty-video.svg" alt="" /><p>Add pictures or clips to start your video</p>{chooseControl ?? <FreshButton onClick={onChooseMedia}>Choose media</FreshButton>}</div> : <div className="ve-output" data-preset={composition.preset}>
      {!selected || source?.error ? <div className="ve-source-error" role="status"><h3 className="sr-only">Source unavailable</h3><span className="ve-unavailable-icon" aria-hidden="true" /><p>This file is unavailable</p><FreshButton aria-label="Retry source" title={source?.error ?? "Retry this exact version"} onClick={() => onRetry(item.versionId)}>Try again</FreshButton></div> : !source?.url ? <p className="ve-opening" role="status">Opening this source…</p> : <div className="ve-source-crop">{item.kind === "clip" ? <video key={`${item.versionId}:${source.url}`} ref={player} src={source.url} crossOrigin="anonymous" style={style} playsInline preload="auto" onLoadedMetadata={event => { event.currentTarget.currentTime = sourceFrame / 30; }} onError={() => onFailed(item.versionId)} /> : <img src={source.url} alt={selected.label} style={style} onError={() => onFailed(item.versionId)} />}</div>}
      {composition.text.filter(caption => { const range = absoluteText(composition, caption); return range !== undefined && (caption.anchor.kind !== "item" || current?.item.id === caption.anchor.itemId) && frame >= range.startFrame && frame < range.endFrame; }).map(caption => <div key={caption.id} className="ve-caption-preview" style={{ left: `${caption.x * 100}%`, top: `${caption.y * 100}%`, width: `${caption.width * 100}%`, height: `${caption.height * 100}%`, fontSize: `calc(var(--ve-output-width) * ${caption.fontSize / (composition.preset === "portrait" ? 1080 : composition.preset === "square" ? 1080 : 1920)})`, fontWeight: caption.fontWeight, fontFamily: caption.fontFamily === "Figtree" ? "'Vidra Video Figtree', Figtree, sans-serif" : undefined, letterSpacing: caption.letterSpacingEm === undefined ? undefined : `${caption.letterSpacingEm}em`, lineHeight: caption.lineHeightEm, color: caption.color, background: caption.background ?? "transparent", textAlign: caption.align }}>{captionPreviewText(caption, issues)}</div>)}
    </div>}
    {bg && bgSource?.url ? <audio key={`${bg.versionId}:${bgSource.url}`} ref={background} src={bgSource.url} crossOrigin="anonymous" preload="auto" onError={() => { onFailed(bg.versionId); onPlaying(false); }} /> : null}
    {bg && bgSource?.error ? <p className="ve-audio-warning" role="status">Background audio unavailable. <FreshButton onClick={() => onRetry(bg.versionId)}>Retry audio</FreshButton></p> : null}
    {audioError ? <p className="ve-audio-warning" role="status">{audioError}</p> : null}
  </div>;
}
