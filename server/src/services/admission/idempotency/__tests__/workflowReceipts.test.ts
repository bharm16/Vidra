import { describe, expect, it, vi } from "vitest";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import {
  commitVideoExportReceiptInTransaction,
  recoverVideoExportReceiptInTransaction,
  workflowExecutionDraftKey,
  workflowReceiptId,
} from "@services/admission/idempotency/OperationIdentity";

type StoreRecord = Record<string, unknown>;

function createFakeFirestore() {
  const records = new Map<string, StoreRecord>();

  const makeDocRef = (path: string) => ({
    id: path.split("/").at(-1) ?? "",
    path,
    get: async () => {
      const data = records.get(path);
      return { id: path.split("/").at(-1) ?? "", exists: data !== undefined, data: () => data };
    },
    set: async (data: StoreRecord) => {
      records.set(path, { ...data });
    },
    create: async (data: StoreRecord) => {
      if (records.has(path)) throw new Error(`Document already exists: ${path}`);
      records.set(path, { ...data });
    },
    collection: (name: string) => makeCollectionRef(`${path}/${name}`),
  });

  const makeCollectionRef = (collectionPath: string) => ({
    doc: (id: string) => makeDocRef(`${collectionPath}/${id}`),
  });

  const database = {
    collection: (name: string) => makeCollectionRef(name),
    runTransaction: async <T>(fn: (tx: Transaction) => Promise<T>): Promise<T> => {
      const staged = new Map(records);
      const tx = {
        get: async (ref: { path: string }) => {
          const data = staged.get(ref.path);
          return {
            id: ref.path.split("/").at(-1) ?? "",
            exists: data !== undefined,
            data: () => data,
          };
        },
        set: (ref: { path: string }, data: StoreRecord) => {
          staged.set(ref.path, { ...data });
        },
        create: (ref: { path: string }, data: StoreRecord) => {
          if (staged.has(ref.path)) throw new Error(`Document already exists: ${ref.path}`);
          staged.set(ref.path, { ...data });
        },
      } as unknown as Transaction;
      const result = await fn(tx);
      records.clear();
      for (const [k, v] of staged.entries()) records.set(k, v);
      return result;
    },
  } as unknown as Firestore;

  return { database, records };
}

describe("workflowReceipts", () => {
  it("commits and recovers video-export receipts, backfilling a second tab's submission receipt and rejecting cross-kind collisions", async () => {
    const { database, records } = createFakeFirestore();
    const executionKey = workflowExecutionDraftKey("creator", "draft_export", 1);
    const exportId = `export_${executionKey}`;
    const payloadHash = "a".repeat(64);

    await database.runTransaction(async tx => {
      commitVideoExportReceiptInTransaction(database, tx, {
        ownerId: "creator",
        projectId: "project_1",
        editId: "edit_1",
        exportId,
        submissionId: "submission_tab_1",
        executionDraftId: "draft_export",
        executionDraftRevision: 1,
        payloadHash,
      });
    });

    const readExport = vi.fn(async (_tx: Transaction, resolvedId: string) => ({ id: resolvedId }));
    const recoveredFromSecondTab = await database.runTransaction(tx =>
      recoverVideoExportReceiptInTransaction(
        database,
        tx,
        {
          ownerId: "creator",
          projectId: "project_1",
          editId: "edit_1",
          submissionId: "submission_tab_2",
          executionDraftId: "draft_export",
          executionDraftRevision: 1,
          payloadHash,
        },
        readExport,
      ),
    );

    expect(recoveredFromSecondTab).toEqual({ id: exportId });
    expect(records.has(`request_idempotency/${workflowReceiptId("creator", "submission_tab_2")}`)).toBe(true);

    await expect(
      database.runTransaction(tx =>
        recoverVideoExportReceiptInTransaction(
          database,
          tx,
          {
            ownerId: "creator",
            projectId: "project_1",
            editId: "edit_1",
            submissionId: "submission_tab_2",
            executionDraftId: "draft_export",
            executionDraftRevision: 1,
            payloadHash: "b".repeat(64),
          },
          readExport,
        ),
      ),
    ).rejects.toMatchObject({ code: "submission_conflict" });
  });
});
