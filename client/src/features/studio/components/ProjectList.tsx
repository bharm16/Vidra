import React from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import { cn } from "@/utils/cn";
import type { StudioProject } from "../api/schemas";

/** Project switcher overlay, opened from the panel header's menu button. */

interface ProjectListProps {
  projects: StudioProject[];
  activeProjectId: string | null;
  open: boolean;
  onOpenProject: (project: StudioProject) => void;
  onClose: () => void;
}

export function ProjectList({
  projects,
  activeProjectId,
  open,
  onOpenProject,
  onClose,
}: ProjectListProps): React.ReactElement | null {
  if (!open) return null;
  return (
    <div className="st-projects" data-testid="studio-project-list">
      {projects.length === 0 ? (
        <div className="st-projects-empty">No projects yet.</div>
      ) : (
        projects.map((project) => (
          <Button variant="ghost"
            key={project.id}
            type="button"
            className={cn(
              "st-projects-row",
              project.id === activeProjectId && "st-projects-row-active",
            )}
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
        ))
      )}
    </div>
  );
}
