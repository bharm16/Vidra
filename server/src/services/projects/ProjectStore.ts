import type { Firestore, Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import { ChangeProjectCommandSchema, CreateProjectCommandSchema, ProjectSchema, type Project } from "@shared/schemas/workflow/project.schemas";
import { OwnerIdSchema, ProjectIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { WorkflowError } from "./WorkflowError";
import { requireWorkflowProjectAuthority } from "./projectAccess";

export class ProjectStore {
  constructor(private readonly database: Firestore, private readonly now: () => string = () => new Date().toISOString()) {}

  async create(owner: string, input: unknown): Promise<Project> {
    const ownerId = OwnerIdSchema.parse(owner);
    const command = CreateProjectCommandSchema.parse(input);
    const ref = this.database.collection("creation_projects").doc(command.id);
    const timestamp = this.now();
    return this.database.runTransaction(async transaction => {
      const existing = await transaction.get(ref);
      if (existing.exists) return this.owned(ownerId, command.id, existing.data());
      const project = ProjectSchema.parse({
        schemaVersion: "vidra-workflow/v2", id: command.id, ownerId, revision: 1,
        name: command.name, status: "active", instructions: { revision: 1, text: "" },
        origin: { kind: "new" }, createdAt: timestamp, updatedAt: timestamp,
      });
      transaction.create(ref, project);
      return project;
    });
  }

  async get(owner: string, id: string): Promise<Project> {
    const ownerId = OwnerIdSchema.parse(owner);
    const projectId = ProjectIdSchema.parse(id);
    const snapshot = await this.database.collection("creation_projects").doc(projectId).get();
    if (!snapshot.exists) throw new WorkflowError("not_found", "This project is unavailable.");
    return this.owned(ownerId, projectId, snapshot.data());
  }

  async list(owner: string): Promise<Project[]> {
    const ownerId = OwnerIdSchema.parse(owner);
    const result = await this.database.collection("creation_projects").where("ownerId", "==", ownerId).limit(200).get();
    return result.docs.map(doc => this.owned(ownerId, doc.id, doc.data())).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  }

  async change(owner: string, id: string, input: unknown): Promise<Project> {
    const command = ChangeProjectCommandSchema.parse(input);
    const projectId = ProjectIdSchema.parse(id);
    const timestamp = this.now();
    return this.database.runTransaction(async transaction => {
      const current = await this.readOwned(transaction, owner, projectId);
      // Metadata restoration is permitted while authoring remains read-only.
      requireWorkflowProjectAuthority(current);
      if (current.revision !== command.expectedRevision) throw new WorkflowError("revision_conflict", "This project changed in another window. Keep your changes and review the latest version.");
      if (current.status === "trashed" && command.status !== "active") throw new WorkflowError("read_only", "Restore this project before changing it.");
      const instructions = command.instructions === undefined || command.instructions === current.instructions.text
        ? current.instructions
        : { revision: current.instructions.revision + 1, text: command.instructions };
      const next = ProjectSchema.parse({
        ...current, revision: current.revision + 1, updatedAt: timestamp,
        name: command.name ?? current.name, status: command.status ?? current.status,
        sharingEpoch: command.status === "trashed" && current.status !== "trashed" ? current.sharingEpoch + 1 : current.sharingEpoch,
        instructions,
      });
      const ref = this.database.collection("creation_projects").doc(projectId);
      if (instructions.revision !== current.instructions.revision) transaction.create(ref.collection("instructions").doc(String(current.instructions.revision)), current.instructions);
      transaction.set(ref, next);
      return next;
    });
  }

  async readOwned(transaction: Transaction, owner: string, id: string): Promise<Project> {
    const ownerId = OwnerIdSchema.parse(owner);
    const projectId = ProjectIdSchema.parse(id);
    const snapshot = await transaction.get(this.database.collection("creation_projects").doc(projectId));
    if (!snapshot.exists) throw new WorkflowError("not_found", "This project is unavailable.");
    return this.owned(ownerId, projectId, snapshot.data());
  }

  private owned(ownerId: string, projectId: string, data: unknown): Project {
    // Check scope before decoding or returning private data.
    const scope = z.object({ ownerId: OwnerIdSchema, id: ProjectIdSchema }).parse(data);
    if (scope.ownerId !== ownerId || scope.id !== projectId) throw new WorkflowError("access_denied", "You do not have access to this project.");
    return ProjectSchema.parse(data);
  }
}
