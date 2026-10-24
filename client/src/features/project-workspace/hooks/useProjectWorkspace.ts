import { useMemo } from "react";
import { createWorkspaceAdapters, type WorkspaceAdapters } from "../api/WorkspaceAdapters";
import { useWorkspaceAuthoring, type WorkspaceAuthoringOptions, type ProjectWorkspaceController } from "./useWorkspaceAuthoring";
export { unusedConversation } from "./useWorkspaceAuthoring";
export type { ProjectWorkspaceController, WorkspaceResource } from "./useWorkspaceAuthoring";

export interface ProjectWorkspaceOptions extends WorkspaceAuthoringOptions { adapters?: WorkspaceAdapters; }
/** React composition adapter. The authoring module receives explicit owned-server and device ports. */
export function useProjectWorkspace(ownerId: string, projectId: string, initialConversationId?: string, initialDraftTargetId?: string, options: ProjectWorkspaceOptions = {}): ProjectWorkspaceController {
  const adapters = useMemo(() => options.adapters ?? createWorkspaceAdapters(ownerId, projectId), [options.adapters, ownerId, projectId]);
  return useWorkspaceAuthoring(ownerId, projectId, initialConversationId, initialDraftTargetId, options, adapters);
}
