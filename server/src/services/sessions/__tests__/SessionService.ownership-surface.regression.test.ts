import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { SessionRecord } from "../types";
import { SessionAccessDeniedError, SessionService } from "../SessionService";

/**
 * SessionService published six writes in pairs — `updateSession` beside
 * `updateSessionForUser`, `deleteSession` beside `deleteSessionForUser` — and
 * only the `…ForUser` half of each pair ran requireOwnedSession.
 *
 * The routes happened to call the right half, so nothing was exploitable. But
 * "only the owner writes a session" was expressed by half the surface, which is
 * to say it was not expressed by the interface at all: on a service reachable
 * from /api/sessions/*, one dropped suffix writes another user's session and
 * nothing in the types objects.
 *
 * The owner-less spellings had zero external production callers, so four became
 * private and the two with no callers at all — `updateOutput`, `deleteSession` —
 * were removed. This pins both halves of that: the behaviour, and the absence.
 *
 * `createPromptSession` is the deliberate exception. It addresses a session by
 * prompt-uuid rather than id, and its ownership guarantee lives in
 * SessionStore.findByPromptUuid's `where("userId", "==", userId)` — not on this
 * surface. Do not "complete" the list below with it.
 *
 * Seam: the store double is injected through the existing constructor, never
 * vi.mock'd. SessionStore's body is Firestore calls, which is the process-
 * external boundary; SessionService itself runs for real.
 */

const OWNER = "owner-user";
const INTRUDER = "intruder-user";
const SESSION_ID = "session-1";

const ownedRecord = (): SessionRecord => ({
  id: SESSION_ID,
  userId: OWNER,
  status: "active",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  prompt: {
    input: "in",
    output: "out",
    versions: [
      {
        versionId: "v1",
        signature: "sig-1",
        prompt: "in",
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    ],
  },
});

function createStore() {
  return {
    get: vi.fn().mockResolvedValue(ownedRecord()),
    save: vi.fn(async (record: SessionRecord) => record),
    delete: vi.fn().mockResolvedValue(undefined),
    findByPromptUuid: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
  };
}

/**
 * Every public write that addresses a session by id. Each is invoked as a user
 * who does not own the session.
 */
const OWNER_SCOPED_WRITES: ReadonlyArray<{
  name: string;
  call: (service: SessionService, userId: string) => Promise<unknown>;
}> = [
  {
    name: "updateSessionForUser",
    call: (s, u) => s.updateSessionForUser(u, SESSION_ID, { name: "renamed" }),
  },
  {
    name: "updatePromptForUser",
    call: (s, u) => s.updatePromptForUser(u, SESSION_ID, { input: "hijacked" }),
  },
  {
    name: "updateHighlightsForUser",
    call: (s, u) =>
      s.updateHighlightsForUser(u, SESSION_ID, {
        highlightCache: { spans: [{ start: 0, end: 4 }] },
      }),
  },
  {
    name: "updateOutputForUser",
    call: (s, u) =>
      s.updateOutputForUser(u, SESSION_ID, { output: "hijacked" }),
  },
  {
    name: "updateVersionsForUser",
    call: (s, u) => s.updateVersionsForUser(u, SESSION_ID, { versions: [] }),
  },
  {
    name: "deleteSessionForUser",
    call: (s, u) => s.deleteSessionForUser(u, SESSION_ID),
  },
  {
    name: "appendGenerationToVersion",
    call: (s, u) =>
      s.appendGenerationToVersion(u, SESSION_ID, "v1", { id: "g1" }),
  },
  {
    name: "archiveGeneration",
    call: (s, u) => s.archiveGeneration(u, SESSION_ID, "g1"),
  },
];

/** Writes that must not exist on the surface without an owner argument. */
const REMOVED_OWNERLESS_WRITES = [
  "updateSession",
  "updatePrompt",
  "updateHighlights",
  "updateVersions",
] as const;

const DELETED_OWNERLESS_WRITES = ["updateOutput", "deleteSession"] as const;

const SERVICE_SOURCE = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../SessionService.ts",
  ),
  "utf8",
);

describe("regression: session writes are owner-scoped by the interface", () => {
  it("covers every owner-scoped write the service publishes", () => {
    // A shrinking list would make the sweep below quietly weaker.
    expect(OWNER_SCOPED_WRITES.length).toBe(8);
  });

  it.each(OWNER_SCOPED_WRITES)(
    "$name refuses a user who does not own the session",
    async ({ call }) => {
      const store = createStore();
      const service = new SessionService(store as never);

      await expect(call(service, INTRUDER)).rejects.toBeInstanceOf(
        SessionAccessDeniedError,
      );
      expect(store.save).not.toHaveBeenCalled();
      expect(store.delete).not.toHaveBeenCalled();
    },
  );

  it.each(OWNER_SCOPED_WRITES)(
    "$name does not refuse the owner",
    async ({ call }) => {
      // Ownership only. Each verb's own outcome is covered by SessionService.test.ts;
      // asserting a full happy path here would couple this to every fixture shape.
      const store = createStore();
      const service = new SessionService(store as never);

      await call(service, OWNER).catch((error: unknown) => {
        expect(error).not.toBeInstanceOf(SessionAccessDeniedError);
      });
    },
  );

  // `private` is erased by esbuild, so the owner-less spellings are still
  // reachable at runtime and only `tsc` rejects them. The surface is a
  // compile-time fact, so it is asserted against the declaration.
  it.each(REMOVED_OWNERLESS_WRITES)(
    "declares %s private, so no caller can address a session without an owner",
    (method) => {
      expect(SERVICE_SOURCE).toContain(`private async ${method}(`);
      expect(SERVICE_SOURCE).not.toContain(`\n  async ${method}(`);
    },
  );

  it.each(DELETED_OWNERLESS_WRITES)(
    "no longer declares %s at all",
    (method) => {
      expect(SERVICE_SOURCE).not.toContain(`async ${method}(`);
    },
  );
});
