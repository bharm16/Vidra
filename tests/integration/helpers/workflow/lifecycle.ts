import { CreationRequestLifecycle } from "@services/creation-requests/lifecycle";
import { WorkflowExecutionService, WorkflowExecutionStore } from "@services/creation-requests/execution";
import { ProjectStore } from "@services/projects/ProjectStore";
import { ConversationStore } from "@services/projects/ConversationStore";
import { CreationDraftStore } from "@services/creation-drafts/CreationDraftStore";
import { CreationContextService } from "@services/creation-context/CreationContextService";
import { MediaVersionIndex } from "@services/media-history/MediaVersionIndex";
import { WorkflowCapabilityCatalog } from "@services/creation-requests/catalog";

type Dependencies = Parameters<typeof CreationRequestLifecycle.create>[0];
/** Real lifecycle/persistence; the unconfigured provider adapter refuses dispatch before spending. */
export function createTestLifecycle(options: Partial<Dependencies> & Pick<Dependencies, "database">, execution?: WorkflowExecutionService): CreationRequestLifecycle {
  const projects = options.projects ?? new ProjectStore(options.database);
  const conversations = options.conversations ?? new ConversationStore(options.database, projects);
  const media = new MediaVersionIndex(options.database, projects);
  return CreationRequestLifecycle.create({ database: options.database, projects, conversations,
    drafts: options.drafts ?? new CreationDraftStore(options.database, projects, conversations),
    contexts: options.contexts ?? new CreationContextService(options.database, projects),
    profiles: options.profiles ?? new WorkflowCapabilityCatalog(), media: options.media ?? media,
  }, execution ?? new WorkflowExecutionService(new WorkflowExecutionStore(options.database, media), { available: () => false, execute: async () => { throw new Error("No test provider configured"); } }, { materialize: async () => { throw new Error("No test storage configured"); } }));
}
