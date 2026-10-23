import type { ReactElement } from "react";
import type { AcceptedRequest, RequestSlot } from "@shared/schemas/workflow/request.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { FreshButton } from "@/components/fresh/FreshButton";
import { MediaThumbnail } from "./MediaThumbnail";
import { actionEntry } from "@shared/workflow/actionRegistry";
import "./request-results.css";

interface RequestSlotStatusProps {
  request: AcceptedRequest;
  slot: RequestSlot;
  presentation?: "card" | "inline" | "tile";
  onRetry?: ((request: AcceptedRequest, slotId: string) => void) | undefined;
  onInspect?: (() => void) | undefined;
  caption?: string | undefined;
}

/** The visible progress of one slot; cancelled and finished slots have none. */
export function slotProgress(slot: RequestSlot): "failed" | "pending" | "unknown" | undefined {
  if (slot.outcome === "failed" || slot.outcome === "needs-attention" || slot.delivery === "lost" || slot.delivery === "storage-failed" || slot.delivery === "attachment-failed") return "failed";
  if (slot.outcome === "running" || slot.outcome === "queued" || slot.delivery === "storing" || slot.delivery === "stored" || slot.delivery === "attaching") return "pending";
  return slot.outcome === "unknown" ? "unknown" : undefined;
}

/** One slot's visible outcome; storage and attachment mechanics remain internal. */
export function RequestSlotStatus({ request, slot, presentation = "card", onRetry, onInspect, caption }: RequestSlotStatusProps): ReactElement | null {
  const progress = slotProgress(slot);
  const failed = progress === "failed";
  const pending = progress === "pending";
  const unknown = progress === "unknown";
  const entry = actionEntry(request.snapshot.action);
  if (slot.outcome === "cancelled") return <p className="vf-slot-status">{request.slots.length > 1 ? `Result ${slot.ordinal} cancelled` : "Request cancelled"}</p>;
  if (!failed && !pending && !unknown) return null;
  // A made result whose save failed is repaired by reconcile, not remade.
  const unsaved = slot.delivery === "storage-failed" || slot.delivery === "attachment-failed";
  const message = failed ? `Could not ${unsaved ? "save" : "make"} this ${entry.group === "clip" ? "video" : entry.resultNoun}` : unknown ? "Checking this request…" : slot.outcome === "queued" ? "In the queue" : entry.running;
  if (presentation === "tile") {
    const label = `Result ${slot.ordinal}: ${message}`;
    const icon = <img src={`/design-assets/prompt-history/batch-${failed ? "failure" : "loader"}.svg`} width="20" height="20" alt="" />;
    if (onInspect) return <FreshButton className="vf-history-status-tile" tone="quiet" aria-label={`${label}. View request results`} title={slot.error?.message ?? message} onClick={onInspect}>{icon}</FreshButton>;
    return failed && onRetry && request.slots.length === 1 ? <FreshButton className="vf-history-status-tile" tone="quiet" aria-label={`${message}. ${unsaved ? "Retry saving" : "Retry"}`} title={slot.error?.message ?? message} onClick={() => onRetry(request, slot.id)}>{icon}</FreshButton> : <div className="vf-history-status-tile" role="status" aria-label={label} title={slot.error?.message ?? message}>{icon}</div>;
  }
  if (failed && presentation === "inline") return <div className="vf-output-history-failure" role="status"><div><img src="/design-assets/prompt-history/failure-inline.svg" alt="" /><p>{message}</p></div>{slot.error?.message ? <p className="vf-output-failure-reason">{slot.error.message}</p> : null}{onRetry ? <FreshButton className="vf-output-history-retry" aria-label={request.slots.length > 1 ? `${unsaved ? "Retry saving" : "Retry"} result ${slot.ordinal}` : unsaved ? "Retry saving" : "Retry"} onClick={() => onRetry(request, slot.id)}>{unsaved ? "Retry saving" : "Retry"}</FreshButton> : null}</div>;
  return <div className="vf-output-status" data-presentation={presentation} data-failed={failed || undefined} role="status" title={failed ? slot.error?.message : undefined}>
    <div className="vf-output-progress"><img src={`/design-assets/prompt-history/${failed ? "failure" : presentation === "inline" ? "loader-inline" : "loader"}.svg`} alt="" /><p>{message}</p></div>
    {caption ? <p className="vf-output-caption">{caption}</p> : null}
    {failed && onRetry ? <div className="vf-output-retry"><FreshButton className="vf-output-retry-button" aria-label={request.slots.length > 1 ? `${unsaved ? "Retry saving" : "Try again"} result ${slot.ordinal}` : unsaved ? "Retry saving" : "Try again"} onClick={() => onRetry(request, slot.id)}>{unsaved ? "Retry saving" : "Try again"}</FreshButton></div> : null}
  </div>;
}

export interface RequestResultsProps {
  request: AcceptedRequest;
  media: MediaVersion[];
  access(versionId: string): Promise<{ url: string }>;
  onView(versionId: string): void;
  onUseInput?(version: MediaVersion): void;
  onRetry?(request: AcceptedRequest, slotId: string): void;
  heading?: string;
}

/** The unfinished batch keeps its slot order; ready pictures are independently inspectable. */
export function RequestResults({ request, media, access, onView, onUseInput, onRetry, heading = request.snapshot.instructions }: RequestResultsProps): ReactElement {
  const versions = new Map(media.map(version => [version.id, version]));
  return <section className="vf-request-results" aria-label="Request results">
    {heading ? <h2>{heading}</h2> : null}
    <div className="vf-request-results-grid">{request.slots.map(slot => {
      const version = slot.versionId ? versions.get(slot.versionId) : undefined;
      return <div className="vf-batch-slot" key={slot.id} data-slot-id={slot.id}>{version ? <><FreshButton className="vf-batch-preview" tone="quiet" aria-label={`View ${version.label}`} onClick={() => onView(version.id)}><MediaThumbnail version={version} access={access} className="vf-batch-thumbnail" /></FreshButton>{onUseInput ? <FreshButton className="vf-batch-use" onClick={() => onUseInput(version)}>Use {version.kind === "image" ? "image" : "video"} {slot.ordinal}</FreshButton> : null}</> : <RequestSlotStatus request={request} slot={slot} onRetry={onRetry} />}</div>;
    })}</div>
  </section>;
}
