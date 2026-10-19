import { z } from "zod";
import { ProjectSketchCaptureCommandSchema, SketchPictureDataUriSchema } from "@shared/schemas/workflow/sketch.schemas";
import { SketchProductionInputsSchema } from "@shared/schemas/sketch.schemas";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";

export const SketchCheckpointSchema = z.strictObject({
  key: z.string(), drawingDataUri: SketchPictureDataUriSchema.optional(), inputs: SketchProductionInputsSchema,
  pending: ProjectSketchCaptureCommandSchema.optional(), saved: MediaVersionSchema.optional(),
});
export type SketchCheckpoint = z.infer<typeof SketchCheckpointSchema>;
function complete(transaction: IDBTransaction): Promise<void> { return new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error ?? new Error("Sketch checkpoint aborted")); }); }
function result<T>(request: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }

/** IndexedDB retains one exact pending press across reloads without a localStorage size limit. */
export class SketchCheckpointStore {
  private writes: Promise<void> = Promise.resolve();
  private async open(): Promise<IDBDatabase> {
    if (typeof indexedDB === "undefined") throw new Error("Drawing recovery is unavailable in this browser.");
    const request = indexedDB.open("vidra-project-sketch-v1", 1);
    request.onupgradeneeded = () => { request.result.createObjectStore("checkpoints", { keyPath: "key" }); };
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Drawing recovery is blocked by another window. Keep this tab open."));
    });
  }
  async read(key: string): Promise<SketchCheckpoint | undefined> {
    const db = await this.open();
    try { const row: unknown = await result(db.transaction("checkpoints", "readonly").objectStore("checkpoints").get(key)); return row === undefined ? undefined : SketchCheckpointSchema.parse(row); } finally { db.close(); }
  }
  async save(checkpoint: SketchCheckpoint): Promise<void> {
    const row = SketchCheckpointSchema.parse(checkpoint);
    const write = this.writes.then(() => this.write(row));
    this.writes = write.catch(() => undefined);
    return write;
  }
  private async write(row: SketchCheckpoint): Promise<void> {
    const db = await this.open();
    try { const transaction = db.transaction("checkpoints", "readwrite"); const settled = complete(transaction); transaction.objectStore("checkpoints").put(row); await settled; } finally { db.close(); }
  }
}
