import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionRecord } from "../types";
import type { ContinuitySession } from "@server/domain/continuity/types";

type StoreRecord = Record<string, unknown>;
type QueryFilter = { field: string; operator: "=="; value: unknown };

const getValue = (record: StoreRecord, path: string): unknown =>
  path.split(".").reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, record);

const applyPatch = (current: StoreRecord, patch: StoreRecord): StoreRecord => {
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (
      (value as { _methodName?: string } | undefined)?._methodName ===
      "FieldValue.serverTimestamp"
    ) {
      next[key] = Date.now();
      continue;
    }
    next[key] = value;
  }
  return next;
};

const mocks = vi.hoisted(() => ({
  records: new Map<string, StoreRecord>(),
  serverTimestamp: vi.fn(() => ({ _methodName: "FieldValue.serverTimestamp" })),
}));

const createDocRef = (id: string) => ({
  id,
  get: async () => {
    const record = mocks.records.get(id);
    return {
      exists: Boolean(record),
      data: () => (record ? { ...record } : undefined),
    };
  },
  set: async (data: StoreRecord, options?: { merge?: boolean }) => {
    const current = mocks.records.get(id);
    if (options?.merge && current) {
      mocks.records.set(id, applyPatch(current, data));
      return;
    }
    mocks.records.set(id, applyPatch({}, data));
  },
  delete: async () => {
    mocks.records.delete(id);
  },
});

const createQuery = (
  filters: QueryFilter[] = [],
  orderField?: string,
  orderDirection: "asc" | "desc" = "asc",
  limitCount?: number,
) => ({
  where: (field: string, operator: "==", value: unknown) =>
    createQuery(
      [...filters, { field, operator, value }],
      orderField,
      orderDirection,
      limitCount,
    ),
  orderBy: (field: string, direction: "asc" | "desc" = "asc") =>
    createQuery(filters, field, direction, limitCount),
  limit: (count: number) =>
    createQuery(filters, orderField, orderDirection, count),
  get: async () => {
    const entries = Array.from(mocks.records.entries())
      .filter(([, record]) =>
        filters.every(
          (filter) => getValue(record, filter.field) === filter.value,
        ),
      )
      .sort((a, b) => {
        if (!orderField) return 0;
        const av = Number(getValue(a[1], orderField) ?? 0);
        const bv = Number(getValue(b[1], orderField) ?? 0);
        return orderDirection === "asc" ? av - bv : bv - av;
      });

    const sliced =
      typeof limitCount === "number" ? entries.slice(0, limitCount) : entries;
    const docs = sliced.map(([id, record]) => ({
      id,
      data: () => ({ ...record }),
    }));

    return {
      empty: docs.length === 0,
      docs,
    };
  },
});

vi.mock("@infrastructure/firebaseAdmin", () => ({
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: mocks.serverTimestamp,
      },
    },
  },
  getFirestore: () => ({
    collection: (name: string) => {
      if (name !== "sessions") {
        throw new Error(`Unexpected collection: ${name}`);
      }
      return {
        doc: (id: string) => createDocRef(id),
        where: (field: string, operator: "==", value: unknown) =>
          createQuery([{ field, operator, value }]),
      };
    },
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        get: (docRef: ReturnType<typeof createDocRef>) => docRef.get(),
        set: (
          docRef: ReturnType<typeof createDocRef>,
          data: StoreRecord,
          options?: { merge?: boolean },
        ) => docRef.set(data, options),
      };
      // Real Firestore resolves runTransaction to the callback's return value;
      // `mutate` and `createIfAbsent` depend on it (only `save` returns void).
      return fn(tx);
    },
  }),
}));

import { SessionStore } from "../SessionStore";

const buildContinuity = (): ContinuitySession => ({
  id: "session-1",
  userId: "user-1",
  name: "Session",
  primaryStyleReference: {
    id: "style-1",
    sourceVideoId: "video-1",
    sourceFrameIndex: 0,
    frameUrl: "https://example.com/style.png",
    frameTimestamp: 0,
    resolution: { width: 1920, height: 1080 },
    aspectRatio: "16:9",
    extractedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  shots: [],
  defaultSettings: {
    generationMode: "continuity",
    defaultContinuityMode: "frame-bridge",
    defaultStyleStrength: 0.6,
    defaultModel:
      "model-a" as ContinuitySession["defaultSettings"]["defaultModel"],
    autoExtractFrameBridge: false,
    useCharacterConsistency: false,
  },
  status: "active",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
});

const buildRecord = (
  overrides: Partial<SessionRecord> = {},
): SessionRecord => ({
  id: "session-1",
  userId: "user-1",
  status: "active",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

describe("SessionStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.records.clear();
  });

  it("saves new sessions and merges updates for existing sessions", async () => {
    const store = new SessionStore();
    const created = buildRecord({ name: "First", promptUuid: "prompt-1" });

    await store.save(created);
    expect(mocks.records.get(created.id)?.name).toBe("First");

    await store.save(
      buildRecord({
        id: created.id,
        name: "Updated",
        promptUuid: "prompt-1",
        updatedAt: new Date("2026-01-01T00:00:10.000Z"),
      }),
    );

    expect(mocks.records.get(created.id)?.name).toBe("Updated");
  });

  it("gets records by id and returns null when missing", async () => {
    const store = new SessionStore();
    const record = buildRecord({ name: "Stored" });
    await store.save(record);

    await expect(store.get(record.id)).resolves.toMatchObject({
      id: record.id,
      name: "Stored",
    });
    await expect(store.get("missing")).resolves.toBeNull();
  });

  it("finds by user and by prompt UUID", async () => {
    const store = new SessionStore();

    await store.save(
      buildRecord({ id: "s-1", userId: "user-1", promptUuid: "p-1" }),
    );
    await store.save(
      buildRecord({ id: "s-2", userId: "user-1", promptUuid: "p-2" }),
    );
    await store.save(
      buildRecord({ id: "s-3", userId: "user-2", promptUuid: "p-1" }),
    );

    const byUser = await store.findByUser("user-1", 10);
    const byPrompt = await store.findByPromptUuid("user-1", "p-2");

    expect(byUser).toHaveLength(2);
    expect(new Set(byUser.map((s) => s.id))).toEqual(new Set(["s-1", "s-2"]));
    expect(byPrompt?.id).toBe("s-2");
  });

  it("stores and retrieves continuity payloads and supports continuity user queries", async () => {
    const store = new SessionStore();
    const continuity = buildContinuity();

    await store.save(
      buildRecord({
        id: continuity.id,
        continuity,
        hasContinuity: true,
      }),
    );

    const fetched = await store.get(continuity.id);
    const byUser = await store.findContinuityByUser("user-1", 10);

    expect(fetched?.continuity?.id).toBe(continuity.id);
    expect(fetched?.hasContinuity).toBe(true);
    expect(byUser).toHaveLength(1);
    expect(byUser[0]?.continuity?.id).toBe(continuity.id);
  });

  it("deletes sessions", async () => {
    const store = new SessionStore();
    await store.save(buildRecord({ id: "delete-me" }));

    await store.delete("delete-me");

    expect(mocks.records.has("delete-me")).toBe(false);
  });

  it("createIfAbsent creates when the id is free and returns the existing row untouched when it is taken", async () => {
    const store = new SessionStore();
    const first = buildRecord({
      id: "det-1",
      name: "Original",
      promptUuid: "p-det",
    });

    const created = await store.createIfAbsent(first);
    expect(created.created).toBe(true);
    expect(mocks.records.get("det-1")?.name).toBe("Original");

    // A second create at the SAME deterministic id — a re-press or a race — does
    // not overwrite; it reports the row already there, so the first press's root
    // words-version (and the take filed under it) is never clobbered.
    const again = await store.createIfAbsent(
      buildRecord({ id: "det-1", name: "Rival", promptUuid: "p-det" }),
    );
    expect(again.created).toBe(false);
    expect(again.session.name).toBe("Original");
    expect(mocks.records.get("det-1")?.name).toBe("Original");
  });
});
