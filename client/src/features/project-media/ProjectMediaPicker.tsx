import { Button } from "@promptstudio/system/button";
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@promptstudio/system/popover";
import { FreshButton, FreshIcon, FreshIconButton } from "@/components/fresh/FreshButton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@promptstudio/system/dropdown-menu";
import { ImportPanel } from "@/features/project-imports/components/ImportPanel";
import type { ProjectImportsController } from "@/features/project-imports/hooks/useProjectImports";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { MediaCard } from "./components/MediaCard";
import "@/features/project-imports/imports.css";
import "./media-library.css";

/** The picker and import status share the same anchor above the composer. */
type PickerKind = "image" | "video" | "audio";
const FILTERS: ReadonlyArray<{ kind: PickerKind | "all"; label: string }> = [{ kind: "all", label: "All" }, { kind: "image", label: "Pictures" }, { kind: "video", label: "Clips" }, { kind: "audio", label: "Audio" }];
const ACCEPT: Record<PickerKind, string> = { image: "image/png,image/jpeg,image/webp", video: "video/mp4,video/webm", audio: "audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/x-m4a" };
const kindOf = (version: MediaVersion): PickerKind => version.kind === "export" ? "video" : version.kind;

/** The picker and import status share the same anchor above the composer. It offers the kinds the input's role takes (S7). */
export function ProjectMediaPicker({ versions, imports, access, onChoose, disabled, onImport, trigger, triggerLabel, selectedVersionId, mediaKinds, requestOpenKey, selectedVersionLabel }: { versions: MediaVersion[]; imports: ProjectImportsController; access(id: string): Promise<{ url: string }>; onChoose(version: MediaVersion): void; disabled: boolean; onImport(id: string, kind: PickerKind): void; trigger?: ReactNode; triggerLabel?: string | undefined; selectedVersionId?: string | undefined; mediaKinds?: readonly PickerKind[] | undefined; requestOpenKey?: string | undefined; selectedVersionLabel?: string | undefined }): ReactElement {
  const [view, setView] = useState<"picker" | "import">();
  const [filter, setFilter] = useState<PickerKind | "all">("all");
  const [query, setQuery] = useState("");
  const [importId, setImportId] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const triggerButton = useRef<HTMLButtonElement>(null);
  const lastOpenRequest = useRef<string>();
  const composer = useRef<HTMLElement | null>(null);
  const reselect = useRef<string>();
  const replaceRejected = useRef<string>();
  const job = imports.jobs.find(candidate => candidate.id === importId);
  const selected = versions.find(version => version.id === selectedVersionId);
  const kinds: readonly PickerKind[] = mediaKinds?.length ? mediaKinds : [selected ? kindOf(selected) : "image"];
  const shown = filter === "all" ? kinds : kinds.filter(kind => kind === filter);
  const noun = kinds.map(kind => kind === "image" ? "pictures" : kind === "video" ? "clips" : "audio").join(" and ");
  const missingSelection = selectedVersionId !== undefined && !selected;
  const filtered = versions.filter(version => !version.hidden && shown.includes(kindOf(version)) && version.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const pending = imports.jobs.filter(candidate => shown.some(kind => candidate.command?.contentType.startsWith(`${kind}/`)) && candidate.filename.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  useEffect(() => { if (view === "import" && importId && !job) setView(undefined); }, [view, importId, job]);
  useEffect(() => {
    if (!requestOpenKey || requestOpenKey === lastOpenRequest.current) return;
    lastOpenRequest.current = requestOpenKey;
    if (disabled) return;
    composer.current = triggerButton.current?.closest<HTMLElement>(".vf-composer") ?? null;
    setView("picker");
  }, [requestOpenKey, disabled]);
  const choose = (version: MediaVersion): void => { onChoose(version); setView(undefined); };
  const chooseFile = (resumeId?: string, rejectedId?: string): void => { reselect.current = resumeId; replaceRejected.current = rejectedId; input.current?.click(); };
  return <Popover modal={false} open={view !== undefined} onOpenChange={open => setView(open ? "picker" : undefined)}>
    <PopoverAnchor virtualRef={composer} />
    <PopoverTrigger asChild>{trigger ? <Button ref={triggerButton} variant="ghost" type="button" className="vf-input-trigger" aria-label="Replace this media input" disabled={disabled} onClick={event => { composer.current = event.currentTarget.closest<HTMLElement>(".vf-composer"); }}>{trigger}</Button> : <Button ref={triggerButton} variant="ghost" type="button" className="vf-picker-reference-trigger !h-auto" aria-label={triggerLabel ?? "Choose a media input"} disabled={disabled} onClick={event => { composer.current = event.currentTarget.closest<HTMLElement>(".vf-composer"); }}><img src="/design-assets/workspace-compact-reference.svg" alt="" /></Button>}</PopoverTrigger>
    <input ref={input} hidden type="file" accept={kinds.map(kind => ACCEPT[kind]).join(",")} aria-label="Choose a project input file" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; if (replaceRejected.current) imports.forgetRejected(replaceRejected.current); void imports.choose(file, reselect.current, id => { setImportId(id); setView("import"); onImport(id, file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "image"); }); }} />
    {view === "import" && job ? createPortal(<Button variant="ghost" className="vf-import-sheet-backdrop" aria-label="Close import overlay" onClick={() => setView(undefined)} />, document.body) : null}
    <PopoverContent className={`vf ${view === "import" ? "vf-import-popover" : "vf-picker"}`} side="top" sideOffset={6} align="start" collisionPadding={12} aria-label={view === "import" ? "Import progress" : "Choose project media"} onOpenAutoFocus={event => { if (view === "import") event.preventDefault(); }}>
      {view === "import" && job ? <><div className="vf-import-sheet-heading"><FreshIconButton icon="close" label="Close import panel" onClick={() => setView(undefined)} /></div><ImportPanel job={job} onCancel={() => { void imports.cancel(job.id).then(done => { if (done) setView(undefined); }); }} onRetry={() => { void imports.retry(job.id); }} onChoose={() => chooseFile(job.state === "file-needed" ? job.id : undefined, job.state === "unsupported" ? job.id : undefined)} /></> : <><div className="vf-picker-heading"><label><img src="/design-assets/fidelity-media-search.svg" alt="" /><input type="search" placeholder={`Search ${noun}`} aria-label="Find project media" value={query} onChange={event => setQuery(event.target.value)} /></label>{kinds.length > 1 ? <DropdownMenu modal={false}><DropdownMenuTrigger asChild><FreshButton tone="quiet" className="vf-picker-filter" aria-label={`Show: ${FILTERS.find(item => item.kind === filter)?.label ?? "All"}`}>{FILTERS.find(item => item.kind === filter)?.label}<FreshIcon name="down" /></FreshButton></DropdownMenuTrigger><DropdownMenuContent className="vf vf-library-menu" sideOffset={6} align="start"><DropdownMenuRadioGroup value={filter} onValueChange={value => setFilter(FILTERS.find(item => item.kind === value)?.kind ?? "all")}>{FILTERS.map(item => <DropdownMenuRadioItem key={item.kind} value={item.kind} disabled={item.kind !== "all" && !kinds.includes(item.kind)}>{item.label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu> : null}<span className="vf-picker-divider" aria-hidden="true" /><FreshButton tone="quiet" onClick={() => chooseFile()}><img src="/design-assets/fidelity-media-upload.svg" alt="" />Upload</FreshButton></div>{missingSelection ? <div className="vf-picker-unavailable" role="status"><img src="/design-assets/fidelity-media-unavailable.svg" alt="" /><p>{selectedVersionLabel ?? (kinds[0] === "video" ? "This clip" : kinds[0] === "audio" ? "This take" : "This picture")} is no longer available</p></div> : null}{filtered.length || pending.length ? <div className="vf-picker-grid">{pending.map(candidate => <Button variant="ghost" className="vf-card-picture !h-auto" key={candidate.id} onClick={() => { setImportId(candidate.id); setView("import"); }} aria-label={`Upload ${candidate.filename}`}><span>{candidate.state === "uploading" ? "Uploading" : "Resume upload"}</span></Button>)}{filtered.map(version => <MediaCard key={version.id} version={version} access={access} onOpen={() => choose(version)} onEdit={() => choose(version)} onCopy={() => undefined} onHide={() => undefined} selected={selectedVersionId === version.id} readonly />)}</div> : <div className="vf-picker-empty" role="status"><p>{query ? `No matching ${noun}` : `No ${noun} yet`}</p>{query ? <FreshButton onClick={() => setQuery("")}>Clear search</FreshButton> : null}</div>}</>}
    </PopoverContent>
  </Popover>;
}
