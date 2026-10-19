import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreationDraftSchema, DraftContentSchema } from "@shared/schemas/workflow/draft.schemas";
import { SubmissionCommandSchema } from "@shared/schemas/workflow/request.schemas";
import { DraftCheckpointStore, type DraftCheckpoint, type SubmissionCheckpoint } from "../DraftCheckpointStore";

/**
 * Minimal in-memory IndexedDB: key ordering (number < string < array), composite
 * key paths, indexes, key ranges and auto-committing transactions. Requests settle
 * on a macrotask so awaited continuations run while the transaction is still active,
 * as they do in browsers.
 */
type Path = string | string[];
interface StoreData { keyPath: Path; indexes: Map<string, Path>; records: Map<string, unknown> }
interface DatabaseData { version: number; stores: Map<string, StoreData> }
interface Settled { onsuccess: (() => void) | null; onerror: (() => void) | null; result: unknown; error: Error | null }

function rank(value: unknown): number {
  if (typeof value === "number") return 0;
  if (typeof value === "string") return 2;
  if (Array.isArray(value)) return 4;
  throw new Error("Unsupported fake IndexedDB key");
}
function compare(a: unknown, b: unknown): number {
  const order = rank(a) - rank(b);
  if (order !== 0) return order;
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let index = 0; index < Math.min(a.length, b.length); index += 1) { const result = compare(a[index], b[index]); if (result !== 0) return result; }
    return a.length - b.length;
  }
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}
function keyOf(value: unknown, path: Path): unknown {
  const record = value as Record<string, unknown>;
  return Array.isArray(path) ? path.map(part => record[part]) : record[path];
}
class FakeKeyRange {
  constructor(readonly lower: unknown, readonly upper: unknown) {}
  static only(value: unknown): FakeKeyRange { return new FakeKeyRange(value, value); }
  static bound(lower: unknown, upper: unknown): FakeKeyRange { return new FakeKeyRange(lower, upper); }
  includes(key: unknown): boolean { return compare(key, this.lower) >= 0 && compare(key, this.upper) <= 0; }
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function sorted(entries: Array<[unknown, unknown]>): unknown[] { return entries.sort((a, b) => compare(a[0], b[0])).map(([, value]) => clone(value)); }

class FakeTransaction {
  oncomplete: (() => void) | null = null;
  onabort: (() => void) | null = null;
  onerror: (() => void) | null = null;
  error: Error | null = null;
  private pending = 0;
  private finished = false;
  constructor(private readonly data: DatabaseData, private readonly names: string[]) { this.settleLater(); }
  objectStore(name: string): FakeStore {
    const store = this.data.stores.get(name);
    if (!this.names.includes(name) || !store) throw new Error(`NotFoundError: ${name}`);
    return new FakeStore(this, store);
  }
  run(work: () => unknown): Settled {
    if (this.finished) throw new Error("TransactionInactiveError");
    this.pending += 1;
    const request: Settled = { onsuccess: null, onerror: null, result: undefined, error: null };
    setTimeout(() => { request.result = work(); this.pending -= 1; request.onsuccess?.(); this.settleLater(); });
    return request;
  }
  private settleLater(): void { setTimeout(() => { if (this.pending === 0 && !this.finished) { this.finished = true; this.oncomplete?.(); } }); }
}
class FakeStore {
  constructor(private readonly transaction: FakeTransaction, private readonly store: StoreData) {}
  get(key: unknown): Settled { return this.transaction.run(() => { const value = this.store.records.get(JSON.stringify(key)); return value === undefined ? undefined : clone(value); }); }
  put(value: unknown): Settled { return this.transaction.run(() => { this.store.records.set(JSON.stringify(keyOf(value, this.store.keyPath)), clone(value)); return keyOf(value, this.store.keyPath); }); }
  delete(key: unknown): Settled { return this.transaction.run(() => { this.store.records.delete(JSON.stringify(key)); return undefined; }); }
  getAll(range?: FakeKeyRange): Settled { return this.transaction.run(() => sorted([...this.store.records.values()].map(value => [keyOf(value, this.store.keyPath), value] as [unknown, unknown]).filter(([key]) => !range || range.includes(key)))); }
  index(name: string): { getAll(range: FakeKeyRange): Settled } {
    const path = this.store.indexes.get(name);
    if (!path) throw new Error(`NotFoundError: index ${name}`);
    return { getAll: range => this.transaction.run(() => sorted([...this.store.records.values()].map(value => [[keyOf(value, path), keyOf(value, this.store.keyPath)], value] as [unknown, unknown]).filter(([key]) => range.includes((key as unknown[])[0])))) };
  }
}
class FakeDatabase {
  onversionchange: (() => void) | null = null;
  closed = false;
  readonly objectStoreNames = { contains: (name: string): boolean => this.data.stores.has(name) };
  constructor(private readonly data: DatabaseData) {}
  createObjectStore(name: string, options: { keyPath: Path }): { createIndex(index: string, path: Path): void } {
    const store: StoreData = { keyPath: options.keyPath, indexes: new Map(), records: new Map() };
    this.data.stores.set(name, store);
    return { createIndex: (index, path) => { store.indexes.set(index, path); } };
  }
  transaction(names: string | string[], _mode?: string): FakeTransaction {
    if (this.closed) throw new Error("InvalidStateError: the connection is closed");
    return new FakeTransaction(this.data, Array.isArray(names) ? names : [names]);
  }
  close(): void { this.closed = true; }
}
class FakeIndexedDB {
  readonly databases = new Map<string, DatabaseData>();
  readonly connections: FakeDatabase[] = [];
  blockNextOpen = false;
  open(name: string, version: number): Settled & { onupgradeneeded: (() => void) | null; onblocked: (() => void) | null } {
    const request = { onsuccess: null as (() => void) | null, onerror: null as (() => void) | null, onupgradeneeded: null as (() => void) | null, onblocked: null as (() => void) | null, result: undefined as unknown, error: null };
    setTimeout(() => {
      if (this.blockNextOpen) { this.blockNextOpen = false; request.onblocked?.(); return; }
      const data = this.databases.get(name) ?? { version: 0, stores: new Map<string, StoreData>() };
      this.databases.set(name, data);
      const connection = new FakeDatabase(data);
      this.connections.push(connection);
      request.result = connection;
      if (data.version < version) { data.version = version; request.onupgradeneeded?.(); }
      request.onsuccess?.();
    });
    return request;
  }
  /** A device that last ran the v1 schema: drafts, submissions and blobs, no writer copies. */
  seedVersionOne(legacyDrafts: unknown[]): void {
    const stores = new Map<string, StoreData>([
      ["drafts", { keyPath: ["ownerId", "projectId", "draftId"], indexes: new Map<string, Path>([["by-project", ["ownerId", "projectId"]], ["by-owner", "ownerId"]]), records: new Map() }],
      ["submissions", { keyPath: ["ownerId", "submissionId"], indexes: new Map<string, Path>([["by-owner", "ownerId"]]), records: new Map() }],
      ["blobs", { keyPath: ["ownerId", "id"], indexes: new Map<string, Path>([["by-owner", "ownerId"]]), records: new Map() }],
    ]);
    const drafts = stores.get("drafts");
    for (const value of legacyDrafts) drafts?.records.set(JSON.stringify(keyOf(value, ["ownerId", "projectId", "draftId"])), clone(value));
    this.databases.set("vidra-workflow-v2", { version: 1, stores });
  }
}

const at = "2026-10-17T00:00:00.000Z";
interface Scope { ownerId?: string; projectId?: string; draftId?: string; instructions?: string; sequence?: number; updatedAt?: string }
function checkpoint({ ownerId = "creator", projectId = "project_one", draftId = "draft_one", instructions = "Server words", sequence = 1, updatedAt = at }: Scope = {}): DraftCheckpoint {
  const record = CreationDraftSchema.parse({
    schemaVersion: "vidra-workflow/v2", id: draftId, ownerId, projectId, conversationId: "conversation_one", revision: 2, status: "open", action: "make-image", instructions: "Server words", inputs: [],
    settings: { profileId: "image", profileRevision: "1", parameters: { aspect: "16:9" }, outputCount: 1 },
    context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 },
    destination: { projectId, conversationId: "conversation_one" }, createdAt: at, updatedAt: at,
  });
  return { schemaVersion: "vidra-draft-checkpoint/v2", ownerId: record.ownerId, projectId: record.projectId, draftId: record.id, record, content: { ...DraftContentSchema.strip().parse(record), instructions }, sequence, serverRevision: record.revision, updatedAt };
}
function submission(ownerId: string, submissionId: string, state: SubmissionCheckpoint["state"] = "unknown"): SubmissionCheckpoint {
  const command = SubmissionCommandSchema.parse({ submissionId, draftId: "draft_one", draftRevision: 2, reviewedHash: "a".repeat(64) });
  return { ownerId, projectId: checkpoint().projectId, submissionId: command.submissionId, command, sequence: 3, state };
}

let fake: FakeIndexedDB;
const stores: DraftCheckpointStore[] = [];
function tab(): DraftCheckpointStore { const store = new DraftCheckpointStore(); stores.push(store); return store; }
beforeEach(() => { fake = new FakeIndexedDB(); vi.stubGlobal("indexedDB", fake); vi.stubGlobal("IDBKeyRange", FakeKeyRange); });
afterEach(() => { for (const store of stores.splice(0)) store.close(); vi.unstubAllGlobals(); });

describe("DraftCheckpointStore writer copies", () => {
  it("reads back this tab's saved words and keeps its newest sequence when an older save arrives late", async () => {
    const store = tab();
    await store.save(checkpoint({ instructions: "Newest words", sequence: 7 }));
    await store.save(checkpoint({ instructions: "Late older words", sequence: 5 }));
    expect(await store.get("creator", "project_one", "draft_one")).toMatchObject({ sequence: 7, content: { instructions: "Newest words" } });
    await store.save(checkpoint({ instructions: "Even newer words", sequence: 8 }));
    expect((await store.get("creator", "project_one", "draft_one"))?.content.instructions).toBe("Even newer words");
  });

  it("rejects a checkpoint whose scope differs from its draft record without writing it", async () => {
    const store = tab();
    const mismatched = { ...checkpoint(), projectId: checkpoint({ projectId: "project_two" }).projectId };
    await expect(store.save(mismatched)).rejects.toThrow("exact owned draft");
    expect(await store.list("creator", "project_one")).toEqual([]);
    expect(await store.list("creator", "project_two")).toEqual([]);
  });

  it("keeps each tab's copy separately and returns the latest when every copy has the same words", async () => {
    await tab().save(checkpoint({ sequence: 1, updatedAt: "2026-10-17T00:00:01.000Z" }));
    await tab().save(checkpoint({ sequence: 4, updatedAt: "2026-10-17T00:00:09.000Z" }));
    const reader = tab();
    expect(await reader.get("creator", "project_one", "draft_one")).toMatchObject({ sequence: 4, updatedAt: "2026-10-17T00:00:09.000Z" });
    expect(await reader.list("creator", "project_one")).toHaveLength(2);
  });

  it("requires an explicit recovery choice when closed tabs retained competing words", async () => {
    const first = tab();
    await first.save(checkpoint({ instructions: "Words from the first tab" }));
    await tab().save(checkpoint({ instructions: "Words from the second tab" }));
    expect(await tab().get("creator", "project_one", "draft_one")).toBeUndefined();
    expect((await first.get("creator", "project_one", "draft_one"))?.content.instructions).toBe("Words from the first tab");
  });

  it("lists only the requested owner's project copies", async () => {
    const store = tab();
    await store.save(checkpoint({ draftId: "draft_one" }));
    await store.save(checkpoint({ draftId: "draft_two" }));
    await store.save(checkpoint({ projectId: "project_two" }));
    await store.save(checkpoint({ ownerId: "other-creator" }));
    expect((await store.list("creator", "project_one")).map(item => item.draftId).sort()).toEqual(["draft_one", "draft_two"]);
    expect(await store.get("creator", "project_one", "draft_missing")).toBeUndefined();
  });
});

describe("DraftCheckpointStore legacy drafts and submissions", () => {
  it("upgrades a v1 device database, keeps its legacy draft readable and removes it on request", async () => {
    fake.seedVersionOne([checkpoint({ instructions: "Words saved before the upgrade" })]);
    const store = tab();
    expect((await store.get("creator", "project_one", "draft_one"))?.content.instructions).toBe("Words saved before the upgrade");
    expect(fake.databases.get("vidra-workflow-v2")?.version).toBe(2);
    await store.remove("creator", "project_one", "draft_one");
    expect(await store.get("creator", "project_one", "draft_one")).toBeUndefined();
  });

  it("rejects a legacy row stored under another owner's key", async () => {
    const foreign = checkpoint({ ownerId: "other-creator", instructions: "Another owner's private words" });
    fake.seedVersionOne([]);
    fake.databases.get("vidra-workflow-v2")?.stores.get("drafts")?.records.set(JSON.stringify(["creator", "project_one", "draft_one"]), foreign);
    await expect(tab().get("creator", "project_one", "draft_one")).rejects.toThrow("different scope");
  });

  it("keeps submission checkpoints per owner and rejects one whose identity differs from its command", async () => {
    const store = tab();
    await store.saveSubmission(submission("creator", "submission_one"));
    await store.saveSubmission(submission("creator", "submission_one", "accepted"));
    await store.saveSubmission(submission("other-creator", "submission_two"));
    expect(await store.submissions("creator")).toEqual([submission("creator", "submission_one", "accepted")]);
    const mismatched = { ...submission("creator", "submission_three"), submissionId: submission("creator", "submission_four").submissionId };
    await expect(store.saveSubmission(mismatched)).rejects.toThrow("immutable command");
  });
});

describe("DraftCheckpointStore retention", () => {
  it("returns every copy, legacy draft and submission for exactly one owner, excluding owners sharing a prefix", async () => {
    fake.seedVersionOne([checkpoint({ draftId: "draft_legacy" })]);
    const store = tab();
    await store.save(checkpoint({ instructions: "Copy words" }));
    await tab().save(checkpoint({ projectId: "project_two" }));
    await store.save(checkpoint({ ownerId: "creator2", instructions: "Prefix owner's private words" }));
    await store.saveSubmission(submission("creator", "submission_one"));
    await store.saveSubmission(submission("creator2", "submission_two"));
    const retained = await store.retention("creator");
    expect(retained.drafts.map(draft => `${draft.projectId}/${draft.draftId}`).sort()).toEqual(["project_one/draft_legacy", "project_one/draft_one", "project_two/draft_one"]);
    expect(JSON.stringify(retained)).not.toContain("Prefix owner's private words");
    expect(retained.submissions.map(item => item.submissionId)).toEqual(["submission_one"]);
  });

  it("rejects an invalid owner id before opening device storage", async () => {
    await expect(tab().retention("creator/other")).rejects.toThrow();
    expect(fake.connections).toHaveLength(0);
  });
});

describe("DraftCheckpointStore connection lifecycle", () => {
  it("reports unavailable device storage so the creator can save elsewhere", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(tab().save(checkpoint())).rejects.toThrow("Device storage is unavailable");
  });

  it("reports a blocked upgrade and opens normally on the next attempt", async () => {
    fake.blockNextOpen = true;
    const store = tab();
    await expect(store.list("creator", "project_one")).rejects.toThrow("Another window is blocking device storage");
    await store.save(checkpoint());
    expect(await store.list("creator", "project_one")).toHaveLength(1);
  });

  it("reuses one connection, closes it on request and on a version change, then reopens", async () => {
    const store = tab();
    await store.save(checkpoint());
    await store.list("creator", "project_one");
    expect(fake.connections).toHaveLength(1);
    store.close();
    await vi.waitFor(() => expect(fake.connections[0]?.closed).toBe(true));
    expect(await store.list("creator", "project_one")).toHaveLength(1);
    expect(fake.connections).toHaveLength(2);
    fake.connections[1]?.onversionchange?.();
    expect(fake.connections[1]?.closed).toBe(true);
    expect(await store.list("creator", "project_one")).toHaveLength(1);
    expect(fake.connections).toHaveLength(3);
  });
});
