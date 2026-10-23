import { z } from "zod";
import { CreationDraftSchema, DraftContentSchema } from "@shared/schemas/workflow/draft.schemas";
import { DraftIdSchema, OwnerIdSchema, ProjectIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { SubmissionCommandSchema } from "@shared/schemas/workflow/request.schemas";
import { canonicalJson } from "@shared/workflow/canonicalJson";

const CheckpointSchema = z.strictObject({
  schemaVersion: z.literal("vidra-draft-checkpoint/v2"),
  ownerId: OwnerIdSchema, projectId: ProjectIdSchema, draftId: DraftIdSchema,
  record: CreationDraftSchema, content: DraftContentSchema,
  sequence: z.number().int().nonnegative(), serverRevision: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
}).superRefine((checkpoint, ctx) => {
  if (checkpoint.ownerId !== checkpoint.record.ownerId || checkpoint.projectId !== checkpoint.record.projectId || checkpoint.draftId !== checkpoint.record.id) ctx.addIssue({ code: "custom", message: "Checkpoint scope must match its exact owned draft" });
});
export type DraftCheckpoint = z.infer<typeof CheckpointSchema>;
const CopySchema = z.strictObject({ ownerId: OwnerIdSchema, projectId: ProjectIdSchema, draftId: DraftIdSchema, writerId: z.string().uuid(), checkpoint: CheckpointSchema }).refine(copy => copy.ownerId === copy.checkpoint.ownerId && copy.projectId === copy.checkpoint.projectId && copy.draftId === copy.checkpoint.draftId, "Recovery copy must match its checkpoint scope");
const SubmissionCheckpointSchema = z.strictObject({
  ownerId: OwnerIdSchema, projectId: ProjectIdSchema,
  submissionId: SubmissionCommandSchema.shape.submissionId,
  command: SubmissionCommandSchema,
  sequence: z.number().int().nonnegative(), state: z.enum(["unknown", "accepted", "rejected"]),
}).refine(value => value.submissionId === value.command.submissionId, "Submission identity must match its immutable command");
export type SubmissionCheckpoint = z.infer<typeof SubmissionCheckpointSchema>;
export interface OwnedWorkflowRetention {
  drafts: DraftCheckpoint[];
  submissions: SubmissionCheckpoint[];
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error ?? new Error("Device storage failed.")); });
}

function committed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error ?? new Error("Device storage did not complete.")); transaction.onerror = () => reject(transaction.error ?? new Error("Device storage failed.")); });
}

/** Private local work is keyed by its creator, project and draft, never a global prompt key. */
export class DraftCheckpointStore {
  private database: Promise<IDBDatabase> | undefined;
  private readonly writerId = crypto.randomUUID();

  private open(): Promise<IDBDatabase> {
    if (this.database) return this.database;
    this.database = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") { reject(new Error("Device storage is unavailable. Save to the server or export this draft before leaving.")); return; }
      const request = indexedDB.open("vidra-workflow-v2", 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("drafts")) {
          const drafts = db.createObjectStore("drafts", { keyPath: ["ownerId", "projectId", "draftId"] });
          drafts.createIndex("by-project", ["ownerId", "projectId"]);
          drafts.createIndex("by-owner", "ownerId");
          const submissions = db.createObjectStore("submissions", { keyPath: ["ownerId", "submissionId"] });
          submissions.createIndex("by-owner", "ownerId");
          const blobs = db.createObjectStore("blobs", { keyPath: ["ownerId", "id"] });
          blobs.createIndex("by-owner", "ownerId");
        }
        const copies = db.createObjectStore("draft-copies", { keyPath: ["ownerId", "projectId", "draftId", "writerId"] });
        copies.createIndex("by-project", ["ownerId", "projectId"]);
        copies.createIndex("by-draft", ["ownerId", "projectId", "draftId"]);
      };
      request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); this.database = undefined; }; resolve(request.result); };
      request.onerror = () => { this.database = undefined; reject(request.error ?? new Error("Device storage could not open.")); };
      request.onblocked = () => { this.database = undefined; reject(new Error("Another window is blocking device storage. Server saving remains available.")); };
    });
    return this.database;
  }

  async save(input: DraftCheckpoint): Promise<void> {
    const checkpoint = CheckpointSchema.parse(input);
    const db = await this.open();
    const transaction = db.transaction("draft-copies", "readwrite");
    const done = committed(transaction);
    const copies = transaction.objectStore("draft-copies");
    const value: unknown = await result(copies.get([checkpoint.ownerId, checkpoint.projectId, checkpoint.draftId, this.writerId]));
    const previous = value === undefined ? undefined : CopySchema.parse(value);
    if (!previous || previous.checkpoint.sequence <= checkpoint.sequence) copies.put(CopySchema.parse({ ownerId: checkpoint.ownerId, projectId: checkpoint.projectId, draftId: checkpoint.draftId, writerId: this.writerId, checkpoint }));
    await done;
  }

  async get(ownerId: string, projectId: string, draftId: string): Promise<DraftCheckpoint | undefined> {
    const db = await this.open();
    const values: unknown[] = await result(db.transaction("draft-copies", "readonly").objectStore("draft-copies").index("by-draft").getAll(IDBKeyRange.only([ownerId, projectId, draftId])));
    const copies = values.map(value => CopySchema.parse(value));
    const mine = copies.find(copy => copy.writerId === this.writerId);
    if (mine) return mine.checkpoint;
    const contents = new Set(copies.map(copy => canonicalJson(copy.checkpoint.content)));
    if (contents.size > 1) return undefined; // competing words require an explicit recovery choice
    if (copies[0]) return copies.sort((a, b) => b.checkpoint.updatedAt.localeCompare(a.checkpoint.updatedAt))[0]?.checkpoint;
    const value: unknown = await result(db.transaction("drafts", "readonly").objectStore("drafts").get([ownerId, projectId, draftId]));
    if (value === undefined) return undefined;
    const checkpoint = CheckpointSchema.parse(value);
    if (checkpoint.ownerId !== ownerId || checkpoint.projectId !== projectId || checkpoint.draftId !== draftId) throw new Error("Device draft belongs to a different scope.");
    return checkpoint;
  }

  async list(ownerId: string, projectId: string): Promise<DraftCheckpoint[]> {
    const db = await this.open();
    const values: unknown[] = await result(db.transaction("draft-copies", "readonly").objectStore("draft-copies").index("by-project").getAll(IDBKeyRange.only([ownerId, projectId])));
    return values.map(value => CopySchema.parse(value).checkpoint).filter(checkpoint => checkpoint.ownerId === ownerId && checkpoint.projectId === projectId);
  }

  /** Removes the legacy draft and every tab's copy of it. */
  async remove(ownerId: string, projectId: string, draftId: string): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction(["drafts", "draft-copies"], "readwrite");
    const done = committed(transaction);
    transaction.objectStore("drafts").delete([ownerId, projectId, draftId]);
    const copies = transaction.objectStore("draft-copies");
    const values: unknown[] = await result(copies.index("by-draft").getAll(IDBKeyRange.only([ownerId, projectId, draftId])));
    for (const value of values) { const copy = CopySchema.parse(value); copies.delete([copy.ownerId, copy.projectId, copy.draftId, copy.writerId]); }
    await done;
  }

  async saveSubmission(input: SubmissionCheckpoint): Promise<void> {
    const value = SubmissionCheckpointSchema.parse(input);
    const db = await this.open();
    const transaction = db.transaction("submissions", "readwrite");
    const done = committed(transaction);
    transaction.objectStore("submissions").put(value);
    await done;
  }

  async submissions(ownerId: string): Promise<SubmissionCheckpoint[]> {
    const db = await this.open();
    const rows: unknown[] = await result(db.transaction("submissions", "readonly").objectStore("submissions").index("by-owner").getAll(IDBKeyRange.only(ownerId)));
    return rows.map(row => SubmissionCheckpointSchema.parse(row)).filter(row => row.ownerId === ownerId);
  }

  /** Read all of this account's retained work, including copies from closed tabs. */
  async retention(ownerId: string): Promise<OwnedWorkflowRetention> {
    const owner = OwnerIdSchema.parse(ownerId);
    const db = await this.open();
    const transaction = db.transaction(["draft-copies", "drafts", "submissions"], "readonly");
    const done = committed(transaction);
    // Composite keys begin with ownerId. An array sorts after the string project
    // and draft ids, so this range includes exactly that owner's writer copies.
    const range = IDBKeyRange.bound([owner], [owner, []]);
    const reads: Promise<[unknown[], unknown[], unknown[]]> = Promise.all([
      result(transaction.objectStore("draft-copies").getAll(range)),
      result(transaction.objectStore("drafts").index("by-owner").getAll(IDBKeyRange.only(owner))),
      result(transaction.objectStore("submissions").index("by-owner").getAll(IDBKeyRange.only(owner))),
    ]);
    const [[copies, legacy, submissions]] = await Promise.all([reads, done]);
    const drafts = [...copies.map(value => CopySchema.parse(value).checkpoint), ...legacy.map(value => CheckpointSchema.parse(value))];
    const pending = submissions.map(value => SubmissionCheckpointSchema.parse(value));
    if (drafts.some(draft => draft.ownerId !== owner) || pending.some(submission => submission.ownerId !== owner)) throw new Error("Device work belongs to a different account.");
    return { drafts, submissions: pending };
  }

  close(): void { void this.database?.then(db => db.close(), () => undefined); this.database = undefined; }
}
