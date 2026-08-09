import { describe, it, expect, vi } from "vitest";
import { StudioService } from "../StudioService";
import { StudioModelRegistry } from "../StudioModelRegistry";
import type { FirestoreStudioProjectStore } from "../storage/FirestoreStudioProjectStore";
import type { StudioProjectRecord } from "../types";

/**
 * Regression: attachment registration validated ownership with a substring
 * test (`storagePath.includes(userId)`), so a caller `abc` was granted
 * `users/xabcy/…` — another user's prefix that merely contains their id.
 * The one real gate (the storage module's anchored check, reached through
 * getViewUrl) ran only AFTER the write and its 403 was swallowed, so the
 * foreign path was registered regardless.
 *
 * Invariant: a project only ever holds attachments whose storagePath is
 * anchored at the caller's own `users/<uid>/` prefix, and any path the
 * storage module refuses fails the request instead of persisting.
 */

const PROJECT: StudioProjectRecord = {
  id: "p1",
  userId: "abc",
  title: "Untitled",
  createdAtMs: 1,
  updatedAtMs: 1,
};

function makeService(overrides?: { getViewUrl?: ReturnType<typeof vi.fn> }) {
  const projects = new Map<string, StudioProjectRecord>([
    [PROJECT.id, { ...PROJECT }],
  ]);

  const store = {
    getProject: async (id: string) => projects.get(id) ?? null,
    updateProject: async (id: string, patch: Partial<StudioProjectRecord>) => {
      const current = projects.get(id);
      if (current) projects.set(id, { ...current, ...patch });
    },
    listTurns: async () => [],
  };

  const storage = {
    saveFromUrl: vi.fn(),
    getViewUrl:
      overrides?.getViewUrl ??
      vi.fn().mockImplementation((_userId: string, path: string) =>
        Promise.resolve({
          viewUrl: `https://signed.example.com/${path}`,
          expiresAt: "2026-07-25T00:00:00Z",
          storagePath: path,
        }),
      ),
  };

  let idCounter = 0;
  const service = new StudioService({
    store: store as unknown as FirestoreStudioProjectStore,
    registry: new StudioModelRegistry(),
    runner: { run: vi.fn() },
    storage,
    policy: { decideTurn: vi.fn() },
    dailyCapCents: 500,
    now: () => new Date("2026-07-24T12:00:00Z"),
    idFactory: () => `id-${++idCounter}`,
  });

  return { service, projects, storage };
}

describe("regression: attachment paths are owner-anchored, not owner-containing", () => {
  it("rejects a foreign prefix that merely contains the caller's id", async () => {
    const { service, projects, storage } = makeService();

    await expect(
      service.addAttachment("abc", "p1", {
        storagePath: "users/xabcy/previews/images/x.webp",
        filename: "x.webp",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    // Nothing was written, and the foreign path was never signed.
    expect(projects.get("p1")?.attachments).toBeUndefined();
    expect(storage.getViewUrl).not.toHaveBeenCalled();
  });

  it("accepts the caller's own prefix", async () => {
    const { service, projects } = makeService();

    const attachment = await service.addAttachment("abc", "p1", {
      storagePath: "users/abc/previews/images/x.webp",
      filename: "x.webp",
    });

    expect(attachment.storagePath).toBe("users/abc/previews/images/x.webp");
    expect(attachment.viewUrl).toContain("https://signed.example.com/");
    expect(projects.get("p1")?.attachments).toHaveLength(1);
  });

  it("fails the request — and persists nothing — when storage refuses the path", async () => {
    const forbidden = Object.assign(new Error("Unauthorized"), {
      statusCode: 403,
    });
    const { service, projects } = makeService({
      getViewUrl: vi.fn().mockRejectedValue(forbidden),
    });

    await expect(
      service.addAttachment("abc", "p1", {
        storagePath: "users/abc/previews/images/x.webp",
        filename: "x.webp",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(projects.get("p1")?.attachments).toBeUndefined();
  });
});
