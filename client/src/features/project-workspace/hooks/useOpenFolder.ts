import { useEffect, useMemo, useState } from "react";
import type { Folder } from "@shared/schemas/workflow/project.schemas";
import { ProjectManagementApi } from "@/features/project-management/api/projectManagementApi";

/** The named project open in the library home, read for its name and status. */
export function useOpenFolder(ownerId: string, folderId: string | undefined): { folder: Folder | undefined; error: string | undefined; observe(folder: Folder): void } {
  const api = useMemo(() => new ProjectManagementApi(ownerId), [ownerId]);
  const [state, setState] = useState<{ key: string; folder?: Folder; error?: string }>();
  const key = `${ownerId}:${folderId ?? ""}`;
  useEffect(() => {
    if (!folderId) return;
    const abort = new AbortController();
    setState({ key });
    api.getFolder(folderId, abort.signal)
      .then(folder => { if (!abort.signal.aborted) setState({ key, folder }); })
      .catch((failure: unknown) => { if (!abort.signal.aborted) setState({ key, error: failure instanceof Error ? failure.message : "This project is unavailable." }); });
    return () => abort.abort();
  }, [api, folderId, key]);
  const current = state?.key === key ? state : undefined;
  return { folder: current?.folder, error: current?.error, observe: folder => { if (folder.id === folderId) setState({ key, folder }); } };
}
