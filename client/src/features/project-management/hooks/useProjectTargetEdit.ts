import { useEffect, useRef, useState } from "react";
import type { Folder, Project } from "@shared/schemas/workflow/project.schemas";
import { getAuthRepository } from "@/repositories/index";
import type { ProjectManagementApi } from "../api/projectManagementApi";

type EditTarget =
  | { kind: "folder"; record: Folder; observe?: ((record: Folder) => void) | undefined }
  | { kind: "project"; record: Project; observe(record: Project): void };

/** The selected record owns its name, refresh revision and late-result admission. */
export function useProjectTargetEdit(ownerId: string, target: EditTarget, api: ProjectManagementApi): {
  identity: string;
  name: string;
  setName(name: string): void;
  begin(): void;
  save(): Promise<boolean>;
  refresh(): Promise<void>;
  changeStatus(status: "active" | "trashed"): Promise<boolean>;
} {
  const identity = `${ownerId}:${target.kind}:${target.record.id}`;
  const current = useRef({ identity });
  if (current.current.identity !== identity) current.current = { identity };
  const selection = current.current;
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const [edit, setEdit] = useState({ identity, name: target.record.name, revision: target.record.revision });
  const visible = edit.identity === identity ? edit : { identity, name: target.record.name, revision: target.record.revision };
  const active = (): boolean => live.current && current.current === selection && getAuthRepository().getCurrentUser()?.uid === ownerId;
  const change = async (patch: { name?: string; status?: "active" | "trashed"; expectedRevision: number }): Promise<boolean> => {
    if (!active()) return false;
    if (target.kind === "folder") {
      const record = await api.changeFolder(target.record.id, patch);
      if (!active()) return false;
      target.observe?.(record);
    } else {
      const record = await api.changeProject(target.record.id, patch);
      if (!active()) return false;
      target.observe(record);
    }
    return true;
  };
  return {
    identity,
    name: visible.name,
    setName: name => setEdit({ ...visible, name }),
    begin: () => setEdit({ identity, name: target.record.name, revision: target.record.revision }),
    save: () => change({ name: visible.name.trim(), expectedRevision: visible.revision }),
    changeStatus: status => change({ status, expectedRevision: target.record.revision }),
    refresh: async () => {
      if (!active()) return;
      let revision: number;
      if (target.kind === "folder") {
        const record = await api.getFolder(target.record.id);
        if (!active()) return;
        target.observe?.(record); revision = record.revision;
      } else {
        const record = await api.getProject(target.record.id);
        if (!active()) return;
        target.observe(record); revision = record.revision;
      }
      setEdit(value => value.identity === identity ? { ...value, revision } : value);
    },
  };
}
