import { Button } from "@promptstudio/system/button";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@promptstudio/system/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@promptstudio/system/dropdown-menu";
import { FreshButton, FreshIcon, FreshIconButton } from "@/components/fresh/FreshButton";
import { WorkflowApi } from "@/features/project-workspace/api/workflowApi";
import { ImportControl, type ImportLanding } from "@/features/project-imports/components/ImportControl";
import type { ProjectImportsController } from "@/features/project-imports/hooks/useProjectImports";
import { spring } from "@/components/motion/easing";
import { FlipScope, travel, type FlipChanges } from "@/components/motion/FlipScope";
import { fly, pictureReady } from "@/components/motion/flight";
import { placeGhost } from "@/components/motion/ghost";
import { group, play } from "@/components/motion/play";
import { originOf } from "@/components/motion/surface";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import type { Project } from "@shared/schemas/workflow/project.schemas";
import { MediaCard } from "./components/MediaCard";
import "./media-library.css";

const SHIFT = { duration: 460, easing: spring(0.08) };

/**
 * New media takes slot 0 and every card moves one slot, 20ms apart; a card that leaves its
 * row exits right while its twin enters the next row from the left (frame 2697).
 */
function shiftCards({ moved, entered }: FlipChanges): void {
  moved.forEach(({ node, box, to }, index) => {
    const delay = index * 20;
    if (Math.abs(box.top - to.top) < 4) { travel(node, box, to, { ...SHIFT, delay }); return; }
    const copy = node.cloneNode(true);
    if (node.parentElement && copy instanceof HTMLElement) {
      const ghost = placeGhost(copy, box, node.parentElement, node);
      group([play(ghost, [{ translate: "0px 0px" }, { translate: "60px 0px" }], { delay, duration: 300 }, "both"), play(ghost, [{ opacity: 1 }, { opacity: 0 }], { delay, duration: 220 }, "both")], () => ghost.remove());
    }
    play(node, [{ translate: "-60px 0px" }, { translate: "0px 0px" }], { ...SHIFT, delay: delay + 100, duration: 400 });
    play(node, [{ opacity: 0 }, { opacity: 1 }], { delay: delay + 100, duration: 260 });
  });
  for (const node of entered) play(node, [{ opacity: 0 }, { opacity: 1 }], { delay: 380, duration: 200 });
}

/** The library's type filter: All, Pictures, Clips and Audio (Rule 7). */
function matchesKind(filter: string, kind: MediaVersion["kind"]): boolean {
  if (filter === "picture") return kind === "image";
  if (filter === "clip") return kind === "video" || kind === "export";
  if (filter === "audio") return kind === "audio";
  return true;
}

export function ProjectMediaLibrary({ ownerId, projectId, versions, imports, onChange, onOpen, onEdit, onCreate, readonly = false, loading = false, loadError, onReload, onProjects, onOptions, selectedVersionId, actionBar }: { ownerId: string; projectId: string; versions: MediaVersion[]; imports: ProjectImportsController; onChange(version: MediaVersion): void; onOpen(version: MediaVersion): void; onEdit(version: MediaVersion): void; onCreate(): void; readonly?: boolean; loading?: boolean; loadError?: string | undefined; onReload(): void; onProjects(): void; onOptions(): void; selectedVersionId?: string | undefined; actionBar?: ReactNode }): ReactElement {
  const api = useMemo(() => new WorkflowApi(undefined, ownerId), [ownerId]);
  const access = useCallback((id: string) => api.access(projectId, id), [api, projectId]);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [sort, setSort] = useState("recent");
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string>();
  const [panelId, setPanelId] = useState<string>();
  const [desktop, setDesktop] = useState(() => typeof window !== "undefined" && (window.matchMedia?.("(width >= 768px)")?.matches ?? false));
  useEffect(() => { const query = window.matchMedia?.("(width >= 768px)"); if (!query) return; const update = (): void => setDesktop(query.matches); update(); query.addEventListener("change", update); return () => query.removeEventListener("change", update); }, []);
  const [copy, setCopy] = useState<{ version: MediaVersion; id: string; returnFocus: HTMLButtonElement | null }>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [target, setTarget] = useState("");
  const [copying, setCopying] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);
  // Copying needs another active project; library folders share this media already.
  const [canCopy, setCanCopy] = useState(false);
  useEffect(() => { const abort = new AbortController(); void api.listProjects(abort.signal).then(rows => { if (!abort.signal.aborted) setCanCopy(rows.some(row => row.id !== projectId && row.status === "active")); }).catch(() => undefined); return () => abort.abort(); }, [api, projectId]);
  useEffect(() => { if (!copy) return; const abort = new AbortController(); setProjectsLoading(true); setProjects([]); setTarget(""); void api.listProjects(abort.signal).then(rows => { if (!abort.signal.aborted) { const choices = rows.filter(row => row.id !== projectId && row.status === "active"); setProjects(choices); setTarget(choices[0]?.id ?? ""); } }).catch((failure: unknown) => { if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : "Projects could not load."); }).finally(() => { if (!abort.signal.aborted) setProjectsLoading(false); }); return () => abort.abort(); }, [api, projectId, copy]);
  const rows = versions.filter(version => (hidden || !version.hidden) && matchesKind(kind, version.kind) && version.label.toLocaleLowerCase().includes(search.toLocaleLowerCase())).sort((a, b) => sort === "name" ? a.label.localeCompare(b.label) : sort === "oldest" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt));
  // Desktop progress replaces its own pending card; dismissal restores the same
  // job. Mobile retains the card beneath its sheet. Neither view admits media.
  // A file Vidra refused never becomes media: the import panel says so, and the grid shows no card for it.
  const availableJobs = imports.jobs.filter(job => job.state !== "unsupported" && (!desktop || job.id !== panelId));
  const jobs = availableJobs.filter(job => job.filename.toLocaleLowerCase().includes(search.toLocaleLowerCase()) && (kind === "all" || job.command?.contentType.startsWith(kind === "picture" ? "image/" : kind === "audio" ? "audio/" : "video/")));
  const hasMedia = versions.length > 0 || availableJobs.length > 0;
  const grid = useRef<HTMLDivElement>(null);
  const [landing, setLanding] = useState<ImportLanding>();
  useLayoutEffect(() => {
    if (!landing) return;
    const card = grid.current?.querySelector<HTMLElement>(`[data-version-id="${landing.versionId}"] .vf-card-picture`);
    if (!card) { setLanding(undefined); return; }
    // The upload's picture flies into its card and holds there until the card shows its own.
    const flight = fly(landing.picture, { rect: landing.rect, radius: "6px" }, originOf(card));
    let live = true;
    void flight.motion.finished.then(() => pictureReady(card, 2000)).then(() => { if (live) setLanding(undefined); });
    return () => { live = false; flight.motion.cancel(); flight.remove(); };
  }, [landing]);
  const changeHidden = async (version: MediaVersion): Promise<void> => { try { onChange(await api.hideMedia(projectId, version.id, !version.hidden)); } catch (failure) { setError(failure instanceof Error ? failure.message : "This change was not confirmed."); } };
  const showsActionBar = Boolean(actionBar && selectedVersionId && rows.some(version => version.id === selectedVersionId));
  return <main className="vf-media-library" aria-label="Project Media library" data-action-bar={showsActionBar || undefined}>
    <div className="vf-library-mobile-top"><FreshIconButton icon="folder" label="Open projects" onClick={onProjects} /><FreshIconButton icon="more" label="Project options" onClick={onOptions} /></div><header className="vf-library-heading"><h1>Media</h1><ImportControl imports={imports} selectedId={panelId} onSelect={setPanelId} onLanded={setLanding} disabled={readonly} /></header>
    {error ? <p className="vf-notice" role="alert">{error}</p> : null}{imports.warning ? <p className="vf-notice" role="status">{imports.warning}</p> : null}
    {hasMedia ? <div className="vf-library-controls"><input aria-label="Find media" type="search" placeholder="Search your media" value={search} onChange={event => setSearch(event.target.value)} /><div className="vf-library-filters">
      <DropdownMenu modal={false}><DropdownMenuTrigger asChild><FreshButton className="vf-setting-chip">Filter: {kind === "all" ? "All media" : kind === "picture" ? "Pictures" : kind === "audio" ? "Audio" : "Clips"}<FreshIcon name="down" /></FreshButton></DropdownMenuTrigger><DropdownMenuContent className="vf vf-library-menu" sideOffset={6} align="start"><DropdownMenuRadioGroup value={kind} onValueChange={setKind}><DropdownMenuRadioItem value="all">All media</DropdownMenuRadioItem><DropdownMenuRadioItem value="picture">Pictures</DropdownMenuRadioItem><DropdownMenuRadioItem value="clip">Clips</DropdownMenuRadioItem><DropdownMenuRadioItem value="audio">Audio</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
      <DropdownMenu modal={false}><DropdownMenuTrigger asChild><FreshButton className="vf-setting-chip">Sort: {sort === "recent" ? "Recent first" : sort === "oldest" ? "Oldest first" : "Name"}<FreshIcon name="down" /></FreshButton></DropdownMenuTrigger><DropdownMenuContent className="vf vf-library-menu" sideOffset={6} align="start"><DropdownMenuRadioGroup value={sort} onValueChange={setSort}><DropdownMenuRadioItem value="recent">Recent first</DropdownMenuRadioItem><DropdownMenuRadioItem value="oldest">Oldest first</DropdownMenuRadioItem><DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
      </div><label className="vf-hidden-toggle">Show hidden<input type="checkbox" role="switch" checked={hidden} onChange={event => setHidden(event.target.checked)} /><span aria-hidden="true" /></label></div> : null}
    <FlipScope watch={versions[0]?.id} root={grid} items=":scope > *" onFlip={shiftCards} />
    {showsActionBar ? <div className="vf-media-action-bar" role="toolbar" aria-label="Media actions">{actionBar}</div> : null}
    {loading || loadError ? <div className="vf-library-empty" role="status"><p>{loading ? "Opening your media…" : loadError}</p>{loadError ? <FreshButton onClick={onReload}>Retry loading media</FreshButton> : null}</div> : rows.length || jobs.length ? <div ref={grid} className="vf-library-grid">{jobs.map(job => <article key={job.id} className="vf-media-card"><Button variant="ghost" className="vf-card-picture !h-auto" aria-label={`${job.state === "uploading" ? "Uploading" : "Resume upload"} ${job.filename}`} onClick={() => setPanelId(job.id)}>{job.state === "uploading" ? <span className="vf-card-loader" /> : <span>{job.state === "file-needed" ? "Choose file again" : "Upload interrupted"}</span>}</Button><div className="vf-card-caption"><span>{job.filename}</span></div></article>)}{rows.map(version => <Popover key={version.id} modal={false} open={copy?.version.id === version.id} onOpenChange={open => { if (!open && !copying) setCopy(undefined); }}><PopoverAnchor asChild><div><MediaCard version={version} access={access} selected={copy?.version.id === version.id || selectedVersionId === version.id} readonly={readonly} onOpen={() => onOpen(version)} onEdit={() => onEdit(version)} onCopy={canCopy ? returnFocus => { setError(undefined); setProjectsLoading(true); setCopy({ version, id: `version_${crypto.randomUUID()}`, returnFocus }); } : undefined} onHide={() => { void changeHidden(version); }} /></div></PopoverAnchor>{copy?.version.id === version.id ? <PopoverContent className="vf vf-copy-panel" sideOffset={6} align="end" aria-label="Copy to project" onCloseAutoFocus={event => { const trigger = copy?.returnFocus; if (trigger?.isConnected) { event.preventDefault(); trigger.focus({ preventScroll: true }); } }}><h2>Copy to project</h2><label className="sr-only" htmlFor="media-target-project">Destination project</label><select id="media-target-project" className="vf-copy-field" disabled={copying || projectsLoading} value={target} onChange={event => setTarget(event.target.value)}>{projectsLoading ? <option>Loading projects…</option> : projects.length ? projects.map(project => <option value={project.id} key={project.id}>{project.name}</option>) : <option value="">No other active projects</option>}</select><FreshButton tone="primary" disabled={!target || copying} onClick={() => { setCopying(true); void api.copyMedia(projectId, version.id, target, copy.id).then(() => { setCopy(undefined); }).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : "The copy was not confirmed. Retry to recover the same copy.")).finally(() => setCopying(false)); }}>{copying ? "Copying…" : version.kind === "image" ? "Copy picture" : version.kind === "audio" ? "Copy audio" : "Copy clip"}</FreshButton></PopoverContent> : null}</Popover>)}</div> : <div className="vf-library-empty"><img className="vf-library-empty-icon" src="/design-assets/fidelity-media-empty.svg" alt="" /><h2>{hasMedia ? "No matching media" : "No media yet"}</h2><p>{hasMedia ? "Try another search or clear the current one." : "Import a file or create your first picture or clip."}</p><FreshButton onClick={hasMedia ? () => setSearch("") : onCreate}>{hasMedia ? "Clear search" : "Create something"}</FreshButton></div>}
  </main>;
}
