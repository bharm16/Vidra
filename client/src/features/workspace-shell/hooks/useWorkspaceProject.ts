import { useSidebarSessionsDomain } from "@/components/ToolSidebar/context";
import { resolveEntryTitle } from "@features/history/utils/historyTitles";

export interface UseWorkspaceProjectResult {
  name: string;
}

/**
 * Surfaces the current session's display name for the workspace top bar.
 *
 * Reads the sidebar sessions domain (the same source the Sessions panel
 * uses) and resolves the current entry's title via `resolveEntryTitle` —
 * stored rename first, otherwise a title derived from the prompt input.
 * Falls back to "Untitled" when no session is active or the domain is not
 * mounted (tests, isolated stories). Display-only: renames happen through
 * the Sessions panel, not here.
 */
export function useWorkspaceProject(): UseWorkspaceProjectResult {
  const sessions = useSidebarSessionsDomain();
  const currentUuid = sessions?.currentPromptUuid ?? null;
  const currentDocId = sessions?.currentPromptDocId ?? null;
  const entry = sessions?.history.find(
    (candidate) =>
      (currentUuid !== null && candidate.uuid === currentUuid) ||
      (currentDocId !== null && candidate.id === currentDocId),
  );
  const name = entry ? resolveEntryTitle(entry) : "";
  return { name: name || "Untitled" };
}
