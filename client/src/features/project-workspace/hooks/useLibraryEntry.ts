import { useCallback, useEffect, useMemo, useState } from "react";
import type { Project } from "@shared/schemas/workflow/project.schemas";
import { WorkflowApi } from "../api/workflowApi";

export interface LibraryEntry {
  library: Project | undefined;
  error: { message: string; status: number | undefined } | undefined;
  retry(): void;
}

/** Opens the owner's library, the home for work that is not filed in a project. */
export function useLibraryEntry(
  ownerId: string,
  api?: Pick<WorkflowApi, "ensureLibrary">,
): LibraryEntry {
  const client = useMemo(
    () => api ?? new WorkflowApi(undefined, ownerId),
    [api, ownerId],
  );
  const [state, setState] = useState<{
    ownerId: string;
    library?: Project;
    error?: LibraryEntry["error"];
  }>({ ownerId });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setState({ ownerId });
    client
      .ensureLibrary(abort.signal)
      .then((library) => {
        if (!abort.signal.aborted) setState({ ownerId, library });
      })
      .catch((failure: unknown) => {
        if (abort.signal.aborted) return;
        const status =
          failure instanceof Error &&
          "status" in failure &&
          typeof failure.status === "number"
            ? failure.status
            : undefined;
        setState({
          ownerId,
          error: {
            message:
              failure instanceof Error
                ? failure.message
                : "Your work could not open.",
            status,
          },
        });
      });
    return () => abort.abort();
  }, [attempt, client, ownerId]);
  const retry = useCallback((): void => setAttempt((value) => value + 1), []);
  const current = state.ownerId === ownerId ? state : { ownerId };
  return { library: current.library, error: current.error, retry };
}
