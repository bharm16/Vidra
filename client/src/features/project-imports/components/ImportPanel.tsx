import type { ReactElement } from "react";
import { FreshButton, FreshIcon } from "@/components/fresh/FreshButton";
import type { ImportJob } from "../hooks/useProjectImports";

/** Pure upload presentation, reusable beside a library, composer or future editor. */
export function ImportPanel({ job, onCancel, onRetry, onChoose }: { job: ImportJob; onCancel(): void; onRetry(): void; onChoose(): void }): ReactElement {
  const title = job.state === "uploading" ? `Uploading · ${job.progress}%` : job.state === "failed" ? "Upload interrupted" : job.state === "unsupported" ? "This file isn't supported" : `Choose ${job.filename} again`;
  return <div className="vf-import-panel" data-state={job.state} aria-label="Import panel">
    <div className="vf-import-header"><div className="vf-import-preview">{job.command?.contentType.startsWith("audio/") ? <FreshIcon name="volume" /> : job.preview ? job.command?.contentType.startsWith("video/") ? <video src={job.preview} muted playsInline preload="metadata" onLoadedMetadata={event => { const video = event.currentTarget; if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.min(1 / 30, video.duration / 2); }} /> : <img src={job.preview} alt="" onError={event => { event.currentTarget.hidden = true; }} /> : null}</div><div className="vf-import-text"><p role="status" className={job.state === "failed" || job.state === "unsupported" ? "vf-import-danger" : undefined}>{title}</p><div className="vf-import-status">{job.state === "uploading" ? <progress aria-label="Upload progress" max={100} value={job.progress} /> : job.reason ? <p className="vf-import-reason">{job.reason}</p> : null}</div></div></div>
    <div>{job.state === "uploading" ? <FreshButton onClick={onCancel}>Cancel upload</FreshButton> : job.state === "failed" ? <FreshButton tone="primary" onClick={onRetry}>Retry upload</FreshButton> : <FreshButton tone="primary" onClick={onChoose}>{job.state === "unsupported" ? "Choose another file" : "Choose file"}</FreshButton>}</div>
  </div>;
}
