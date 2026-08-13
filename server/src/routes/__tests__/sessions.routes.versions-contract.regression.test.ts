import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createSessionRoutes } from "../sessions.routes";
import type { SessionService } from "@services/sessions/SessionService";

/**
 * Regression: `version.generations` has two writers and one shape.
 *
 * The client PATCHes its whole versions array here; processVideoJob's
 * `appendGenerationToVersion` writes into the same array from the worker. This
 * route used to accept `z.array(z.record(z.string(), z.unknown()))` — any
 * object at all — so nothing on the wire said what a persisted take is, and the
 * route had to cast its way to the service's type.
 *
 * A take record stays an open bag (`SessionGenerationRecordSchema` passes
 * extras through, and the UI reads several opportunistically), but the lineage
 * fields the space depends on are validated rather than assumed.
 */
const SESSION_DTO = { id: "session-1", userId: "user-1", name: "Test session" };

const buildService = (): {
  service: SessionService;
  updateVersionsForUser: ReturnType<typeof vi.fn>;
} => {
  const updateVersionsForUser = vi.fn(async () => ({ ...SESSION_DTO }));
  const service = {
    getSession: vi.fn(async () => ({ ...SESSION_DTO })),
    updateVersionsForUser,
    toDto: vi.fn(() => ({ ...SESSION_DTO })),
  } as unknown as SessionService;
  return { service, updateVersionsForUser };
};

const buildApp = (service: SessionService): express.Express => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as express.Request & { user?: { uid?: string } }).user = {
      uid: "user-1",
    };
    next();
  });
  app.use("/sessions", createSessionRoutes(service, null, null));
  return app;
};

const versionWith = (generations: unknown[]): Record<string, unknown> => ({
  versionId: "v-1",
  signature: "sig",
  prompt: "a dancer in the rain",
  timestamp: "2026-08-12T00:00:00.000Z",
  generations,
});

describe("regression: PATCH /sessions/:id/versions validates the take record", () => {
  it("keeps the lineage fields and passes unmodelled fields through", async () => {
    const { service, updateVersionsForUser } = buildService();
    const response = await request(buildApp(service))
      .patch("/sessions/session-1/versions")
      .send({
        versions: [
          versionWith([
            {
              id: "gen-clip-1",
              ancestorGenerationId: "gen-pic-1",
              archived: false,
              // Not in the record schema — the UI reads these opportunistically
              // and they must survive the round trip.
              mediaType: "video",
              thumbnailUrl: "https://img/last.webp",
            },
          ]),
        ],
      });

    expect(response.status).toBe(200);
    const [, , update] = updateVersionsForUser.mock.calls[0] as [
      string,
      string,
      { versions: Array<{ generations: Array<Record<string, unknown>> }> },
    ];
    const record = update.versions[0]!.generations[0]!;
    expect(record.ancestorGenerationId).toBe("gen-pic-1");
    expect(record.mediaType).toBe("video");
    expect(record.thumbnailUrl).toBe("https://img/last.webp");
  });

  it("rejects a lineage field of the wrong type instead of storing it", async () => {
    const { service, updateVersionsForUser } = buildService();
    const response = await request(buildApp(service))
      .patch("/sessions/session-1/versions")
      .send({
        versions: [versionWith([{ id: "gen-1", ancestorGenerationId: 42 }])],
      });

    expect(response.status).toBe(400);
    expect(updateVersionsForUser).not.toHaveBeenCalled();
  });

  it("saves a legacy entry that is missing entry-level fields", async () => {
    // The client sends back whatever it read, and normalizePersistedVersions
    // guarantees no particular entry field. Validating the entry would let one
    // old version reject the whole save.
    const { service, updateVersionsForUser } = buildService();
    const response = await request(buildApp(service))
      .patch("/sessions/session-1/versions")
      .send({ versions: [{ versionId: "v-old", generations: [] }] });

    expect(response.status).toBe(200);
    expect(updateVersionsForUser).toHaveBeenCalled();
  });

  it("keeps version-level fields it does not model", async () => {
    const { service, updateVersionsForUser } = buildService();
    await request(buildApp(service))
      .patch("/sessions/session-1/versions")
      .send({
        versions: [{ ...versionWith([]), somethingNewer: { kept: true } }],
      });

    const [, , update] = updateVersionsForUser.mock.calls[0] as [
      string,
      string,
      { versions: Array<Record<string, unknown>> },
    ];
    expect(update.versions[0]!.somethingNewer).toEqual({ kept: true });
  });
});
