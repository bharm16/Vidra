import { beforeEach, expect, it, vi } from "vitest";
import { ShareRecordSchema } from "../types";

const state = vi.hoisted(() => ({ rows: new Map<string, unknown>(), create: vi.fn() }));
vi.mock("@infrastructure/firebaseAdmin", () => ({ getFirestore: () => ({ collection: () => ({ doc: (id: string) => ({
  get: async () => ({ exists: state.rows.has(id), data: () => state.rows.get(id) }),
  create: async (data: unknown) => { state.create(data); state.rows.set(id, data); },
}) }) }) }));
import { ShareStore } from "../ShareStore";

const id = "1341c9ed-ea51-4b5a-a30c-1b17e677782d";
const record = () => ShareRecordSchema.parse({ schemaVersion: "public-clip/v2", shareId: id, ownerId: "owner", sessionId: "s1", generationId: "g1", storagePath: "users/owner/generations/clip.mp4", description: "A clip", model: null, createdAt: "2026-10-23T00:00:00.000Z", resource: { kind: "owner-path" } });
beforeEach(() => { state.rows.clear(); state.create.mockClear(); });

it("persists issuer and resource provenance with a new immutable grant", async () => {
  const store = new ShareStore();
  await store.save(record());
  expect(state.create).toHaveBeenCalledWith(record());
  expect(await store.get(id)).toEqual(record());
});

it("refuses old unproven rows and rows whose identity disagrees with their address", async () => {
  const store = new ShareStore();
  state.rows.set(id, { storagePath: "users/owner/generations/clip.mp4", description: "Old share", model: null, createdAt: "2026-10-23T00:00:00.000Z" });
  expect(await store.get(id)).toBeNull();
  state.rows.set(id, { ...record(), shareId: "2341c9ed-ea51-4b5a-a30c-1b17e677782d" });
  expect(await store.get(id)).toBeNull();
});

it.each(["api-key:retired-test-secret", `api-key:v1:${"a".repeat(64)}`, "api-key-v1:not-a-principal"])("refuses unsafe API-key owners even in rows claiming the new grant schema", async ownerId => {
  const store = new ShareStore();
  state.rows.set(id, { ...record(), ownerId, storagePath: `users/${ownerId}/generations/clip.mp4` });
  expect(await store.get(id)).toBeNull();
});
