import type { DIContainer } from "@infrastructure/DIContainer";
import { getFirestore } from "@infrastructure/firebaseAdmin";
import { ProjectStore } from "@services/projects/ProjectStore";
import { ConversationStore } from "@services/projects/ConversationStore";
import { CreationDraftStore } from "@services/creation-drafts/CreationDraftStore";

export function registerWorkflowServices(container: DIContainer): void {
  container.register("workflowProjectStore", () => new ProjectStore(getFirestore()), []);
  container.register("workflowConversationStore", (projects: ProjectStore) => new ConversationStore(getFirestore(), projects), ["workflowProjectStore"]);
  container.register("workflowDraftStore", (projects: ProjectStore, conversations: ConversationStore) => new CreationDraftStore(getFirestore(), projects, conversations), ["workflowProjectStore", "workflowConversationStore"]);
}
