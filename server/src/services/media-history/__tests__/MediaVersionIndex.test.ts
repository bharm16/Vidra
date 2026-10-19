import { describe, expect, it } from "vitest";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { ProjectStore } from "@services/projects/ProjectStore";
import { MediaVersionIndex } from "../MediaVersionIndex";

type StoreRecord = Record<string, unknown>;

function createFakeFirestore() {
  const records = new Map<string, StoreRecord>();

  const isDirectChild = (parentPath: string, key: string): boolean => {
    if (!key.startsWith(`${parentPath}/`)) return false;
    return !key.slice(parentPath.length + 1).includes("/");
  };

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
    update: async (patch: StoreRecord) => {
      const current = records.get(path);
      if (!current) throw new Error(`Document not found: ${path}`);
      records.set(path, { ...current, ...patch });
    },
    collection: (name: string) => makeCollectionRef(`${path}/${name}`),
  });

  const makeQuery = (collectionPath: string, limitCount?: number) => ({
    limit: (n: number) => makeQuery(collectionPath, n),
    where: () => makeQuery(collectionPath, limitCount),
    get: async () => {
      const docs = [...records.entries()]
        .filter(([key]) => isDirectChild(collectionPath, key))
        .slice(0, limitCount ?? Infinity)
        .map(([key, value]) => ({
          id: key.split("/").at(-1) ?? "",
          data: () => value,
          ref: makeDocRef(key),
        }));
      return { empty: docs.length === 0, size: docs.length, docs };
    },
  });

  const makeCollectionRef = (collectionPath: string) => ({
    doc: (id: string) => makeDocRef(`${collectionPath}/${id}`),
    limit: (n: number) => makeQuery(collectionPath, n),
    where: () => makeQuery(collectionPath),
    get: async () => makeQuery(collectionPath).get(),
  });

  const database = {
    collection: (name: string) => makeCollectionRef(name),
    runTransaction: async <T>(fn: (tx: Transaction) => Promise<T>): Promise<T> => {
      const staged = new Map(records);
      let wrote = false;
      const tx = {
        get: async (target: { path?: string; get?: () => Promise<unknown> }) => {
          if (wrote) throw new Error("Firestore transactions require all reads before writes.");
          if (typeof target.path === "string") {
            const data = staged.get(target.path);
            return {
              id: target.path.split("/").at(-1) ?? "",
              exists: data !== undefined,
              data: () => data,
            };
          }
          if (typeof target.get === "function") {
            return target.get();
          }
          throw new Error("Unsupported transaction.get target");
        },
        set: (ref: { path: string }, data: StoreRecord) => {
          wrote = true;
          staged.set(ref.path, { ...data });
        },
        create: (ref: { path: string }, data: StoreRecord) => {
          wrote = true;
          if (staged.has(ref.path)) throw new Error(`Document already exists: ${ref.path}`);
          staged.set(ref.path, { ...data });
        },
        update: (ref: { path: string }, patch: StoreRecord) => {
          wrote = true;
          const current = staged.get(ref.path);
          if (!current) throw new Error(`Document not found: ${ref.path}`);
          staged.set(ref.path, { ...current, ...patch });
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

const verifiedImageObject = (id: string) => ({
  identity: "verified" as const,
  assetId: id,
  storagePath: `users/creator/previews/images/${id}.png`,
  generation: "1",
  sha256: "a".repeat(64),
  bytes: 128,
});

const verifiedImageMetadata = {
  state: "verified" as const,
  width: 64,
  height: 64,
  durationSeconds: 0,
  audio: "absent" as const,
  probeVersion: "test-probe",
};

describe("MediaVersionIndex", () => {
  it("publishes linked media into an active project and mirrors recovery media into creation_recovery when a project is trashed", async () => {
    const { database } = createFakeFirestore();
    const projects = new ProjectStore(database, () => "2026-10-19T00:00:00.000Z");
    const media = new MediaVersionIndex(database, projects);

    const activeProject = await projects.create("creator", { id: "project_active", name: "Active" });
    const trashedProject = await projects.create("creator", { id: "project_trashed", name: "Trashed" });
    const trashed = await projects.change("creator", "project_trashed", { expectedRevision: 1, status: "trashed" });

    const linkedVersion = await database.runTransaction(tx =>
      media.publishInTransaction(tx, activeProject, {
        id: "version_linked",
        ownerId: "creator",
        projectId: activeProject.id,
        kind: "image",
        label: "Linked upload",
        origin: { kind: "upload" },
        sourceInputs: [],
        object: verifiedImageObject("version_linked"),
        metadata: verifiedImageMetadata,
        createdAt: "2026-10-19T00:01:00.000Z",
      }),
    );

    expect(linkedVersion.association).toBe("linked");
    expect(await media.listRecoveries("creator")).toEqual([]);

    const recoveryVersion = await database.runTransaction(tx =>
      media.publishInTransaction(tx, trashed, {
        id: "version_recovered_sketch",
        ownerId: "creator",
        projectId: trashedProject.id,
        kind: "image",
        label: "Sketch picture",
        origin: { kind: "sketch-capture", captureId: "capture_1" },
        sourceInputs: [],
        object: verifiedImageObject("version_recovered_sketch"),
        metadata: verifiedImageMetadata,
        createdAt: "2026-10-19T00:02:00.000Z",
      }),
    );

    expect(recoveryVersion.association).toBe("recovery");
    expect(await media.listRecoveries("creator")).toEqual([recoveryVersion]);
  });

  it("changes media metadata and selects preferred versions within a related version family", async () => {
    const { database } = createFakeFirestore();
    const projects = new ProjectStore(database, () => "2026-10-19T00:00:00.000Z");
    const media = new MediaVersionIndex(database, projects);
    const project = await projects.create("creator", { id: "project_family", name: "Family" });

    const root = await database.runTransaction(tx =>
      media.publishInTransaction(tx, project, {
        id: "version_root",
        ownerId: "creator",
        projectId: project.id,
        kind: "image",
        label: "Root",
        origin: { kind: "upload" },
        sourceInputs: [],
        object: verifiedImageObject("version_root"),
        metadata: verifiedImageMetadata,
        createdAt: "2026-10-19T00:01:00.000Z",
      }),
    );
    const child = await database.runTransaction(tx =>
      media.publishInTransaction(tx, project, {
        id: "version_child",
        ownerId: "creator",
        projectId: project.id,
        kind: "image",
        label: "Child",
        origin: { kind: "generated", requestId: "request_1", slotId: "slot_1" },
        sourceInputs: [{ role: "primary", state: "resolved", versionId: root.id }],
        object: verifiedImageObject("version_child"),
        metadata: verifiedImageMetadata,
        createdAt: "2026-10-19T00:02:00.000Z",
      }),
    );

    const updated = await media.change("creator", project.id, child.id, {
      label: "Renamed child",
      favorite: true,
      hidden: true,
    });
    expect(updated).toMatchObject({
      id: child.id,
      label: "Renamed child",
      favorite: true,
      hidden: true,
    });

    const preferredFamily = await media.selectPreferred("creator", project.id, child.id);
    expect(preferredFamily.map(item => ({ id: item.id, preferred: item.preferred }))).toEqual([
      { id: "version_root", preferred: false },
      { id: "version_child", preferred: true },
    ]);
  });
});
