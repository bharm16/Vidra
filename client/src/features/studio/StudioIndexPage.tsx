import React from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@promptstudio/system/components/ui/button";
import { AmbientLight, Grain } from "@/components/atmosphere";
import { NavRail } from "@components/navigation/NavRail";

import { StudioProjectCard } from "./components/StudioProjectCard";
import { useStudioProjects } from "./hooks/useStudioProjects";

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

const GRID_CLASS =
  "grid grid-cols-2 gap-x-5 gap-y-[22px] sm:grid-cols-3 lg:grid-cols-4";

export function StudioIndexPage(): React.ReactElement {
  const { projects, loading, error, deleteProject, dismissError } =
    useStudioProjects();

  return (
    <div className="flex h-screen overflow-hidden">
      <NavRail active="studio" />
      <div className="text-foreground relative isolate flex h-full min-w-0 flex-1 flex-col overflow-hidden [background:var(--background)]">
        <AmbientLight />
        <Grain />

        <header className="flex-none px-9 pb-[18px] pt-[30px]">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-foreground text-heading font-sans font-semibold tracking-[-0.015em]">
              Studio
            </h1>
          </div>
          <p className="text-tool-text-muted text-ui mt-1.5">
            Your image projects — pick up where you left off, or start a new
            one.
          </p>
        </header>

        {error ? (
          <div className="mx-9 mb-3 flex flex-none items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.04] px-4 py-2.5">
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

        <div className="min-h-0 flex-1 overflow-y-auto px-9 pb-10">
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
                <div className="text-tool-text-muted group-hover:text-foreground flex h-[172px] items-center justify-center rounded-md border border-dashed border-white/15 transition-colors group-hover:border-white/35">
                  <Plus size={26} strokeWidth={1.6} />
                </div>
                <div className="text-foreground text-ui mt-2.5 truncate font-sans font-medium">
                  Create new project
                </div>
              </Link>

              {projects.map((project) => (
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
