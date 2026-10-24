import { useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import type { AcceptedRequest } from "@shared/schemas/workflow/request.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import type { CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import { Button } from "@promptstudio/system/button";
import { actionEntry } from "@shared/workflow/actionRegistry";
import { MediaThumbnail } from "@/components/media/MediaThumbnail";
import { slotProgress } from "./RequestResults";
import { requestHistoryDescription } from "../state/requestDescription";

export interface HistoryRailProps {
  requests: AcceptedRequest[];
  media: MediaVersion[];
  profiles: CapabilityProfile[];
  selectedRequestId: string | undefined;
  access(versionId: string): Promise<{ url: string }>;
  onSelect(request: AcceptedRequest): void;
}

function Glyph({ name }: { name: "audio-lines" | "captions" | "sparkles" }): ReactElement {
  return <span className="vf-icon vf-history-glyph" aria-hidden="true" style={{ maskImage: `url("/design-assets/fresh-icon-${name}.svg")` }} />;
}

/** The quick index beside the feed (Rule 2, P1–P5): one item per request, newest last; hovering shows a quick look. */
export function HistoryRail({ requests, media, profiles, selectedRequestId, access, onSelect }: HistoryRailProps): ReactElement {
  const [preview, setPreview] = useState<{ request: AcceptedRequest; top: number; left: number }>();
  return <nav className="vf-history-rail" aria-label="Request history">
    <div className="vf-history-rail-items">{requests.map(request => {
      const entry = actionEntry(request.snapshot.action);
      const version = request.slots.map(slot => slot.versionId ? media.find(candidate => candidate.id === slot.versionId) : undefined).find((candidate): candidate is MediaVersion => candidate !== undefined && candidate.kind !== "audio");
      const running = request.slots.some(slot => slotProgress(slot) === "pending") && !version;
      // A request that made nothing reads as failed (C22's quiet error tile), not as one still to come.
      const failed = !running && !version && request.slots.every(slot => slot.text === undefined) && request.slots.some(slot => slotProgress(slot) === "failed");
      const label = request.snapshot.instructions.trim() || entry.label;
      return <Button key={request.id} type="button" variant="ghost" className="vf-history-item" aria-label={label} aria-current={request.id === selectedRequestId || undefined} onClick={() => { setPreview(undefined); onSelect(request); }} onMouseEnter={event => { const rect = event.currentTarget.getBoundingClientRect(); setPreview({ request, top: rect.top, left: rect.right + 6 }); }} onMouseLeave={() => setPreview(undefined)}>
        {running ? <img className="vf-thumbnail-loader" src="/design-assets/prompt-history/batch-loader.svg" alt="" /> : failed ? <img className="vf-history-glyph" src="/design-assets/prompt-history/batch-failure.svg" alt="" /> : version ? <MediaThumbnail version={version} access={access} className="vf-history-thumbnail" /> : entry.group === "audio" ? <Glyph name="audio-lines" /> : request.snapshot.action === "transcribe" ? <Glyph name="captions" /> : <Glyph name="sparkles" />}
        {entry.group === "picture" && request.slots.length > 1 ? <span className="vf-history-count">{request.slots.length}</span> : null}
      </Button>;
    })}</div>
    {preview ? createPortal(<HistoryPreview request={preview.request} media={media} profiles={profiles} access={access} style={{ top: preview.top, left: preview.left }} />, document.body) : null}
  </nav>;
}

/** P2: the request's result, words and setup, 6px right of its item; nothing open changes. */
function HistoryPreview({ request, media, profiles, access, style }: { request: AcceptedRequest; media: MediaVersion[]; profiles: CapabilityProfile[]; access(versionId: string): Promise<{ url: string }>; style: { top: number; left: number } }): ReactElement {
  const version = request.slots.map(slot => slot.versionId ? media.find(candidate => candidate.id === slot.versionId) : undefined).find((candidate): candidate is MediaVersion => candidate !== undefined && candidate.kind !== "audio");
  return <div className="vf vf-history-preview" role="tooltip" style={style}>
    {version ? <MediaThumbnail version={version} access={access} className="vf-history-preview-media" /> : null}
    {request.snapshot.instructions.trim() ? <p className="vf-history-preview-words">{request.snapshot.instructions}</p> : null}
    <p className="vf-history-preview-setup">{requestHistoryDescription(request, profiles)}</p>
  </div>;
}
