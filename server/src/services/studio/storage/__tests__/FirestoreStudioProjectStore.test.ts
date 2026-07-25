import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioTurnRecord } from "@services/studio/types";

type StoreRecord = Record<string, unknown>;

/**
 * Path-keyed in-memory Firestore fake with buffered transactions: writes
 * inside runTransaction apply only when the callback resolves, so the
 * "cap exceeded writes nothing" contract is actually exercised.
 */
const mocks = vi.hoisted(() => ({
  records: new Map<string, StoreRecord>(),
  orderByPaths: [] as string[],
}));

type FakeDocRef = {
  path: string;
  get: () => Promise<{ exists: boolean; data: () => StoreRecord | undefined }>;
  set: (data: StoreRecord, options?: { merge?: boolean }) => Promise<void>;
  delete: () => Promise<void>;
  collection: (name: string) => FakeCollectionRef;
};

type FakeCollectionRef = {
  doc: (id: string) => FakeDocRef;
  where: (field: string, op: string, value: unknown) => FakeQuery;
  orderBy: (field: string, direction?: string) => FakeQuery;
  limit: (n: number) => FakeQuery;
};

type FakeQuery = {
  where: (field: string, op: string, value: unknown) => FakeQuery;
  orderBy: (field: string, direction?: string) => FakeQuery;
  limit: (n: number) => FakeQuery;
  get: () => Promise<{
    empty: boolean;
    size: number;
    docs: Array<{ id: string; data: () => StoreRecord; ref: FakeDocRef }>;
  }>;
};

function applySet(
  path: string,
  data: StoreRecord,
  options?: { merge?: boolean },
): void {
  const current = mocks.records.get(path);
  if (options?.merge && current) {
    mocks.records.set(path, { ...current, ...data });
    return;
  }
  mocks.records.set(path, { ...data });
}

function isDirectChild(parentPath: string, key: string): boolean {
  if (!key.startsWith(`${parentPath}/`)) return false;
  return !key.slice(parentPath.length + 1).includes("/");
}

function makeQuery(
  collectionPath: string,
  filters: Array<[string, unknown]>,
  order?: { field: string; direction: string },
  limitCount?: number,
): FakeQuery {
  return {
    where: (field, _op, value) =>
      makeQuery(
        collectionPath,
        [...filters, [field, value]],
        order,
        limitCount,
      ),
    orderBy: (field, direction = "asc") =>
      makeQuery(collectionPath, filters, { field, direction }, limitCount),
    limit: (n) => makeQuery(collectionPath, filters, order, n),
    get: async () => {
      let rows = [...mocks.records.entries()]
        .filter(([key]) => isDirectChild(collectionPath, key))
        .map(([key, value]) => ({
          id: key.slice(collectionPath.length + 1),
          value,
        }))
        .filter(({ value }) =>
          filters.every(([field, expected]) => value[field] === expected),
        );
      if (order) {
        const { field, direction } = order;
        rows = rows.sort((a, b) => {
          const av = a.value[field] as number;
          const bv = b.value[field] as number;
          return direction === "desc" ? bv - av : av - bv;
        });
      }
      if (limitCount !== undefined) rows = rows.slice(0, limitCount);
      return {
        empty: rows.length === 0,
        size: rows.length,
        docs: rows.map(({ id, value }) => ({
          id,
          data: () => ({ ...value }),
          ref: makeDocRef(`${collectionPath}/${id}`),
        })),
      };
    },
  };
}

function makeDocRef(path: string): FakeDocRef {
  return {
    path,
    get: async () => {
      const data = mocks.records.get(path);
      return {
        exists: Boolean(data),
        data: () => (data ? { ...data } : undefined),
      };
    },
    set: async (data, options) => applySet(path, data, options),
    delete: async () => {
      mocks.records.delete(path);
    },
    collection: (name) => makeCollectionRef(`${path}/${name}`),
  };
}

function makeCollectionRef(path: string): FakeCollectionRef {
  return {
    doc: (id) => makeDocRef(`${path}/${id}`),
    where: (field, _op, value) => makeQuery(path, [[field, value]]),
    orderBy: (field, direction = "asc") => {
      mocks.orderByPaths.push(path);
      return makeQuery(path, [], { field, direction });
    },
    limit: (n) => makeQuery(path, [], undefined, n),
  };
}

vi.mock("@infrastructure/firebaseAdmin", () => ({
  getFirestore: () => ({
    collection: (name: string) => makeCollectionRef(name),
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        delete: (ref: FakeDocRef) => {
          ops.push(() => {
            mocks.records.delete(ref.path);
          });
        },
        commit: async () => {
          ops.forEach((op) => op());
        },
      };
    },
    runTransaction: async (
      fn: (tx: {
        get: (ref: FakeDocRef) => ReturnType<FakeDocRef["get"]>;
        set: (
          ref: FakeDocRef,
          data: StoreRecord,
          options?: { merge?: boolean },
        ) => void;
      }) => Promise<unknown>,
    ) => {
      const bufferedWrites: Array<() => void> = [];
      const tx = {
        get: (ref: FakeDocRef) => ref.get(),
        set: (
          ref: FakeDocRef,
          data: StoreRecord,
          options?: { merge?: boolean },
        ) => {
          bufferedWrites.push(() => applySet(ref.path, data, options));
        },
      };
      const result = await fn(tx);
      bufferedWrites.forEach((write) => write());
      return result;
    },
  }),
}));

import {
  FirestoreStudioProjectStore,
  StudioCapExceededError,
  studioUsageDayKey,
} from "../FirestoreStudioProjectStore";

const makeTurn = (
  overrides: Partial<StudioTurnRecord> = {},
): StudioTurnRecord => ({
  id: "turn-1",
  projectId: "project-1",
  userId: "user-1",
  status: "running",
  userMessage: "a logo for Vidra",
  decision: {
    action: "generate",
    basePrompt: "a logo for Vidra",
    variants: ["v1", "v2", "v3", "v4"],
    capability: "design",
    suggestions: ["s1", "s2", "s3"],
  },
  resolvedModel: "recraft-v4.1",
  calls: [],
  reservedCents: 16,
  refundedCents: 0,
  createdAtMs: 1000,
  updatedAtMs: 1000,
  ...overrides,
});

describe("FirestoreStudioProjectStore", () => {
  let store: FirestoreStudioProjectStore;
  const DAY = "2026-07-24";

  beforeEach(() => {
    mocks.records.clear();
    mocks.orderByPaths.length = 0;
    store = new FirestoreStudioProjectStore();
  });

  describe("studioUsageDayKey", () => {
    it("uses the UTC calendar day", () => {
      expect(studioUsageDayKey(new Date("2026-07-24T23:59:59Z"))).toBe(
        "2026-07-24",
      );
      expect(studioUsageDayKey(new Date("2026-07-25T00:00:01Z"))).toBe(
        "2026-07-25",
      );
    });
  });

  describe("reserveTurn", () => {
    it("reserves the turn cost and persists the turn in one transaction", async () => {
      await store.reserveTurn({ turn: makeTurn(), day: DAY, capCents: 500 });

      expect(await store.getReservedCents("user-1", DAY)).toBe(16);
      const turn = await store.getTurn("project-1", "turn-1");
      expect(turn?.status).toBe("running");
      expect(turn?.reservedCents).toBe(16);
    });

    it("allows a reservation that lands exactly on the cap", async () => {
      await store.reserveTurn({
        turn: makeTurn({ reservedCents: 84 }),
        day: DAY,
        capCents: 100,
      });
      await store.reserveTurn({
        turn: makeTurn({ id: "turn-2", reservedCents: 16 }),
        day: DAY,
        capCents: 100,
      });

      expect(await store.getReservedCents("user-1", DAY)).toBe(100);
    });

    it("rejects a reservation that would exceed the cap and writes NOTHING", async () => {
      await store.reserveTurn({
        turn: makeTurn({ reservedCents: 85 }),
        day: DAY,
        capCents: 100,
      });

      await expect(
        store.reserveTurn({
          turn: makeTurn({ id: "turn-2", reservedCents: 16 }),
          day: DAY,
          capCents: 100,
        }),
      ).rejects.toBeInstanceOf(StudioCapExceededError);

      // The failed reservation left no trace: counter unchanged, no turn doc.
      expect(await store.getReservedCents("user-1", DAY)).toBe(85);
      expect(await store.getTurn("project-1", "turn-2")).toBeNull();
    });

    it("double-submit against a nearly-exhausted cap: exactly one passes", async () => {
      // Serial equivalent of the concurrent-submit gate: the second
      // reservation reads the first one's committed counter and fails.
      // (Under real concurrency Firestore retries one transaction against
      // the updated counter, reducing to this serial case.)
      const cap = 20;
      await store.reserveTurn({
        turn: makeTurn({ reservedCents: 16 }),
        day: DAY,
        capCents: cap,
      });

      await expect(
        store.reserveTurn({
          turn: makeTurn({ id: "turn-2", reservedCents: 16 }),
          day: DAY,
          capCents: cap,
        }),
      ).rejects.toBeInstanceOf(StudioCapExceededError);

      expect(await store.getReservedCents("user-1", DAY)).toBe(16);
    });

    it("scopes the counter per user and per day", async () => {
      await store.reserveTurn({ turn: makeTurn(), day: DAY, capCents: 100 });
      await store.reserveTurn({
        turn: makeTurn({ id: "turn-2", userId: "user-2" }),
        day: DAY,
        capCents: 100,
      });
      await store.reserveTurn({
        turn: makeTurn({ id: "turn-3" }),
        day: "2026-07-25",
        capCents: 100,
      });

      expect(await store.getReservedCents("user-1", DAY)).toBe(16);
      expect(await store.getReservedCents("user-2", DAY)).toBe(16);
      expect(await store.getReservedCents("user-1", "2026-07-25")).toBe(16);
    });
  });

  describe("saveTurn", () => {
    it("persists a terminal conversational turn without touching the usage counter", async () => {
      await store.saveTurn(
        makeTurn({
          status: "complete",
          decision: {
            action: "clarify",
            questions: [{ text: "What is it for?", quickPicks: ["A", "B"] }],
          },
          resolvedModel: undefined,
          reservedCents: 0,
        }),
      );

      const turn = await store.getTurn("project-1", "turn-1");
      expect(turn?.status).toBe("complete");
      expect(turn?.reservedCents).toBe(0);
      // Firestore rejects undefined values; the optional field is omitted.
      expect(turn && "resolvedModel" in turn).toBe(false);
      // No usage doc was created — the cap counter is untouched.
      expect(await store.getReservedCents("user-1", DAY)).toBe(0);
    });
  });

  describe("deleteProject", () => {
    it("removes the project doc and every turn in its subcollection", async () => {
      await store.createProject({
        id: "project-1",
        userId: "user-1",
        title: "Fox Logo",
        createdAtMs: 1,
        updatedAtMs: 1,
      });
      await store.saveTurn(makeTurn({ id: "turn-1" }));
      await store.saveTurn(makeTurn({ id: "turn-2" }));

      await store.deleteProject("project-1");

      expect(await store.getProject("project-1")).toBeNull();
      expect(await store.getTurn("project-1", "turn-1")).toBeNull();
      expect(await store.getTurn("project-1", "turn-2")).toBeNull();
    });

    it("leaves other projects and their turns untouched", async () => {
      await store.createProject({
        id: "project-1",
        userId: "user-1",
        title: "Doomed",
        createdAtMs: 1,
        updatedAtMs: 1,
      });
      await store.createProject({
        id: "project-2",
        userId: "user-1",
        title: "Kept",
        createdAtMs: 2,
        updatedAtMs: 2,
      });
      await store.saveTurn(makeTurn({ id: "turn-1", projectId: "project-1" }));
      await store.saveTurn(makeTurn({ id: "turn-2", projectId: "project-2" }));

      await store.deleteProject("project-1");

      expect((await store.getProject("project-2"))?.title).toBe("Kept");
      expect(await store.getTurn("project-2", "turn-2")).not.toBeNull();
    });
  });

  describe("refundCents", () => {
    it("returns refunded cents to the counter", async () => {
      await store.reserveTurn({ turn: makeTurn(), day: DAY, capCents: 100 });
      await store.refundCents("user-1", DAY, 4);
      expect(await store.getReservedCents("user-1", DAY)).toBe(12);
    });

    it("floors at zero", async () => {
      await store.refundCents("user-1", DAY, 50);
      expect(await store.getReservedCents("user-1", DAY)).toBe(0);
    });

    it("ignores non-positive refunds", async () => {
      await store.reserveTurn({ turn: makeTurn(), day: DAY, capCents: 100 });
      await store.refundCents("user-1", DAY, 0);
      expect(await store.getReservedCents("user-1", DAY)).toBe(16);
    });
  });

  describe("finalizeTurn", () => {
    it("applies the terminal patch in one write", async () => {
      await store.reserveTurn({ turn: makeTurn(), day: DAY, capCents: 100 });

      await store.finalizeTurn("project-1", "turn-1", {
        status: "partial",
        calls: [
          {
            index: 0,
            status: "succeeded",
            image: {
              id: "img-1",
              storagePath: "users/user-1/previews/images/x.webp",
              sourcePrompt: "v1",
              model: "recraft-v4.1",
            },
          },
          { index: 1, status: "failed", error: "timed out" },
        ],
        refundedCents: 4,
        updatedAtMs: 2000,
      });

      const turn = await store.getTurn("project-1", "turn-1");
      expect(turn?.status).toBe("partial");
      expect(turn?.calls).toHaveLength(2);
      expect(turn?.refundedCents).toBe(4);
      // Untouched fields survive the merge.
      expect(turn?.userMessage).toBe("a logo for Vidra");
    });
  });

  describe("listTurns", () => {
    it("returns a project's turns oldest-first", async () => {
      await store.reserveTurn({
        turn: makeTurn({ id: "turn-2", createdAtMs: 2000 }),
        day: DAY,
        capCents: 500,
      });
      await store.reserveTurn({
        turn: makeTurn({ id: "turn-1", createdAtMs: 1000 }),
        day: DAY,
        capCents: 500,
      });

      const turns = await store.listTurns("project-1");
      expect(turns.map((t) => t.id)).toEqual(["turn-1", "turn-2"]);
    });

    it("returns an empty list for a project with no turns", async () => {
      expect(await store.listTurns("empty-project")).toEqual([]);
    });
  });

  describe("projects", () => {
    it("round-trips a project record", async () => {
      await store.createProject({
        id: "project-1",
        userId: "user-1",
        title: "Logo for Vidra",
        createdAtMs: 1,
        updatedAtMs: 1,
      });

      const project = await store.getProject("project-1");
      expect(project?.title).toBe("Logo for Vidra");
      expect(await store.getProject("missing")).toBeNull();
    });

    it("omits undefined optional fields instead of writing them", async () => {
      await store.createProject({
        id: "project-1",
        userId: "user-1",
        title: "Untitled",
        pinnedModel: undefined,
        createdAtMs: 1,
        updatedAtMs: 1,
      });

      const raw = mocks.records.get("studio_projects/project-1");
      expect(raw).toBeDefined();
      expect(Object.keys(raw ?? {})).not.toContain("pinnedModel");
    });

    it("regression: listProjects never uses orderBy — the userId==+orderBy shape demands a composite Firestore index (FAILED_PRECONDITION, live 2026-07-24)", async () => {
      await store.createProject({
        id: "p1",
        userId: "user-1",
        title: "A",
        createdAtMs: 1,
        updatedAtMs: 1,
      });
      await store.listProjects("user-1");
      expect(mocks.orderByPaths).not.toContain("studio_projects");
    });

    it("lists a user's projects newest-first", async () => {
      await store.createProject({
        id: "old",
        userId: "user-1",
        title: "Old",
        createdAtMs: 1,
        updatedAtMs: 1,
      });
      await store.createProject({
        id: "new",
        userId: "user-1",
        title: "New",
        createdAtMs: 2,
        updatedAtMs: 2,
      });
      await store.createProject({
        id: "other",
        userId: "user-2",
        title: "Other",
        createdAtMs: 3,
        updatedAtMs: 3,
      });

      const projects = await store.listProjects("user-1");
      expect(projects.map((p) => p.id)).toEqual(["new", "old"]);
    });
  });
});
