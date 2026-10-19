import { afterEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import express from "express";
import request from "supertest";
import { AccountUsageService } from "../AccountUsageService";
import { createAccountRoutes } from "@routes/account.routes";
import type { RequestWithUser } from "@middleware/intake";
import { closeLoopbackServers, listenOnLoopback } from "@config/__tests__/loopbackTestServer";

afterEach(closeLoopbackServers);

const now = new Date("2026-10-17T05:49:00Z");
const config = { studioCapCents: 500, sketchCapCents: 500, sketchFrameCostMillicents: 250 };
function fixture(options: { studio?: unknown; sketch?: unknown; rows?: Array<{ id: string; data: unknown }> } = {}): { database: Firestore; queryOwner: ReturnType<typeof vi.fn>; order: ReturnType<typeof vi.fn> } {
  const queryOwner = vi.fn().mockReturnThis();
  const order = vi.fn().mockReturnThis();
  const database = { collection: (name: string) => ({
    doc: (id: string) => ({ get: async () => {
      expect(id).toBe("creator_2026-10-17");
      const data = name === "studio_usage" ? options.studio : options.sketch;
      return { exists: data !== undefined, data: () => data };
    } }),
    where: queryOwner, orderBy: order,
    limit: vi.fn().mockReturnThis(),
    get: async () => ({ docs: (options.rows ?? []).map(row => ({ id: row.id, data: () => row.data })) }),
  }) } as unknown as Firestore;
  return { database, queryOwner, order };
}

describe("Account usage read model", () => {
  it("uses authenticated owner counters, real reset time and ordered owner history without writing", async () => {
    const { database, queryOwner, order } = fixture({ studio: { userId: "creator", day: "2026-10-17", reservedCents: 500 }, sketch: { userId: "creator", day: "2026-10-17", reservedMillicents: 499900 } });
    const usage = await new AccountUsageService(database, config, () => now).get("creator");
    expect(usage).toEqual({ resetAt: "2026-10-18T00:00:00.000Z", allowances: [{ kind: "studio", state: "reached" }, { kind: "sketch", state: "reached" }], requests: [] });
    expect(queryOwner).toHaveBeenCalledWith("ownerId", "==", "creator");
    expect(order).toHaveBeenCalledWith("acceptedAt", "desc");
  });
  it("projects exact accepted history outcomes and request destinations", async () => {
    const record = { schemaVersion: "vidra-workflow/v2", id: "request_picture", ownerId: "creator", projectId: "project_one", conversationId: "conversation_one", submissionId: "submission_picture", executionDraftId: "draft_one", executionDraftRevision: 1, acceptanceSequence: 1, snapshotHash: "a".repeat(64), snapshot: { action: "make-image", instructions: "Evening stadium", inputs: [], settings: { profileId: "free-image", profileRevision: "1", parameters: {}, outputCount: 1 }, context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId: "project_one", conversationId: "conversation_one" } }, materializedContext: { projectInstructions: "", entries: [] }, slots: [{ id: "slot_one", ordinal: 1, outcome: "completed", delivery: "ready", versionId: "version_one", usage: { mode: "free", reserved: 0, settled: 0 } }], acceptedAt: "2026-10-17T05:00:00.000Z" };
    const { database } = fixture({ rows: [{ id: record.id, data: record }] });
    const usage = await new AccountUsageService(database, config, () => now).get("creator");
    expect(usage.requests).toEqual([{ id: "request_picture", projectId: "project_one", conversationId: "conversation_one", label: "Evening stadium", acceptedAt: "2026-10-17T05:00:00.000Z", result: "ready" }]);
  });
  it("treats absent counters as unused but fails on malformed existing counters", async () => {
    expect((await new AccountUsageService(fixture().database, config, () => now).get("creator")).allowances.every(row => row.state === "available")).toBe(true);
    await expect(new AccountUsageService(fixture({ studio: { userId: "creator", day: "2026-10-17" } }).database, config, () => now).get("creator")).rejects.toThrow();
  });
  it("rejects foreign stored usage instead of exposing it", async () => {
    const { database } = fixture({ sketch: { userId: "other", day: "2026-10-17", reservedMillicents: 12 } });
    await expect(new AccountUsageService(database, config, () => now).get("creator")).rejects.toMatchObject({ code: "access_denied" });
  });
  it("rejects foreign history before decoding or disclosing private request words", async () => {
    const { database } = fixture({ rows: [{ id: "request_private", data: { id: "request_private", ownerId: "other", snapshot: { instructions: "private words" } } }] });
    await expect(new AccountUsageService(database, config, () => now).get("creator")).rejects.toMatchObject({ code: "access_denied" });
  });
});

describe("Account usage endpoint", () => {
  it("refuses unauthenticated access before any user data read", async () => {
    const get = vi.fn();
    const app = express().use(createAccountRoutes({ get }));
    const response = await request(await listenOnLoopback(app)).get("/usage?ownerId=other");
    expect(response.status).toBe(401);
    expect(get).not.toHaveBeenCalled();
  });
  it("uses the verified caller and ignores a requested foreign identity", async () => {
    const get = vi.fn().mockResolvedValue({ resetAt: now.toISOString(), allowances: [], requests: [] });
    const app = express();
    app.use((req, _res, next) => { (req as RequestWithUser).user = { uid: "creator" }; next(); });
    app.use(createAccountRoutes({ get }));
    const response = await request(await listenOnLoopback(app)).get("/usage?ownerId=other");
    expect(response.status).toBe(200);
    expect(get).toHaveBeenCalledWith("creator");
    expect(response.body.success).toBe(true);
  });
});
