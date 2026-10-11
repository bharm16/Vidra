import type { Firestore, Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import { BranchContextSchema } from "@shared/schemas/workflow/draft.schemas";
import { MaterializedContextSchema, AcceptedRequestSchema } from "@shared/schemas/workflow/request.schemas";
import type { ProjectStore } from "@services/projects/ProjectStore";
import { WorkflowError } from "@services/projects/WorkflowError";

export type MaterializedContext = z.infer<typeof MaterializedContextSchema>;

/** Reads only the exact history named by the branch, never the latest thread. */
export class CreationContextService {
  constructor(private readonly database: Firestore, private readonly projects: ProjectStore) {}

  async materialize(ownerId: string, projectId: string, input: unknown): Promise<MaterializedContext> {
    return this.database.runTransaction(transaction => this.materializeInTransaction(transaction, ownerId, projectId, input));
  }

  async materializeInTransaction(transaction: Transaction, ownerId: string, projectId: string, input: unknown): Promise<MaterializedContext> {
    const context = BranchContextSchema.parse(input);
    const project = await this.projects.readOwned(transaction, ownerId, projectId);
    let projectInstructions = project.instructions.text;
    if (context.projectInstructionsRevision !== project.instructions.revision) {
      const prior = await transaction.get(this.database.collection("creation_projects").doc(project.id).collection("instructions").doc(String(context.projectInstructionsRevision)));
      if (!prior.exists) throw new WorkflowError("invalid_context", "The captured project instructions are unavailable. Choose current instructions explicitly.");
      projectInstructions = z.strictObject({ revision: z.number().int().positive(), text: z.string() }).parse(prior.data()).text;
    }
    if (new Set(context.requestIds).size !== context.requestIds.length) throw new WorkflowError("invalid_context", "The context contains repeated history.");
    if ((context.origin === "empty" || context.origin === "unknown") && (context.requestIds.length || context.parentRequestId)) throw new WorkflowError("invalid_context", "Empty or unknown history cannot imply earlier instructions.");
    const requests = [];
    for (const id of context.requestIds) {
      const row = await transaction.get(this.database.collection("creation_requests").doc(id));
      if (!row.exists) throw new WorkflowError("invalid_context", "An exact historical request is unavailable.");
      const request = AcceptedRequestSchema.parse(row.data());
      if (request.ownerId !== ownerId || request.projectId !== projectId) throw new WorkflowError("invalid_context", "The selected history is outside this project.");
      requests.push(request);
    }
    if (context.origin === "branch") {
      const parent = requests.at(-1);
      if (!parent || parent.id !== context.parentRequestId) throw new WorkflowError("invalid_context", "The branch must name its exact parent request.");
      const expected = [...parent.snapshot.context.requestIds, parent.id];
      if (expected.length !== context.requestIds.length || expected.some((id, index) => context.requestIds[index] !== id)) throw new WorkflowError("invalid_context", "This history includes a sibling or unrelated request.");
    }
    if (context.summary && (!context.summary.requestIds.every(id => context.requestIds.includes(id)) || new Set(context.summary.requestIds).size !== context.summary.requestIds.length)) throw new WorkflowError("invalid_context", "The applied summary must name exact requests in this context.");
    return MaterializedContextSchema.parse({ projectInstructions, entries: requests.map(request => ({ requestId: request.id, instructions: request.snapshot.instructions })) });
  }
}
