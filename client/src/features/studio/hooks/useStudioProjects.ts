/**
 * The studio project index's data: list every studio project the creator
 * owns, and delete one.
 *
 * Deliberately does NOT create. "New project" on the index routes to
 * /studio/new, which enters the workspace projectless and lets the first
 * send create the record (useStudioProject's lazy-create path). Creating
 * here instead would leave an empty "Untitled" behind every time a creator
 * opened the composer and changed their mind — the pollution that made
 * saved work look lost in the first place.
 */

import { useCallback, useEffect, useState } from "react";
import { deleteStudioProject, listStudioProjects } from "../api/studioApi";
import type { StudioProject } from "../api/schemas";

export interface UseStudioProjectsReturn {
  projects: StudioProject[];
  loading: boolean;
  error: string | null;
  deleteProject: (projectId: string) => Promise<void>;
  dismissError: () => void;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

export function useStudioProjects(): UseStudioProjectsReturn {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const listed = await listStudioProjects();
        if (cancelled) return;
        setProjects(listed);
      } catch (caught) {
        if (!cancelled) setError(describeError(caught));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const deleteProject = useCallback(async (projectId: string) => {
    // Optimistic removal, restored on failure: the row is gone the instant
    // the creator confirms, and a failed delete puts it back rather than
    // leaving the index disagreeing with the server.
    let previous: StudioProject[] = [];
    setProjects((current) => {
      previous = current;
      return current.filter((project) => project.id !== projectId);
    });
    try {
      await deleteStudioProject(projectId);
    } catch (caught) {
      setProjects(previous);
      setError(describeError(caught));
    }
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  return { projects, loading, error, deleteProject, dismissError };
}
