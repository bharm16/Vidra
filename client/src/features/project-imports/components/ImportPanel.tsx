import { forwardRef, type ReactElement } from "react";
import { FreshButton, FreshIcon } from "@/components/fresh/FreshButton";
import { ProgressRing } from "@/components/motion/ProgressRing";
import type { ImportJob } from "../hooks/useProjectImports";

/** Pure upload presentation, reusable beside a library, composer or future editor. The ring traces the upload (frame 2697). */
export const ImportPanel = forwardRef<HTMLDivElement, { job: ImportJob; onCancel(): void; onRetry(): void; onChoose(): void }>(function ImportPanel({ job, onCancel, onRetry, onChoose }, ref): ReactElement {
  const title = job.state === "uploading" ? `Uploading · ${job.progress}%` : job.state === "failed" ? "Upload interrupted" : job.state === "unsupported" ? "This file isn't supported" : `Choose ${job.filename} again`;
  return <div ref={ref} className="vf-import-panel" data-state={job.state} aria-label="Import panel">
    <div className="vf-import-header"><div className="m-thumb"><div className="vf-import-preview">{job.command?.contentType.startsWith("audio/") ? <FreshIcon name="volume" /> : job.preview ? job.command?.contentType.startsWith("video/") ? <video src={job.preview} muted playsInline preload="metadata" onLoadedMetadata={event => { const video = event.currentTarget; if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.min(1 / 30, video.duration / 2); }} /> : <img src={job.preview} alt="" onError={event => { event.currentTarget.hidden = true; }} /> : <FreshIcon name="media" />}</div><ProgressRing value={job.progress / 100} active={job.state === "uploading"} label="Upload progress" /></div><div className="vf-import-text"><p role="status" className={job.state === "failed" || job.state === "unsupported" ? "vf-import-danger" : undefined}>{title}</p>{job.state === "unsupported" || job.state === "failed" ? <p className="vf-import-filename">{job.filename}</p> : null}{job.state !== "uploading" && job.reason ? <div className="vf-import-status"><p className="vf-import-reason">{job.reason}</p></div> : null}</div></div>
    <div>{job.state === "uploading" ? <FreshButton onClick={onCancel}>Cancel upload</FreshButton> : job.state === "failed" ? <FreshButton tone="primary" onClick={onRetry}>Retry upload</FreshButton> : <FreshButton tone="primary" onClick={onChoose}>{job.state === "unsupported" ? "Choose another file" : "Choose file"}</FreshButton>}</div>
  </div>;
});
