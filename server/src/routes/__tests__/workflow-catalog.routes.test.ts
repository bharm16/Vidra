import express from "express";
import request from "supertest";
import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import type { CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import { createPublicWorkflowCatalogRoutes, createWorkflowCatalogRoutes } from "../creation-requests.routes";
import { WorkflowCapabilityCatalog } from "@services/creation-requests/preparation/WorkflowCapabilityCatalog";
import { StudioWorkflowSpendGuard } from "@services/creation-requests/execution/StudioWorkflowSpendGuard";
import { errorHandler } from "@middleware/errorHandler";

describe("workflow model list", () => {
  it("serves the same list to signed-out visitors on the public route only", async () => {
    const catalog = new WorkflowCapabilityCatalog();
    const app = express();
    app.use("/public/workflow", createPublicWorkflowCatalogRoutes(catalog));
    app.use("/workflow", createWorkflowCatalogRoutes(catalog));
    app.use(errorHandler);
    const open = await request(app).get("/public/workflow/profiles");
    expect(open.status).toBe(200);
    expect(open.body.data).toEqual(JSON.parse(JSON.stringify(catalog.list())));
    expect((await request(app).get("/workflow/profiles")).status).toBe(401);
  });

  it("greys out a model once its spend stops qualifying, from a stored hold or the policy's expiry", async () => {
    let at = Date.parse("2026-10-20T00:00:00.000Z");
    const database = { collection: () => ({ get: async () => ({ docs: [{ id: "gemini-omni-1.1-t2v" }] }) }) } as unknown as Firestore;
    const guard = new StudioWorkflowSpendGuard(database, { dailyCapCents: 500 }, () => at);
    const catalog = new WorkflowCapabilityCatalog(undefined, { imageProviders: new Set(), videoAvailable: () => false, textAvailable: false, replicateAvailable: true, spendGuard: guard });
    const app = express();
    app.use("/public/workflow", createPublicWorkflowCatalogRoutes(catalog));
    const availability = async (): Promise<Record<string, string>> => Object.fromEntries(((await request(app).get("/public/workflow/profiles")).body.data as CapabilityProfile[]).map(profile => [profile.id, profile.availability]));
    expect(await availability()).toMatchObject({ "gemini-omni-1.1-t2v": "qualified", "wan-3-t2v": "qualified" });
    await guard.start(); guard.stop();
    expect(await availability()).toMatchObject({ "gemini-omni-1.1-t2v": "unavailable", "gemini-omni-1.1-i2v": "qualified", "wan-3-t2v": "qualified" });
    expect(catalog.get("gemini-omni-1.1-t2v")?.unavailableReason).toContain("unavailable during bounded free testing");
    at = Date.parse("2026-11-17T00:00:00.000Z");
    expect(await availability()).toMatchObject({ "gemini-omni-1.1-i2v": "unavailable", "wan-3-t2v": "unavailable", "lyria-3": "unavailable" });
  });
});
