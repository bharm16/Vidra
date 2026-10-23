import { useCallback, useEffect, useLayoutEffect, useRef, type ReactElement } from "react";
import type { AcceptedRequest } from "@shared/schemas/workflow/request.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import type { SubmissionCheckpoint } from "@/repositories/workflow/DraftCheckpointStore";
import { FreshButton, FreshIconButton } from "@/components/fresh/FreshButton";
import { Button } from "@promptstudio/system/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@promptstudio/system/dropdown-menu";
import { MediaThumbnail } from "./MediaThumbnail";
import { RequestSlotStatus, slotProgress } from "./RequestResults";
import "./history-fidelity.css";

export interface ConversationHistoryProps {
  requests: AcceptedRequest[];
  media: MediaVersion[];
  selected: string | undefined;
  pending: SubmissionCheckpoint[];
  onView(versionId: string): void;
  onRecover(submission: SubmissionCheckpoint): void;
  access(versionId: string): Promise<{ url: string }>;
  onRetry?(request: AcceptedRequest, slotId: string): void;
  onCancel?(request: AcceptedRequest): void;
  onReuseSetup?(request: AcceptedRequest): void;
  onNewVariation?(request: AcceptedRequest): void;
  onUseWords?(request: AcceptedRequest): void;
  onViewSources?(request: AcceptedRequest): void;
  onViewVersions?(request: AcceptedRequest): void;
  onHideFromMedia?(request: AcceptedRequest): void;
  onApplyText?(request: AcceptedRequest, text: string): void;
  describeRequest?(request: AcceptedRequest): string;
  newlyReadyVersionId?: string | undefined;
  readOnly?: boolean;
  readOnlyReason?: string;
  onInspectRequest?(request: AcceptedRequest): void;
}

interface RequestAction {
  label: string;
  icon: string;
  action: ((request: AcceptedRequest) => void) | undefined;
  disabledReason?: string | undefined;
}

function isImageRequest(request: AcceptedRequest): boolean {
  return ["make-image", "edit-image", "upscale-image"].includes(request.snapshot.action);
}

function isImageBatch(request: AcceptedRequest): boolean {
  return request.slots.length > 1 && isImageRequest(request);
}

function hasPendingWork(request: AcceptedRequest): boolean {
  return request.slots.some(slot => ["queued", "running", "unknown"].includes(slot.outcome) || ["storing", "stored", "attaching"].includes(slot.delivery));
}

function isMobileClip(node: HTMLElement): boolean {
  return getComputedStyle(node).getPropertyValue("--vf-history-end-spacing").trim() !== "";
}

export function RequestActions({ request, props, overflow = [] }: { request: AcceptedRequest; props: Pick<ConversationHistoryProps, "media" | "readOnly" | "readOnlyReason" | "onReuseSetup" | "onNewVariation" | "onUseWords" | "onViewSources" | "onViewVersions" | "onHideFromMedia">; overflow?: ReadonlyArray<{ label: string; disabled?: boolean | undefined; run(): void }> }): ReactElement | null {
  const hasResults = request.slots.some(slot => slot.versionId && props.media.some(version => version.id === slot.versionId));
  const hasSources = request.snapshot.inputs.some(input => input.state === "resolved");
  const readOnlyReason = props.readOnly ? props.readOnlyReason ?? "Current work is read-only." : undefined;
  const actions: RequestAction[] = [
    { label: "Reuse setup", icon: "reuse", action: props.onReuseSetup, disabledReason: readOnlyReason },
    { label: "New variation", icon: "variation", action: props.onNewVariation, disabledReason: readOnlyReason },
    { label: "Use words", icon: "words", action: props.onUseWords, disabledReason: readOnlyReason },
    { label: "View sources", icon: "sources", action: props.onViewSources, disabledReason: hasSources ? undefined : "No source inputs were used for this request." },
    { label: "View versions", icon: "versions", action: props.onViewVersions, disabledReason: hasResults ? undefined : "No results are available for this request." },
    { label: "Hide from media", icon: "hide", action: props.onHideFromMedia, disabledReason: readOnlyReason ?? (hasResults ? undefined : "No results are available for this request.") },
  ];
  if (!actions.some(item => item.action) && !overflow.length) return null;
  return <DropdownMenu><DropdownMenuTrigger asChild><FreshIconButton className="vf-history-request-actions" icon="more" label="Request actions" /></DropdownMenuTrigger><DropdownMenuContent className="vf vf-history-actions-menu" align="start" sideOffset={6} collisionPadding={8} aria-label="Request actions">{overflow.map(item => <DropdownMenuItem className="vf-history-action" key={`verb:${item.label}`} disabled={Boolean(item.disabled)} onSelect={item.run}><span>{item.label}</span></DropdownMenuItem>)}{actions.filter(item => item.action).map(item => <DropdownMenuItem className="vf-history-action" key={item.label} disabled={Boolean(item.disabledReason)} title={item.disabledReason} onSelect={() => { if (!item.disabledReason) item.action?.(request); }}><img src={`/design-assets/prompt-history/${item.icon}.svg`} alt="" /><span>{item.label}</span></DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>;
}

/** Requests keep their acceptance order and exact slot identities during partial completion. */
export function ConversationHistory(props: ConversationHistoryProps): ReactElement {
  const { requests, media, selected, pending, onView, onRecover, access, onRetry, onApplyText, describeRequest, newlyReadyVersionId, onInspectRequest } = props;
  const viewport = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const scrollGeometry = useRef<{ height: number; viewport: number; clip: boolean; atEnd: boolean; position: number }>();
  const followEnd = useCallback((node: HTMLElement): void => {
    node.scrollTop = node.scrollHeight;
    scrollGeometry.current = { height: node.scrollHeight, viewport: node.clientHeight, clip: isMobileClip(node), atEnd: true, position: node.scrollTop };
  }, []);
  const last = requests.at(-1);
  const progressKey = `${last?.id ?? ""}:${last?.slots.map(slot => `${slot.outcome}:${slot.delivery}:${slot.versionId ?? ""}`).join(",") ?? ""}:${pending.length}`;
  useEffect(() => { const node = viewport.current; if (node && following.current) followEnd(node); }, [progressKey, followEnd]);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    // Pictures load after the first layout; a history resting at its end keeps the newest request in view as they grow.
    const settle = (): void => { if (following.current && (isMobileClip(node) || scrollGeometry.current?.atEnd)) followEnd(node); };
    const observer = new ResizeObserver(settle);
    observer.observe(node);
    for (const child of node.children) observer.observe(child);
    settle();
    return () => observer.disconnect();
  }, [requests.length, pending.length, followEnd]);
  const versions = new Map<string, MediaVersion>(media.map(version => [version.id, version]));
  const hasPriorMedia = requests.some(request => request.slots.some(slot => slot.versionId && versions.has(slot.versionId)));
  return <div ref={viewport} className="vf-history vf-history-fidelity" aria-label="Conversation history" onScroll={event => {
    const node = event.currentTarget;
    const clip = isMobileClip(node);
    const previous = scrollGeometry.current;
    const resized = previous !== undefined && (previous.height !== node.scrollHeight || previous.viewport !== node.clientHeight);
    // Native resize clamping is not a deliberate return to the latest request.
    const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
    // The scroll that following itself caused can arrive after more content (or a taller composer) changed the size;
    // a history that has not moved is still resting at its end.
    const unmoved = previous?.atEnd === true && node.scrollTop === previous.position;
    if (!unmoved && !(resized && (clip || previous?.clip))) following.current = clip ? remaining <= 1 : remaining < 80;
    scrollGeometry.current = { height: node.scrollHeight, viewport: node.clientHeight, clip, atEnd: unmoved || remaining <= 1 && (!resized || previous.atEnd), position: node.scrollTop };
  }} onKeyDown={event => {
    if (event.key === "End" && !event.altKey && !event.ctrlKey && !event.metaKey && isMobileClip(event.currentTarget)) { following.current = true; followEnd(event.currentTarget); }
  }}>
    {requests.map(request => {
      // C07/C31: a later picture runs as a quiet spinner tile; W09/W53: a later clip runs as status with its words as caption.
      const running = hasPriorMedia && request.slots.length === 1 && request.slots.every(slot => !slot.versionId && slotProgress(slot) === "pending");
      const runningClip = running && !isImageRequest(request);
      // C22: a later picture that failed is a quiet error tile; the tile still retries.
      const failedPicture = hasPriorMedia && request.slots.length === 1 && isImageRequest(request) && request.slots.every(slot => !slot.versionId && slotProgress(slot) === "failed");
      return <article id={`vf-request-${request.id}`} className="vf-history-request" data-running-clip={runningClip || undefined} key={request.id}>{!runningClip ? <div className="vf-message"><RequestActions request={request} props={props} />{onInspectRequest && request.slots.length > 1 ? <Button type="button" variant="ghost" className="vf-request-words vf-request-inspect !h-auto" aria-label="View request results" onClick={() => onInspectRequest(request)}>{request.snapshot.instructions}</Button> : <p className="vf-request-words">{request.snapshot.instructions}</p>}</div> : null}{requests.length === 1 && request.slots.length === 1 && describeRequest ? <p className="vf-history-request-summary">{describeRequest(request)}</p> : null}<div className="vf-history-results" data-batch={isImageBatch(request) || undefined}>{request.slots.map(slot => {
      const version = slot.versionId ? versions.get(slot.versionId) : undefined;
      const showSelection = version !== undefined && version.id === selected && (version.kind === "video" || version.kind === "export" || (isImageBatch(request) && hasPendingWork(request)));
      return <div className="vf-result-slot" key={slot.id} data-slot-id={slot.id}>{slot.text !== undefined && slot.outcome === "completed" ? <div className="vf-text-answer"><p>{slot.text}</p>{onApplyText ? <FreshButton tone="quiet" onClick={() => onApplyText(request, slot.text ?? "")}>Use these words</FreshButton> : null}</div> : version ? <FreshButton tone="quiet" className="vf-result-card focus-visible:!outline" data-selected={showSelection || undefined} aria-label={`View ${version.label}`} aria-pressed={version.id === selected} onClick={() => onView(version.id)}><MediaThumbnail version={version} access={access} className="vf-result-thumbnail" /></FreshButton> : <RequestSlotStatus request={request} slot={slot} presentation={isImageBatch(request) || running && !runningClip || failedPicture ? "tile" : hasPriorMedia ? "inline" : "card"} onInspect={onInspectRequest && isImageBatch(request) ? () => onInspectRequest(request) : undefined} onRetry={onRetry} caption={runningClip ? request.snapshot.instructions : undefined} />}</div>;
    })}</div>{newlyReadyVersionId && versions.has(newlyReadyVersionId) && request.slots.some(slot => slot.versionId === newlyReadyVersionId && slot.outcome === "completed" && slot.delivery === "ready") ? <div className="vf-history-completion" role="status"><div><img src="/design-assets/prompt-history/ready.svg" alt="" /><p>{selected === newlyReadyVersionId ? "Ready" : "New version ready"}</p></div>{selected !== newlyReadyVersionId ? <FreshButton className="vf-history-view-result" onClick={() => onView(newlyReadyVersionId)}>View result</FreshButton> : null}</div> : null}</article>;
    })}
    {pending.filter(item => !requests.some(request => request.executionDraftId === item.command.draftId && request.executionDraftRevision === item.command.draftRevision)).map(submission => <article className="vf-unknown-submission" key={submission.submissionId}><p>Checking submission…</p><FreshButton tone="quiet" onClick={() => onRecover(submission)}>Check again</FreshButton></article>)}
  </div>;
}
