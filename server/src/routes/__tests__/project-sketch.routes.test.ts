import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createProjectSketchRoutes } from "../project-sketch.routes";
import type { RequestWithUser } from "@middleware/intake";
import { errorHandler } from "@middleware/errorHandler";
import { WorkflowError } from "@services/projects/WorkflowError";
import { MediaVersionSchema, type MediaVersion } from "@shared/schemas/workflow/media.schemas";

const command = { captureId: "capture_test", displayedFrameId: "frame-1", displayedAt: "2026-10-17T01:00:00.000Z", outputDataUri: "data:image/png;base64,YQ==", drawingDataUri: "data:image/png;base64,Yg==", inputs: { prompt: "Keep my words", strength: .875, steps: 8, seed: 42 } };
describe("project Sketch route boundary", () => {
  it("rejects anonymous, malformed identity, unknown fields and invalid snapshots before service access", async () => {
    const service = { accept: vi.fn(), acceptAreaMask: vi.fn() };
    const app = express(); app.use(express.json()); app.use((req: RequestWithUser, _res, next) => { const owner = req.header("x-owner"); if (owner) req.user = { uid: owner }; next(); }); app.use("/projects", createProjectSketchRoutes(service)); app.use(errorHandler);
    expect((await request(app).post("/projects/project_one/sketch/captures").send(command)).status).toBe(401);
    expect((await request(app).post("/projects/other/sketch/captures").set("x-owner", "owner").send(command)).status).toBe(422);
    for (const bad of [{ ...command, outputDataUri: "https://private.example/secret" }, { ...command, projectId: "project_other" }, { ...command, inputs: { ...command.inputs, seed: 1.2 } }]) expect((await request(app).post("/projects/project_one/sketch/captures").set("x-owner", "owner").send(bad)).status).toBe(400);
    expect(service.accept).not.toHaveBeenCalled();
  });
  it("uses authenticated identity and returns no foreign data on authorization failure", async () => {
    const service = { accept: vi.fn(async (): Promise<MediaVersion> => { throw new WorkflowError("access_denied", "This project is unavailable."); }), acceptAreaMask: vi.fn() };
    const app = express(); app.use(express.json()); app.use((req: RequestWithUser, _res, next) => { req.user = { uid: "stranger" }; next(); }); app.use("/projects", createProjectSketchRoutes(service)); app.use(errorHandler);
    const response = await request(app).post("/projects/project_private/sketch/captures").send(command);
    expect(response.status).toBe(403); expect(response.body).not.toHaveProperty("data");
    expect(service.accept).toHaveBeenCalledWith("stranger", "project_private", command);
    service.accept.mockResolvedValueOnce(MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_test", ownerId: "stranger", projectId: "project_private", kind: "image", label: "Sketch picture", origin: { kind: "sketch-capture", captureId: "capture_test" }, sourceInputs: [], object: { identity: "unknown", assetId: "one", storagePath: "users/stranger/previews/images/one.png" }, metadata: { state: "pending" }, association: "linked", createdAt: command.displayedAt }));
    expect((await request(app).post("/projects/project_private/sketch/captures").send(command)).status).toBe(200);
  });
  it("passes a well-formed area to the service as the caller and rejects malformed areas first", async () => {
    const area = { versionId: "version_source", width: 40, height: 30, transform: "identity", dataUri: "data:image/png;base64,YQ==" };
    const service = { accept: vi.fn(), acceptAreaMask: vi.fn(async (): Promise<MediaVersion> => { throw new WorkflowError("invalid_settings", "This area belongs to a different picture or size. Redraw it on this exact version."); }) };
    const app = express(); app.use(express.json()); app.use((req: RequestWithUser, _res, next) => { const owner = req.header("x-owner"); if (owner) req.user = { uid: owner }; next(); }); app.use("/projects", createProjectSketchRoutes(service)); app.use(errorHandler);
    expect((await request(app).post("/projects/project_one/sketch/area-masks").send(area)).status).toBe(401);
    for (const bad of [{ ...area, transform: "scaled" }, { ...area, width: 0 }, { ...area, dataUri: "https://private.example/mask.png" }, { ...area, extra: true }]) expect((await request(app).post("/projects/project_one/sketch/area-masks").set("x-owner", "owner").send(bad)).status).toBe(400);
    expect(service.acceptAreaMask).not.toHaveBeenCalled();
    const response = await request(app).post("/projects/project_one/sketch/area-masks").set("x-owner", "owner").send(area);
    expect(response.status).toBe(422); expect(response.body).not.toHaveProperty("data");
    expect(service.acceptAreaMask).toHaveBeenCalledWith("owner", "project_one", area);
  });
});
