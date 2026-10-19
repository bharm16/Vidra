import { useRef, useState, type ReactElement } from "react";
import { FreshButton, FreshIconButton } from "@/components/fresh/FreshButton";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import type { VideoComposition } from "@shared/schemas/workflow/video-edit.schemas";
import type { ProjectImportsController } from "@/features/project-imports/hooks/useProjectImports";
import { frameTime } from "../state/editorState";
import { backgroundAudioDescription } from "../state/backgroundAudioDescription";

function startValue(frames: number): string { return frames % 30 === 0 ? frameTime(frames) : `${Math.floor(frames / 1800)}:${((frames % 1800) / 30).toFixed(2).padStart(5,"0")}`; }

/** Stages the current or a replacement Music choice; only Add audio saves it. */
export function BackgroundAudioPanel({ media, imports, duration, disabled, initialAudio, onAdd, onClose }: { media: MediaVersion[]; imports: ProjectImportsController; duration: number; disabled: boolean; initialAudio?: NonNullable<VideoComposition["backgroundAudio"]>; onAdd(version: MediaVersion, startFrame: number, gain: number): void; onClose(): void }): ReactElement {
  const choices = media.filter(version => version.metadata.state === "verified" && (version.kind === "audio" && (!version.hidden || version.id === initialAudio?.versionId) || version.id === initialAudio?.versionId && (version.kind === "video" || version.kind === "export") && version.metadata.audio === "present"));
  const [selectedId, setSelectedId] = useState<string | undefined>(initialAudio?.versionId);
  const selected = selectedId ? choices.find(version => version.id === selectedId) : choices[0];
  const [start, setStart] = useState(initialAudio ? startValue(initialAudio.startFrame) : "0:00"); const [gain, setGain] = useState(String((initialAudio?.gain ?? .35) * 100)); const input = useRef<HTMLInputElement>(null);
  const parts = start.split(":"); const seconds = parts.length === 2 ? Number(parts[0]) * 60 + Number(parts[1]) : Number(start);
  const startFrame = Math.round(seconds * 30); const level = Number(gain) / 100;
  const valid = Number.isFinite(startFrame) && startFrame >= 0 && startFrame < duration && Number.isFinite(level) && level >= 0 && level <= 4;
  return <aside className="ve-background-picker" aria-label="Background audio"><header><h2>Background audio</h2><FreshIconButton icon="close" label="Close background audio" onClick={onClose} /></header>
    <div className="ve-audio-choices">{choices.map(version => <FreshButton key={version.id} tone="quiet" className="ve-audio-choice" aria-pressed={selected?.id === version.id} onClick={() => setSelectedId(version.id)}><span className="ve-audio-choice-title"><img src="/design-assets/fidelity-editor-track-music.svg" alt="" /><span className="ve-audio-choice-name">{version.label}</span>{selected?.id === version.id ? <img className="ve-audio-choice-check" src="/design-assets/fidelity-editor-caption-check.svg" alt="" /> : null}</span><span className="ve-audio-choice-wave" aria-hidden="true" /><span className="ve-audio-choice-detail">{version.metadata.state === "verified" ? backgroundAudioDescription(version.kind, version.metadata.contentType, version.metadata.durationSeconds) : backgroundAudioDescription(version.kind)}</span></FreshButton>)}</div>
    {!choices.length ? <FreshButton disabled={disabled} onClick={() => input.current?.click()}>Choose an audio file</FreshButton> : null}
    <input ref={input} hidden type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/x-wav,audio/x-m4a,audio/opus" aria-label="Choose background audio file" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void imports.choose(file, undefined, () => undefined); }} />
    {imports.jobs.filter(job => job.command?.contentType.startsWith("audio/")).map(job => <p key={job.id} role="status">{job.filename} · {job.state === "uploading" ? "Uploading" : job.state === "file-needed" ? "Choose file again" : "Upload interrupted"}</p>)}
    <label className="ve-audio-option"><span>Start in video</span><input aria-label="Background audio start" value={start} disabled={disabled} onChange={event => setStart(event.target.value)} /></label>
    <label className="ve-audio-option"><span>Volume</span><span className="ve-audio-percent"><input aria-label="Background audio volume percent" inputMode="decimal" value={gain} disabled={disabled} onChange={event => setGain(event.target.value)} /><span>%</span></span></label>
    <FreshButton tone="primary" disabled={disabled || !selected || !valid} onClick={() => { if (selected && valid) onAdd(selected,startFrame,level); }}>Add audio</FreshButton><FreshButton tone="quiet" onClick={onClose}>Cancel</FreshButton>
  </aside>;
}
