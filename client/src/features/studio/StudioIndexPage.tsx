import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@promptstudio/system/components/ui/button";
import { AmbientLight, Grain } from "@/components/atmosphere";
import { NavRail } from "@components/navigation/NavRail";

import { StudioProjectCard } from "./components/StudioProjectCard";
import { useStudioProjects } from "./hooks/useStudioProjects";
import "./studio.css";

/**
 * Sort orders the roster already carries the fields for. There is no
 * segmented filter ("Shared with me", "Featured") because sharing does not
 * exist yet — an inert control would be worse than none.
 */
const SORTS = [
  { id: "opened", label: "Last opened" },
  { id: "created", label: "Newest" },
  { id: "name", label: "Name" },
] as const;

type SortId = (typeof SORTS)[number]["id"];

/**
 * The studio project index — what the Studio rail destination shows.
 *
 * Every studio project the creator owns, newest first, each a door into its
 * own workspace URL (/studio/:projectId). This surface exists because the
 * rail destination used to open whichever project sorted first and hide the
 * rest behind an unlabeled icon: an abandoned "New project" click would sit
 * at the top of that sort forever, so returning to Studio showed an empty
 * thread and the creator's real work looked lost. Listing is the fix — the
 * destination now answers "here is your work", never "here is one project".
 *
 * Anatomy follows the Library (ADR-0008, one design language across shells):
 * rail, handoff atmosphere, header, card grid.
 */

/* Reflows instead of stepping through fixed breakpoints — the grid was four
   335px columns, so it neither filled a wide window nor collapsed gracefully.
   One gap value on the scale, not 22x20. */
const GRID_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6";

export function StudioIndexPage(): React.ReactElement {
  const { projects, loading, error, deleteProject, dismissError } =
    useStudioProjects();
  const [sort, setSort] = useState<SortId>("opened");

  const sorted = useMemo(() => {
    const copy = [...projects];
    if (sort === "name") {
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    }
    const key = sort === "created" ? "createdAtMs" : "updatedAtMs";
    return copy.sort((a, b) => b[key] - a[key]);
  }, [projects, sort]);

  return (
    <div className="flex h-screen overflow-hidden">
      <NavRail active="studio" />
      <div className="text-foreground bg-canvas relative isolate flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <AmbientLight />
        <Grain />

        {/* The same 44px chrome band the project route carries, so opening a
            project does not shift the whole content area down by 44px. The
            page name sits at the control size here, as it does there. */}
        <div className="bg-chrome text-fg text-meta flex h-11 flex-none items-center px-6 font-medium">
          Studio
        </div>

        <header className="flex flex-none items-end justify-between gap-4 px-6 pb-4 pt-6">
          <p className="text-tool-text-muted text-ui">
            Your image projects — pick up where you left off, or start a new
            one.
          </p>
          <div className="st-segment" role="group" aria-label="Sort projects">
            {SORTS.map((option) => (
              <Button
                key={option.id}
                type="button"
                variant="ghost"
                className="st-segment-item"
                data-active={sort === option.id}
                aria-pressed={sort === option.id}
                onClick={() => setSort(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </header>

        {error ? (
          <div className="border-border bg-raise mx-6 mb-3 flex flex-none items-center justify-between gap-3 rounded-md border px-4 py-2.5">
            <span className="text-ui text-foreground">{error}</span>
            <Button
              type="button"
              variant="ghost"
              onClick={dismissError}
              className="text-tool-text-muted text-meta hover:text-foreground"
            >
              Dismiss
            </Button>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          {loading ? (
            <p className="text-tool-text-muted text-ui">Loading projects…</p>
          ) : (
            <div className={GRID_CLASS}>
              {/* The create tile leads the grid — a destination for the
                  creator who came here to start, not to resume. It routes
                  rather than writing: the project is born on the first
                  message, so abandoning the composer leaves nothing behind. */}
              <Link
                to="/studio/new"
                aria-label="Create new project"
                className="group flex flex-col"
              >
                <div className="text-tool-text-muted group-hover:text-foreground border-border group-hover:border-border-strong bg-chrome rounded-panel flex h-[172px] items-center justify-center border transition-colors">
                  <Plus size={16} strokeWidth={1.75} />
                </div>
                <div className="text-foreground text-ui mt-2.5 truncate font-sans font-medium">
                  Create new project
                </div>
              </Link>

              {sorted.map((project) => (
                <StudioProjectCard
                  key={project.id}
                  project={project}
                  onDelete={(projectId) => void deleteProject(projectId)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default StudioIndexPage;
