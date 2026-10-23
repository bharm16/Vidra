import { forwardRef, useEffect, useRef, useState, type ReactElement } from "react";
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
  const source = request.snapshot.inputs.find(input => input.state === "resolved");
  const sourceLabel = source?.state === "resolved" ? media.find(version => version.id === source.versionId)?.label : undefined;
  const words = request.snapshot.instructions.trim() || sourceLabel || entry.label;
  const pictures = entry.group === "picture";
  return <article id={`vf-request-${request.id}`} className="vf-generation" data-kind={entry.group} data-count={request.slots.length} aria-label={words}>
    <header className="vf-generation-line"><p className="vf-generation-words">{words}</p><p className="vf-generation-setup">{requestHistoryDescription(request, profiles)}</p></header>
    <div className="vf-generation-results" data-kind={entry.group} data-count={request.slots.length}>{request.slots.map(slot => {
      const version = slot.versionId ? media.find(candidate => candidate.id === slot.versionId) : undefined;
      if (slot.text !== undefined && slot.outcome === "completed") return <div className="vf-feed-text" key={slot.id}><p>{slot.text}</p>{!readOnly ? <FreshButton tone="quiet" onClick={() => onApplyText(request, slot.text ?? "")}>Use these words</FreshButton> : null}</div>;
      if (!version) return <SlotPlaceholder key={slot.id} request={request} slot={slot} onRetry={onRetry} />;
      if (version.kind === "video" || version.kind === "export") return <FeedClip key={slot.id} version={version} access={access} onOpen={() => onOpen(version.id)} />;
      return <FreshButton key={slot.id} tone="quiet" className="vf-feed-picture" data-selected={pictures && request.slots.length > 1 && version.id === target?.id || undefined} aria-label={`Open ${version.label}`} onClick={() => onOpen(version.id)}><MediaThumbnail version={version} access={access} className="vf-feed-media" /></FreshButton>;
    })}</div>
    {target ? <div className="vf-generation-actions" role="group" aria-label="Result actions">
      {verbs.map(verb => <FreshButton key={verb.label} tone="quiet" className="vf-generation-verb" onClick={() => onVerb(verb, target, request)}>{verb.label}</FreshButton>)}
      <span className="vf-flex" />
      {props.onReuseSetup && !readOnly ? <Button type="button" variant="ghost" className="vf-generation-icon" aria-label="Reuse setup" title="Reuse setup" onClick={() => props.onReuseSetup?.(request)}><span className="vf-icon" aria-hidden="true" style={{ maskImage: 'url("/design-assets/fresh-icon-copy.svg")' }} /></Button> : null}
      <Button type="button" variant="ghost" className="vf-generation-icon" aria-label="Download original" title="Download" onClick={() => onDownload(target)}><span className="vf-icon" aria-hidden="true" style={{ maskImage: 'url("/design-assets/fresh-icon-download.svg")' }} /></Button>
      <RequestActions request={request} props={props} />
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
