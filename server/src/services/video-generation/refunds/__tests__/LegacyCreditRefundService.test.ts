import { beforeEach, describe, expect, it, vi } from "vitest";
import { FirestoreCircuitExecutor } from "@services/firestore/FirestoreCircuitExecutor";
import { LegacyCreditRefundService } from "../LegacyCreditRefundService";

type Ref = {
  path: string;
  collection(name: string): { doc(id?: string): Ref };
};

const boundary = vi.hoisted(() => {
  const documents = new Map<string, Record<string, unknown>>();
  let sequence = 0;
  const collection = (name: string): { doc(id?: string): Ref } => ({
    doc: (id = `transaction-${++sequence}`): Ref => ({
      path: `${name}/${id}`,
      collection: (child) => collection(`${name}/${id}/${child}`),
    }),
  });
  const transaction = {
    get: async (ref: Ref): Promise<{ exists: boolean }> => ({
      exists: documents.has(ref.path),
    }),
    update: (ref: Ref, payload: Record<string, unknown>): void => {
      const previous = documents.get(ref.path) ?? {};
      const increment = payload.credits as { increment: number };
      documents.set(ref.path, {
        ...previous,
        ...payload,
        credits: Number(previous.credits ?? 0) + increment.increment,
      });
    },
    set: (ref: Ref, payload: Record<string, unknown>): void => {
      documents.set(ref.path, payload);
    },
  };
  return {
    documents,
    db: {
      collection,
      runTransaction: vi.fn(
        async (run: (tx: typeof transaction) => Promise<void>) =>
          run(transaction),
      ),
    },
  };
});

vi.mock("@infrastructure/firebaseAdmin", () => ({
  getFirestore: () => boundary.db,
  admin: {
    firestore: {
      FieldValue: {
        increment: (amount: number) => ({ increment: amount }),
        serverTimestamp: () => 123,
      },
    },
  },
}));

describe("legacy charged-job refund compatibility", () => {
  beforeEach(() => {
    boundary.documents.clear();
    boundary.db.runTransaction.mockClear();
  });

  it("replays an existing refund key without increasing the balance twice", async (): Promise<void> => {
    boundary.documents.set("users/creator", { credits: 3 });
    const service = new LegacyCreditRefundService(
      new FirestoreCircuitExecutor({ maxRetries: 0 }),
    );
    const options = { refundKey: "job-refund-1", reason: "terminal failure" };
    expect(await service.refundCredits("creator", 7, options)).toBe(true);
    expect(await service.refundCredits("creator", 7, options)).toBe(true);
    expect(boundary.documents.get("users/creator")?.credits).toBe(10);
    expect(boundary.documents.get("credit_refunds/job-refund-1")).toMatchObject(
      {
        userId: "creator",
        amount: 7,
        refundKey: "job-refund-1",
      },
    );
    const ledger = [...boundary.documents.entries()].filter(([key]) =>
      key.startsWith("users/creator/credit_transactions/"),
    );
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.[1]).toMatchObject({
      type: "refund",
      amount: 7,
      referenceId: "job-refund-1",
    });
  });

  it("refuses a missing legacy user without inventing a refund receipt", async (): Promise<void> => {
    const service = new LegacyCreditRefundService(
      new FirestoreCircuitExecutor({ maxRetries: 0 }),
    );
    expect(
      await service.refundCredits("missing", 7, { refundKey: "owed-refund" }),
    ).toBe(false);
    expect(boundary.documents.size).toBe(0);
  });

  it("does not access the ledger for zero-reservation generation", async (): Promise<void> => {
    const service = new LegacyCreditRefundService(
      new FirestoreCircuitExecutor({ maxRetries: 0 }),
    );
    expect(
      await service.refundCredits("creator", 0, { refundKey: "free-job" }),
    ).toBe(true);
    expect(boundary.db.runTransaction).not.toHaveBeenCalled();
  });
});
