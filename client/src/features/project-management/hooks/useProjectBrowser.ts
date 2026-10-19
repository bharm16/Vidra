import { useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "@shared/schemas/workflow/project.schemas";
import { getAuthRepository } from "@/repositories/index";
import { ProjectManagementApi } from "../api/projectManagementApi";
import { readProjectCreationIntent, keepProjectCreationIntent, clearProjectCreationIntent, type ProjectCreationIntent } from "../state/projectCreationIntent";

export function useProjectBrowser(ownerId: string, onCreated: (projectId: string) => void): {
  projects: Project[]; loading: boolean; error: string | undefined; creating: boolean; pending: ProjectCreationIntent | undefined; restoreBusy: string | undefined;
  reload: () => void; create: (name: string) => Promise<void>; restore: (project: Project) => Promise<void>;
} {
  const api = useMemo(() => new ProjectManagementApi(ownerId), [ownerId]);
  const [loaded, setLoaded] = useState<{ ownerId: string; projects: Project[]; loading: boolean; error?: string }>();
  const [intent, setIntent] = useState<ProjectCreationIntent>();
  const [creating, setCreating] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const scope = useRef(ownerId); scope.current = ownerId;
  const mounted = useRef(true);
  const locked = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const abort = new AbortController();
    locked.current = false; setCreating(false); setRestoreBusy(undefined); setIntent(undefined);
    setLoaded({ ownerId, projects: [], loading: true });
    try { setIntent(readProjectCreationIntent(ownerId)); } catch { setLoaded({ ownerId, projects: [], loading: false, error: "Your pending project request could not be read. Keep this browser tab and check your projects before creating another." }); }
    void api.listProjects(abort.signal).then(projects => { if (!abort.signal.aborted) setLoaded({ ownerId, projects, loading: false }); }).catch((failure: unknown) => { if (!abort.signal.aborted) setLoaded({ ownerId, projects: [], loading: false, error: failure instanceof Error ? failure.message : "Your projects could not load." }); });
    return () => abort.abort();
  }, [ownerId, api, attempt]);
  const active = (): boolean => mounted.current && scope.current === ownerId && getAuthRepository().getCurrentUser()?.uid === ownerId;
  const report = (message: string): void => setLoaded(current => ({ ownerId, projects: current?.ownerId === ownerId ? current.projects : [], loading: false, error: message }));
  const create = async (name: string): Promise<void> => {
    if (locked.current) return;
    locked.current = true; setCreating(true);
    try {
      const captured = keepProjectCreationIntent(ownerId, name);
      setIntent(captured);
      const project = await api.createProject(captured.projectId, captured.name);
      if (!active()) return;
      await api.createConversation(project.id, captured.conversationId, "First ideas");
      if (!active()) return;
      clearProjectCreationIntent(ownerId, project.id);
      setIntent(undefined);
      setLoaded(current => ({ ownerId, projects: [project, ...(current?.ownerId === ownerId ? current.projects.filter(row => row.id !== project.id) : [])], loading: false }));
      onCreated(project.id);
    } catch (failure) { if (active()) report(failure instanceof Error ? failure.message : "Creating this project was not confirmed. Try the same request again."); }
    finally { if (active()) { locked.current = false; setCreating(false); } }
  };
  const restore = async (project: Project): Promise<void> => {
    if (locked.current || project.ownerId !== ownerId) return;
    locked.current = true; setRestoreBusy(project.id);
    try {
      const next = await api.changeProject(project.id, { expectedRevision: project.revision, status: "active" });
      if (active()) setLoaded(current => ({ ownerId, projects: current?.ownerId === ownerId ? current.projects.map(row => row.id === next.id ? next : row) : [next], loading: false }));
    } catch (failure) { if (active()) report(failure instanceof Error ? failure.message : "The project could not be restored."); }
    finally { if (active()) { locked.current = false; setRestoreBusy(undefined); } }
  };
  const visible = loaded?.ownerId === ownerId ? loaded : undefined;
  return { projects: visible?.projects ?? [], loading: visible?.loading ?? true, error: visible?.error, pending: intent?.ownerId === ownerId ? intent : undefined, creating, restoreBusy, reload: () => setAttempt(value => value + 1), create, restore };
}
