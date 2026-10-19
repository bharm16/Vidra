import type { Firestore, Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import {
  ChangeFolderCommandSchema,
  CreateFolderCommandSchema,
  FolderSchema,
  type Folder,
} from "@shared/schemas/workflow/project.schemas";
import {
  FolderIdSchema,
  OwnerIdSchema,
} from "@shared/schemas/workflow/identity.schemas";
import { WorkflowError } from "./WorkflowError";

/** Named projects that library conversations are filed into. */
export class FolderStore {
  constructor(
    private readonly database: Firestore,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async create(owner: string, input: unknown): Promise<Folder> {
    const ownerId = OwnerIdSchema.parse(owner);
    const command = CreateFolderCommandSchema.parse(input);
    const ref = this.database.collection("creation_folders").doc(command.id);
    const timestamp = this.now();
    return this.database.runTransaction(async (transaction) => {
      const existing = await transaction.get(ref);
      if (existing.exists)
        return this.owned(ownerId, command.id, existing.data());
      const folder = FolderSchema.parse({
        schemaVersion: "vidra-workflow/v2",
        id: command.id,
        ownerId,
        revision: 1,
        name: command.name,
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      transaction.create(ref, folder);
      return folder;
    });
  }

  async get(owner: string, id: string): Promise<Folder> {
    return this.database.runTransaction(transaction => this.readOwned(transaction, owner, id));
  }

  async list(owner: string): Promise<Folder[]> {
    const ownerId = OwnerIdSchema.parse(owner);
    const result = await this.database
      .collection("creation_folders")
      .where("ownerId", "==", ownerId)
      .limit(200)
      .get();
    return result.docs
      .map((doc) => this.owned(ownerId, doc.id, doc.data()))
      .sort(
        (a, b) =>
          b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
      );
  }

  async change(owner: string, id: string, input: unknown): Promise<Folder> {
    const command = ChangeFolderCommandSchema.parse(input);
    return this.database.runTransaction(async (transaction) => {
      const current = await this.readOwned(transaction, owner, id);
      if (current.revision !== command.expectedRevision)
        throw new WorkflowError(
          "revision_conflict",
          "This project changed in another window. Review its current name and status.",
        );
      if (current.status === "trashed" && command.status !== "active")
        throw new WorkflowError(
          "read_only",
          "Restore this project before changing it.",
        );
      const next = FolderSchema.parse({
        ...current,
        name: command.name ?? current.name,
        status: command.status ?? current.status,
        revision: current.revision + 1,
        updatedAt: this.now(),
      });
      transaction.set(
        this.database.collection("creation_folders").doc(current.id),
        next,
      );
      return next;
    });
  }

  async readOwned(
    transaction: Transaction,
    owner: string,
    id: string,
  ): Promise<Folder> {
    const ownerId = OwnerIdSchema.parse(owner);
    const folderId = FolderIdSchema.parse(id);
    const snapshot = await transaction.get(
      this.database.collection("creation_folders").doc(folderId),
    );
    if (!snapshot.exists)
      throw new WorkflowError("not_found", "This project is unavailable.");
    return this.owned(ownerId, folderId, snapshot.data());
  }

  private owned(ownerId: string, folderId: string, data: unknown): Folder {
    // Check scope before decoding or returning private data.
    const scope = z
      .object({ ownerId: OwnerIdSchema, id: FolderIdSchema })
      .parse(data);
    if (scope.ownerId !== ownerId || scope.id !== folderId)
      throw new WorkflowError(
        "access_denied",
        "You do not have access to this project.",
      );
    return FolderSchema.parse(data);
  }
}
