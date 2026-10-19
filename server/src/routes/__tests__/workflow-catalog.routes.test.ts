import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createPublicWorkflowCatalogRoutes, createWorkflowCatalogRoutes } from "../creation-requests.routes";
import { WorkflowCapabilityCatalog } from "@services/creation-requests/preparation/WorkflowCapabilityCatalog";
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
});
