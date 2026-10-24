import { WorkflowApi } from "./workflowApi";
import { MediaActionsApi } from "./mediaActionsApi";
import { DraftCheckpointStore } from "@/repositories/workflow/DraftCheckpointStore";
import { acceptAreaMask } from "@/features/project-sketch/api/projectSketchApi";

export type WorkspaceServer = Pick<WorkflowApi, "getProject" | "getConversation" | "listConversations" | "createConversation" | "listDrafts" | "createDraft" | "saveDraft" | "draftStatus" | "profiles" | "media" | "history" | "requestStatus" | "cancelRequest" | "reconcileRequest" | "prepare" | "submit" | "recover" | "access">;
export type WorkspaceDevice = Pick<DraftCheckpointStore, "save" | "get" | "list" | "saveSubmission" | "submissions" | "remove">;
export interface WorkspaceAdapters {
  server: WorkspaceServer;
  device: WorkspaceDevice;
  saveAreaMask: typeof acceptAreaMask;
  frames: Pick<MediaActionsApi, "frame">;
}
/** Composition point for the owned-server and device adapters; authoring accepts these dependencies. */
export function createWorkspaceAdapters(ownerId: string, projectId: string): WorkspaceAdapters {
  return { server: new WorkflowApi(undefined, ownerId), device: new DraftCheckpointStore(), saveAreaMask: acceptAreaMask, frames: new MediaActionsApi(ownerId, projectId) };
}
