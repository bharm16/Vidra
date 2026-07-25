import React, { useState } from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import { Trash2 } from "lucide-react";
import { cn } from "@/utils/cn";
import type { StudioProject } from "../api/schemas";

/** Project switcher overlay, opened from the panel header's menu button. */

interface ProjectListProps {
  projects: StudioProject[];
  activeProjectId: string | null;
  open: boolean;
  onOpenProject: (project: StudioProject) => void;
  onDeleteProject: (projectId: string) => void;
  onClose: () => void;
}

export function ProjectList({
  projects,
  activeProjectId,
  open,
  onOpenProject,
  onDeleteProject,
  onClose,
}: ProjectListProps): React.ReactElement | null {
  // Two-step delete (UX rule: destructive actions are deliberate and
  // labeled): first click arms the row ("Delete?"), second click confirms.
  const [armedId, setArmedId] = useState<string | null>(null);

  if (!open) return null;
  return (
    <div className="st-projects" data-testid="studio-project-list">
      {projects.length === 0 ? (
        <div className="st-projects-empty">No projects yet.</div>
      ) : (
        projects.map((project) => (
          <div
            key={project.id}
            className={cn(
              "st-projects-row",
              project.id === activeProjectId && "st-projects-row-active",
            )}
            onPointerLeave={() =>
              setArmedId((current) => (current === project.id ? null : current))
            }
          >
            <Button
              variant="ghost"
              type="button"
              className="st-projects-open"
              onClick={() => {
                onOpenProject(project);
                onClose();
              }}
            >
              <span className="st-projects-title">{project.title}</span>
              <span className="st-projects-date">
                {new Date(project.updatedAtMs).toLocaleDateString()}
              </span>
            </Button>
            <Button
              variant="ghost"
              type="button"
              className={cn(
                "st-projects-delete",
                armedId === project.id && "st-projects-delete-armed",
              )}
              aria-label={
                armedId === project.id
                  ? `Confirm delete ${project.title}`
                  : `Delete ${project.title}`
              }
              onClick={() => {
                if (armedId === project.id) {
                  setArmedId(null);
                  onDeleteProject(project.id);
                } else {
                  setArmedId(project.id);
                }
              }}
            >
              {armedId === project.id ? (
                "Delete?"
              ) : (
                <Trash2 size={13} strokeWidth={1.8} />
              )}
            </Button>
          </div>
        ))
      )}
    </div>
  );
}
