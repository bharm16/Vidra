import React from "react";
import { Link } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@promptstudio/system/components/ui/dropdown-menu";
import { formatRelativeOrDate } from "@features/history/utils/historyDates";
import type { StudioProject } from "../api/schemas";

interface StudioProjectCardProps {
  project: StudioProject;
  onDelete: (projectId: string) => void;
}

/**
 * One tile on the studio project index: the project's latest image as a
 * cover, its title, and when it was last worked on. The whole tile is the
 * link into the workspace; the overflow menu is layered above it (a button
 * inside a Link would nest interactives, so it sits as a sibling in a
 * positioned wrapper).
 *
 * The menu replaces an arm-then-confirm trash chip. Deleting a project takes
 * its whole thread with it, so it must not read as one click away — but a
 * verb that mutates itself into a second verb is a worse answer than the
 * conventional one: a `…` that opens a menu whose items are labeled. Both
 * clicks stay deliberate and the destructive one is named, not glyphed
 * (UX rule: destructive actions are deliberate and labeled).
 *
 * Timestamps run through the Library's formatter so the two index surfaces
 * cannot drift on how "recently" reads.
 */
export function StudioProjectCard({
  project,
  onDelete,
}: StudioProjectCardProps): React.ReactElement {
  return (
    <div className="st-project-card relative flex flex-col">
      <Link
        to={`/studio/${project.id}`}
        aria-label={`Open studio project: ${project.title}`}
        className="flex flex-col"
      >
        <div className="st-card-thumb rounded-card relative aspect-video overflow-hidden">
          {project.coverUrl ? (
            <img
              src={project.coverUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="st-card-empty flex h-full w-full items-center justify-center">
              No images
            </div>
          )}
        </div>

        <div className="st-card-title truncate">{project.title}</div>
        <div className="st-card-meta">
          {formatRelativeOrDate(new Date(project.updatedAtMs).toISOString())}
        </div>
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger
          className="st-card-menu absolute right-2 top-2"
          aria-label={`Project options: ${project.title}`}
        >
          <MoreHorizontal size={16} strokeWidth={1.75} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onDelete(project.id)}>
            Delete project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
