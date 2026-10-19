import { z } from "zod";
import { ImportCommandSchema, type ImportCommand } from "@shared/schemas/workflow/import.schemas";
import { OwnerIdSchema, ProjectIdSchema } from "@shared/schemas/workflow/identity.schemas";

const CheckpointSchema = z.object({ ownerId: OwnerIdSchema, projectId: ProjectIdSchema, command: ImportCommandSchema, blob: z.instanceof(Blob).optional() });
export type ImportCheckpoint = z.infer<typeof CheckpointSchema>;
function result<T>(request: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
function committed(transaction: IDBTransaction): Promise<void> { return new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error); transaction.onerror = () => reject(transaction.error); }); }
export class ImportCheckpointStore {
  private async open(): Promise<IDBDatabase> {
    if (typeof indexedDB === "undefined") throw new Error("Device storage is unavailable. Keep this tab open until the upload finishes.");
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("vidra-project-imports-v1", 1);
      request.onupgradeneeded = () => { const store = request.result.createObjectStore("imports", { keyPath: ["ownerId", "projectId", "command.id"] }); store.createIndex("by-project", ["ownerId", "projectId"]); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Device storage is blocked. Keep this tab open until upload finishes."));
    });
  }
  async save(ownerId: string, projectId: string, command: ImportCommand, blob: Blob): Promise<void> {
    const value = CheckpointSchema.parse({ ownerId, projectId, command, blob });
    const database = await this.open();
    try { const transaction = database.transaction("imports", "readwrite"); const done = committed(transaction); transaction.objectStore("imports").put(value); await done; } finally { database.close(); }
  }
  async list(ownerId: string, projectId: string): Promise<ImportCheckpoint[]> {
    const database = await this.open();
    try {
      const values: unknown[] = await result(database.transaction("imports").objectStore("imports").index("by-project").getAll([ownerId, projectId]));
      return values.map(value => CheckpointSchema.parse(value)).filter(value => value.ownerId === ownerId && value.projectId === projectId);
    } finally { database.close(); }
  }
  /** Uploads the device still holds for this account in any project. Keys begin with the owner. */
  async hasUnfinished(ownerId: string): Promise<boolean> {
    const owner = OwnerIdSchema.parse(ownerId);
    const database = await this.open();
    try { return await result(database.transaction("imports").objectStore("imports").count(IDBKeyRange.bound([owner], [owner, []]))) > 0; } finally { database.close(); }
  }
  async remove(ownerId: string, projectId: string, id: string): Promise<void> {
    const database = await this.open();
    try { const transaction = database.transaction("imports", "readwrite"); const done = committed(transaction); transaction.objectStore("imports").delete([ownerId, projectId, id]); await done; } finally { database.close(); }
  }
}
