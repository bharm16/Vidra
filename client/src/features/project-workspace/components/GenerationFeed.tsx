import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type RefObject } from "react";
import type { AcceptedRequest, RequestSlot } from "@shared/schemas/workflow/request.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import type { CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import type { SubmissionCheckpoint } from "@/repositories/workflow/DraftCheckpointStore";
import { FreshButton, FreshIconButton } from "@/components/fresh/FreshButton";
import { Button } from "@promptstudio/system/components/ui/button";
import { actionEntry } from "@shared/workflow/actionRegistry";
import { MediaThumbnail } from "./MediaThumbnail";
import { RequestSlotStatus, slotProgress } from "./RequestResults";
import { RequestActions, type ConversationHistoryProps } from "./ConversationHistory";
import { requestHistoryDescription } from "../state/requestDescription";
import { verbsForResult, type ResultVerb } from "../state/resultVerbs";
import { parseWebVtt, cueTime } from "@shared/workflow/webVtt";
import { Waveform, useAudioPeaks } from "@/components/fresh/Waveform";
import "./generation-feed.css";

function time(value: number): string {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export interface GenerationFeedProps extends Pick<ConversationHistoryProps, "onReuseSetup" | "onNewVariation" | "onUseWords" | "onViewSources" | "onViewVersions" | "onHideFromMedia" | "readOnly" | "readOnlyReason"> {
  requests: AcceptedRequest[];
  media: MediaVersion[];
  profiles: CapabilityProfile[];
  pending: SubmissionCheckpoint[];
  viewedVersionId: string | undefined;
  access(versionId: string): Promise<{ url: string }>;
  /** Opens Focus on one result. */
  onOpen(versionId: string): void;
  onVerb(verb: ResultVerb, version: MediaVersion, request: AcceptedRequest): void;
  onDownload(version: MediaVersion): void;
  onRetry(request: AcceptedRequest, slotId: string): void;
  onRecover(submission: SubmissionCheckpoint): void;
  onApplyText(request: AcceptedRequest, text: string): void;
  /** Places a transcript's cues on the video's Captions lane. */
  onCaptionsToVideo?(request: AcceptedRequest, text: string): void;
}

/** A clip at feed size with its own transport: play stays inline, anything else opens Focus. */
function FeedClip({ version, access, onOpen }: { version: MediaVersion; access(versionId: string): Promise<{ url: string }>; onOpen(): void }): ReactElement {
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const player = useRef<HTMLVideoElement>(null);
  const accessRef = useRef(access);
  accessRef.current = access;
  useEffect(() => {
    let current = true;
    void accessRef.current(version.id).then(result => { if (current) setUrl(result.url); }).catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [version.id]);
  const duration = version.metadata.state === "verified" ? version.metadata.durationSeconds : 0;
  const toggle = (): void => {
    const video = player.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => setFailed(true)); else video.pause();
  };
  return <div className="vf-feed-clip">
    {url && !failed ? <video ref={player} src={url} playsInline preload="metadata" aria-label={version.label} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => setFailed(true)} onLoadedMetadata={event => { const video = event.currentTarget; if (Number.isFinite(video.duration) && video.duration > 0 && video.currentTime === 0) video.currentTime = Math.min(1 / 30, video.duration / 2); }} /> : <span className="vf-thumbnail-fallback" role={failed ? "img" : "status"} aria-label={failed ? "Preview unavailable" : "Opening preview"}>{failed ? "!" : <img src="/design-assets/media-loader.svg" alt="" className="vf-thumbnail-loader" />}</span>}
    <Button type="button" variant="ghost" className="vf-feed-open" aria-label={`Open ${version.label}`} onClick={onOpen} />
    <FreshIconButton className="vf-feed-play" icon={playing ? "pause" : "play"} label={playing ? "Pause clip" : "Play clip"} disabled={!url || failed} onClick={toggle} />
    {duration ? <span className="vf-feed-duration">{time(duration)}</span> : null}
  </div>;
}

/** One take as a feed row (S9, W80): play, its waveform with what has played, and its length; the row opens Focus. */
function FeedAudio({ version, access, onOpen }: { version: MediaVersion; access(versionId: string): Promise<{ url: string }>; onOpen(): void }): ReactElement {
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const player = useRef<HTMLAudioElement>(null);
  const accessRef = useRef(access);
  accessRef.current = access;
  useEffect(() => {
    let current = true;
    void accessRef.current(version.id).then(result => { if (current) setUrl(result.url); }).catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [version.id]);
  const peaks = useAudioPeaks(url, 96);
  const duration = version.metadata.state === "verified" ? version.metadata.durationSeconds : 0;
  const toggle = (): void => {
    const audio = player.current;
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => setFailed(true)); else audio.pause();
  };
  return <div className="vf-feed-audio">
    {url ? <audio ref={player} src={url} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setProgress(0); }} onTimeUpdate={event => { const audio = event.currentTarget; setProgress(audio.duration ? audio.currentTime / audio.duration : 0); }} onError={() => setFailed(true)} /> : null}
    <FreshIconButton className="vf-feed-audio-play" icon={playing ? "pause" : "play"} label={playing ? `Pause ${version.label}` : `Play ${version.label}`} disabled={!url || failed} onClick={toggle} />
    <Button type="button" variant="ghost" className="vf-feed-audio-open" aria-label={`Open ${version.label}`} onClick={onOpen}><Waveform peaks={peaks} bars={96} progress={progress} /></Button>
    <span className="vf-feed-audio-time">{time(duration)}</span>
  </div>;
}

function download(name: string, text: string, type: string): void {
  const link = document.createElement("a");
  const url = URL.createObjectURL(new Blob([text], { type }));
  link.href = url; link.download = name; link.rel = "noreferrer"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Captions stay a text result (S10, W80): cues with their time and speaker; a transcript without timing reads as words. */
function FeedCaptions({ request, text, readOnly, onApplyText, onCaptionsToVideo }: { request: AcceptedRequest; text: string; readOnly: boolean | undefined; onApplyText(request: AcceptedRequest, text: string): void; onCaptionsToVideo?: ((request: AcceptedRequest, text: string) => void) | undefined }): ReactElement {
  const [all, setAll] = useState(false);
  const cues = parseWebVtt(text);
  if (!cues) return <div className="vf-feed-text vf-feed-transcript"><p>{text}</p><div className="vf-feed-text-actions">{!readOnly ? <FreshButton tone="quiet" onClick={() => onApplyText(request, text)}>Use these words</FreshButton> : null}<FreshButton tone="quiet" onClick={() => download("transcript.txt", text, "text/plain")}>Download .txt</FreshButton></div></div>;
  const shown = all ? cues : cues.slice(0, 4);
  return <div className="vf-feed-captions">
    <ol aria-label="Captions">{shown.map((cue, index) => <li key={index}><p className="vf-feed-cue-time">{cueTime(cue.start)}{cue.speaker ? ` · ${cue.speaker}` : ""}</p><p>{cue.text}</p></li>)}</ol>
    {cues.length > 4 ? <FreshButton tone="quiet" className="vf-feed-captions-more" aria-expanded={all} onClick={() => setAll(value => !value)}>{all ? "Show fewer lines" : `Show all ${cues.length} lines`}</FreshButton> : null}
    <div className="vf-feed-text-actions">{onCaptionsToVideo && !readOnly ? <FreshButton onClick={() => onCaptionsToVideo(request, text)}>Add to video</FreshButton> : null}<FreshButton tone="quiet" onClick={() => download("captions.vtt", text, "text/vtt")}>Download .vtt</FreshButton></div>
  </div>;
}

/** How many verbs fit beside the row's trailing icons; recomputed when the row resizes. */
function useFittingVerbs(key: string): { row: RefObject<HTMLDivElement>; measure: RefObject<HTMLDivElement>; count: number } {
  const row = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(Number.POSITIVE_INFINITY);
  useLayoutEffect(() => {
    const container = row.current; const copies = measure.current;
    if (!container || !copies) return;
    const update = (): void => {
      const widths = [...copies.children].map(child => child.getBoundingClientRect().width);
      const trailing = [...container.children].filter(child => child !== copies && !child.classList.contains("vf-generation-verb") && !child.classList.contains("vf-flex")).reduce((sum, child) => sum + child.getBoundingClientRect().width + 2, 0);
      const available = container.clientWidth - trailing - 8;
      let used = 0; let fits = 0;
      for (const width of widths) { if (used + width + 2 > available) break; used += width + 2; fits += 1; }
      setCount(available <= 0 || !widths.some(width => width > 0) ? widths.length : fits);
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [key]);
  return { row, measure, count };
}

/** A running or failed slot holds its final size in the feed (P5). */
function SlotPlaceholder({ request, slot, onRetry }: { request: AcceptedRequest; slot: RequestSlot; onRetry(request: AcceptedRequest, slotId: string): void }): ReactElement | null {
  return <div className="vf-feed-slot-status" data-progress={slotProgress(slot)}><RequestSlotStatus request={request} slot={slot} presentation="inline" onRetry={onRetry} /></div>;
}

function Generation({ request, props }: { request: AcceptedRequest; props: GenerationFeedProps }): ReactElement {
  const { media, profiles, access, onOpen, onVerb, onDownload, onRetry, onApplyText, viewedVersionId, readOnly } = props;
  const entry = actionEntry(request.snapshot.action);
  const ready = request.slots.flatMap(slot => {
    const version = slot.versionId ? media.find(candidate => candidate.id === slot.versionId) : undefined;
    return version ? [version] : [];
  });
  // A batch's buttons act on the result last opened in Focus, else its first.
  const target = ready.find(version => version.id === viewedVersionId) ?? ready[0];
  const verbs = target && !readOnly ? verbsForResult(target, profiles, { variation: Boolean(props.onNewVariation) }) : [];
  const fitting = useFittingVerbs(verbs.map(verb => verb.label).join("|"));
  const source = request.snapshot.inputs.find(input => input.state === "resolved");
  const sourceLabel = source?.state === "resolved" ? media.find(version => version.id === source.versionId)?.label : undefined;
  const words = request.snapshot.instructions.trim() || sourceLabel || entry.label;
  const pictures = entry.group === "picture";
  return <article id={`vf-request-${request.id}`} className="vf-generation" data-kind={entry.group} data-count={request.slots.length} aria-label={words}>
    <header className="vf-generation-line"><p className="vf-generation-words">{words}</p><p className="vf-generation-setup">{requestHistoryDescription(request, profiles)}</p></header>
    <div className="vf-generation-results" data-kind={entry.group} data-count={request.slots.length}>{request.slots.map((slot, index) => {
      const version = slot.versionId ? media.find(candidate => candidate.id === slot.versionId) : undefined;
      if (slot.text !== undefined && slot.outcome === "completed" && request.snapshot.action === "transcribe") return <FeedCaptions key={slot.id} request={request} text={slot.text} readOnly={readOnly} onApplyText={onApplyText} onCaptionsToVideo={props.onCaptionsToVideo} />;
      if (slot.text !== undefined && slot.outcome === "completed") return <div className="vf-feed-text" key={slot.id}><p>{slot.text}</p>{!readOnly ? <FreshButton tone="quiet" onClick={() => onApplyText(request, slot.text ?? "")}>Use these words</FreshButton> : null}</div>;
      if (!version) return <SlotPlaceholder key={slot.id} request={request} slot={slot} onRetry={onRetry} />;
      if (version.kind === "audio") return <FeedAudio key={slot.id} version={version} access={access} onOpen={() => onOpen(version.id)} />;
      if (version.kind === "video" || version.kind === "export") return <FeedClip key={slot.id} version={version} access={access} onOpen={() => onOpen(version.id)} />;
      return <FreshButton key={slot.id} tone="quiet" className="vf-feed-picture" data-selected={pictures && request.slots.length > 1 && version.id === target?.id || undefined} data-version-id={version.id} aria-label={request.slots.length > 1 ? `Open ${version.label}, ${index + 1} of ${request.slots.length}` : `Open ${version.label}`} onClick={() => onOpen(version.id)}><MediaThumbnail version={version} access={access} className="vf-feed-media" /></FreshButton>;
    })}</div>
    {target ? <div ref={fitting.row} className="vf-generation-actions" role="group" aria-label="Result actions">
      {/* A copy of every verb, measured off-screen, decides how many fit on the one row; the rest open from ··· (W61). */}
      <div ref={fitting.measure} className="vf-generation-measure" aria-hidden="true">{verbs.map(verb => <span key={verb.label} className="vf-button vf-generation-verb" data-tone="quiet"><span>{verb.label}</span></span>)}</div>
      {verbs.slice(0, fitting.count).map(verb => <FreshButton key={verb.label} tone="quiet" className="vf-generation-verb" disabled={verb.disabled} onClick={() => onVerb(verb, target, request)}>{verb.label}</FreshButton>)}
      <span className="vf-flex" />
      {props.onReuseSetup && !readOnly ? <Button type="button" variant="ghost" className="vf-generation-icon" aria-label="Reuse setup" title="Reuse setup" onClick={() => props.onReuseSetup?.(request)}><span className="vf-icon" aria-hidden="true" style={{ maskImage: 'url("/design-assets/fresh-icon-copy.svg")' }} /></Button> : null}
      <Button type="button" variant="ghost" className="vf-generation-icon" aria-label="Download original" title="Download" onClick={() => onDownload(target)}><span className="vf-icon" aria-hidden="true" style={{ maskImage: 'url("/design-assets/fresh-icon-download.svg")' }} /></Button>
      <RequestActions request={request} props={props} overflow={verbs.slice(fitting.count).map(verb => ({ label: verb.label, disabled: verb.disabled, run: () => onVerb(verb, target, request) }))} />
    </div> : null}
  </article>;
}

/** The feed is the stage (Rule 2): every request with its results at feed size and their verbs under them, newest last. */
export const GenerationFeed = forwardRef<HTMLDivElement, GenerationFeedProps>(function GenerationFeed(props, ref): ReactElement {
  const { requests, pending, onRecover } = props;
  return <div ref={ref} className="vf-generation-feed" aria-label="Generations">
    {requests.map(request => <Generation key={request.id} request={request} props={props} />)}
    {pending.filter(item => !requests.some(request => request.executionDraftId === item.command.draftId && request.executionDraftRevision === item.command.draftRevision)).map(submission => <article className="vf-generation vf-unknown-submission" key={submission.submissionId}><p>Checking submission…</p><FreshButton tone="quiet" onClick={() => onRecover(submission)}>Check again</FreshButton></article>)}
  </div>;
});
