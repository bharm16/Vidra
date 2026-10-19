import { useEffect, useMemo, useRef, useState } from "react";
import type { Folder, Project } from "@shared/schemas/workflow/project.schemas";
import { getAuthRepository } from "@/repositories/index";
import { ProjectManagementApi } from "../api/projectManagementApi";
import {
  readProjectCreationIntent,
  keepProjectCreationIntent,
  clearProjectCreationIntent,
  type ProjectCreationIntent,
} from "../state/projectCreationIntent";

/** New projects are folders for library work; earlier projects keep their own saved history. */
export type ProjectEntry =
  | {
      kind: "folder";
      id: string;
      name: string;
      status: "active" | "trashed";
      updatedAt: string;
      record: Folder;
    }
  | {
      kind: "project";
      id: string;
      name: string;
      status: "active" | "trashed";
      updatedAt: string;
      record: Project;
    };

function entries(folders: Folder[], projects: Project[]): ProjectEntry[] {
  return [
    ...folders.map((record) => ({
      kind: "folder" as const,
      id: record.id,
      name: record.name,
      status: record.status,
      updatedAt: record.updatedAt,
      record,
    })),
    ...projects.map((record) => ({
      kind: "project" as const,
      id: record.id,
      name: record.name,
      status: record.status,
      updatedAt: record.updatedAt,
      record,
    })),
  ].sort(
    (a, b) =>
      b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
  );
}

export function useProjectBrowser(
  ownerId: string,
  onCreated: (folderId: string) => void,
): {
  projects: ProjectEntry[];
  loading: boolean;
  error: string | undefined;
  creating: boolean;
  pending: ProjectCreationIntent | undefined;
  restoreBusy: string | undefined;
  reload: () => void;
  create: (name: string) => Promise<void>;
  restore: (entry: ProjectEntry) => Promise<void>;
} {
  const api = useMemo(() => new ProjectManagementApi(ownerId), [ownerId]);
  const [loaded, setLoaded] = useState<{
    ownerId: string;
    projects: ProjectEntry[];
    loading: boolean;
    error?: string;
  }>();
  const [intent, setIntent] = useState<ProjectCreationIntent>();
  const [creating, setCreating] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const scope = useRef(ownerId);
  scope.current = ownerId;
  const mounted = useRef(true);
  const locked = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    locked.current = false;
    setCreating(false);
    setRestoreBusy(undefined);
    setIntent(undefined);
    setLoaded({ ownerId, projects: [], loading: true });
    try {
      setIntent(readProjectCreationIntent(ownerId));
    } catch {
      setLoaded({
        ownerId,
        projects: [],
        loading: false,
        error:
          "Your pending project request could not be read. Keep this browser tab and check your projects before creating another.",
      });
    }
    void Promise.all([
      api.listFolders(abort.signal),
      api.listProjects(abort.signal),
    ])
      .then(([folders, projects]) => {
        if (!abort.signal.aborted)
          setLoaded({
            ownerId,
            projects: entries(folders, projects),
            loading: false,
          });
      })
      .catch((failure: unknown) => {
        if (!abort.signal.aborted)
          setLoaded({
            ownerId,
            projects: [],
            loading: false,
            error:
              failure instanceof Error
                ? failure.message
                : "Your projects could not load.",
          });
      });
    return () => abort.abort();
  }, [ownerId, api, attempt]);
  const active = (): boolean =>
    mounted.current &&
    scope.current === ownerId &&
    getAuthRepository().getCurrentUser()?.uid === ownerId;
  const report = (message: string): void =>
    setLoaded((current) => ({
      ownerId,
      projects: current?.ownerId === ownerId ? current.projects : [],
      loading: false,
      error: message,
    }));
  const replace = (entry: ProjectEntry): void =>
    setLoaded((current) => ({
      ownerId,
      projects: [
        entry,
        ...(current?.ownerId === ownerId
          ? current.projects.filter((row) => row.id !== entry.id)
          : []),
      ].sort(
        (a, b) =>
          b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
      ),
      loading: false,
    }));
  const create = async (name: string): Promise<void> => {
    if (locked.current) return;
    locked.current = true;
    setCreating(true);
    try {
      const captured = keepProjectCreationIntent(ownerId, name);
      setIntent(captured);
      const folder = await api.createFolder(captured.folderId, captured.name);
      if (!active()) return;
      clearProjectCreationIntent(ownerId, folder.id);
      setIntent(undefined);
      replace(entries([folder], [])[0]!);
      onCreated(folder.id);
    } catch (failure) {
      if (active())
        report(
          failure instanceof Error
            ? failure.message
            : "Creating this project was not confirmed. Try the same request again.",
        );
    } finally {
      if (active()) {
        locked.current = false;
        setCreating(false);
      }
    }
  };
  const restore = async (entry: ProjectEntry): Promise<void> => {
    if (locked.current || entry.record.ownerId !== ownerId) return;
    locked.current = true;
    setRestoreBusy(entry.id);
    try {
      const next =
        entry.kind === "folder"
          ? entries(
              [
                await api.changeFolder(entry.id, {
                  expectedRevision: entry.record.revision,
                  status: "active",
                }),
              ],
              [],
            )[0]
          : entries(
              [],
              [
                await api.changeProject(entry.id, {
                  expectedRevision: entry.record.revision,
                  status: "active",
                }),
              ],
            )[0];
      if (active() && next) replace(next);
    } catch (failure) {
      if (active())
        report(
          failure instanceof Error
            ? failure.message
            : "The project could not be restored.",
        );
    } finally {
      if (active()) {
        locked.current = false;
        setRestoreBusy(undefined);
      }
    }
  };
  const visible = loaded?.ownerId === ownerId ? loaded : undefined;
  return {
    projects: visible?.projects ?? [],
    loading: visible?.loading ?? true,
    error: visible?.error,
    pending: intent?.ownerId === ownerId ? intent : undefined,
    creating,
    restoreBusy,
    reload: () => setAttempt((value) => value + 1),
    create,
    restore,
  };
}
