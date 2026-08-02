import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { Button } from "@promptstudio/system/components/ui/button";
import { formatRelativeOrDate } from "@features/history/utils/historyDates";
import { cn } from "@/utils/cn";
import type { StudioProject } from "../api/schemas";

interface StudioProjectCardProps {
  project: StudioProject;
  onDelete: (projectId: string) => void;
}

/**
 * One tile on the studio project index: the project's latest image as a
 * cover, its title, and when it was last worked on. The whole tile is the
 * link into the workspace; delete is a hover-revealed control layered above
 * it (a button inside a Link would nest interactives, so it sits as a
 * sibling in a positioned wrapper).
 *
 * Timestamps run through the Library's formatter so the two index surfaces
 * cannot drift on how "recently" reads.
 */
export function StudioProjectCard({
  project,
  onDelete,
}: StudioProjectCardProps): React.ReactElement {
  // Two-step delete, carried over from the project overlay this card
  // replaces (UX rule: destructive actions are deliberate and labeled).
  const [armed, setArmed] = useState(false);

  return (
    <div
      className="group relative flex flex-col"
      onPointerLeave={() => setArmed(false)}
    >
      <Link
        to={`/studio/${project.id}`}
        aria-label={`Open studio project: ${project.title}`}
        className="flex flex-col"
      >
        <div className="bg-chrome group-hover:bg-float relative aspect-video overflow-hidden rounded-card transition-colors">
          {project.coverUrl ? (
            <img
              src={project.coverUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="text-float text-heading flex h-full w-full items-center justify-center font-semibold">
              No images
            </div>
          )}
        </div>

        <div className="text-foreground text-ui mt-2.5 truncate font-sans font-medium">
          {project.title}
        </div>
        <div className="text-tool-text-muted text-meta mt-0.5">
          {formatRelativeOrDate(new Date(project.updatedAtMs).toISOString())}
        </div>
      </Link>

      <Button
        type="button"
        variant="ghost"
        aria-label={
          armed ? `Confirm delete ${project.title}` : `Delete ${project.title}`
        }
        onClick={() => {
          if (armed) {
            setArmed(false);
            onDelete(project.id);
          } else {
            setArmed(true);
          }
        }}
        className={cn(
          "ps-btn ps-btn--rect text-fg absolute right-2 top-2 !h-7 !w-7 bg-white/10 p-0 opacity-0 transition-opacity hover:bg-white/[0.16] focus-visible:opacity-100 group-hover:opacity-100",
          armed && "w-auto px-2 opacity-100",
        )}
      >
        {armed ? "Delete?" : <Trash2 size={16} strokeWidth={1.75} />}
      </Button>
    </div>
  );
}
