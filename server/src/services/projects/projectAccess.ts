import type { Conversation, Project } from "@shared/schemas/workflow/project.schemas";
import { WorkflowError } from "./WorkflowError";

/** Metadata restoration needs workflow authority, even while authoring is closed. */
export function requireWorkflowProjectAuthority(project: Project): void {
  if (project.origin.kind !== "new" && project.origin.authority !== "workflow") {
    throw new WorkflowError("read_only", "This project still uses its original workspace.");
  }
}

export function requireWritableProject(project: Project): void {
  requireWorkflowProjectAuthority(project);
  if (project.status !== "active") {
    throw new WorkflowError("read_only", "Restore this project before changing work.");
  }
}

export function requireWritableConversation(project: Project, conversation: Conversation): void {
  if (conversation.ownerId !== project.ownerId || conversation.projectId !== project.id) {
    throw new WorkflowError("access_denied", "You do not have access to this conversation.");
  }
  requireWritableProject(project);
  if (conversation.status !== "active") {
    throw new WorkflowError("read_only", "Restore this conversation before changing work.");
  }
}
