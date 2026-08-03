import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { CaretDown } from "@promptstudio/system/components/ui";
import { Button } from "@promptstudio/system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@promptstudio/system/components/ui/dropdown-menu";
import { Grain } from "@/components/atmosphere";
import { NavRail } from "@components/navigation/NavRail";

import { StudioProjectCard } from "./components/StudioProjectCard";
import { useStudioProjects } from "./hooks/useStudioProjects";
import "./studio.css";

/**
 * Sort orders the roster already carries the fields for.
 *
 * These live in a dropdown, not a segmented track. A segmented control picks
 * between mutually-exclusive *views* — scope, in the reference tool ("Shared
 * with me", "Featured"). Sort order is a setting on whatever view you are
 * already in, and putting it in the track spent the one control that scope
 * will want. Vidra has no sharing, so there is no scope to segment yet and
 * the track is simply absent rather than inert.
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

export function StudioIndexPage(): React.ReactElement {
  const { projects, loading, error, deleteProject, dismissError } =
    useStudioProjects();
  const [sort, setSort] = useState<SortId>("opened");
  const activeSort = SORTS.find((option) => option.id === sort) ?? SORTS[0];

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
        <Grain />

        {/* The same 44px chrome band the project route carries, so opening a
            project does not shift the whole content area down by 44px. The
            page name sits at the control size here, as it does there. */}
        <div className="bg-chrome text-fg text-meta flex h-11 flex-none items-center px-6 font-medium">
          Studio
        </div>

        {/* Controls get their own full-width line at the content origin, with
            an even 24px above and below — the reference tool's rhythm is band,
            controls, grid at one interval. The sort used to sit right-aligned
            on an explanatory sentence, which put it on no origin at all and
            bottom-aligned the two by accident. The sentence went with it:
            onboarding copy that is noise by the third visit. */}
        <header className="flex flex-none items-center gap-2 px-6 pb-6 pt-6">
          <DropdownMenu>
            <DropdownMenuTrigger className="st-sort" aria-label="Sort projects">
              {activeSort.label}
              <CaretDown aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={sort}
                onValueChange={(next) => setSort(next as SortId)}
              >
                {SORTS.map((option) => (
                  <DropdownMenuRadioItem key={option.id} value={option.id}>
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
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
            <div className="st-project-grid">
              {/* The create tile leads the grid — a destination for the
                  creator who came here to start, not to resume. It routes
                  rather than writing: the project is born on the first
                  message, so abandoning the composer leaves nothing behind.

                  Dimensionally it IS a project tile: same thumb ratio, radius
                  and fill, so the row's thumb bottoms and caption baselines
                  are one line. Only the glyph differs — deliberately off the
                  16px icon scale, because it is a target, not an icon. */}
              <Link
                to="/studio/new"
                aria-label="Create new project"
                className="st-project-card flex flex-col"
              >
                <div className="st-card-thumb rounded-card flex aspect-video items-center justify-center overflow-hidden">
                  <Plus size={40} strokeWidth={1.75} className="text-fg-dim" />
                </div>
                <div className="st-card-title truncate">Create new project</div>
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
