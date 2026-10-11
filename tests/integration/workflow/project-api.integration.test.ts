import express from "express";
import request from "supertest";
import { afterAll, expect, it } from "vitest";
import { ProjectStore } from "@services/projects/ProjectStore";
import { ConversationStore } from "@services/projects/ConversationStore";
import { CreationDraftStore } from "@services/creation-drafts/CreationDraftStore";
import { createProjectRoutes } from "@routes/projects.routes";
import { errorHandler } from "@middleware/errorHandler";
import type { RequestWithUser } from "@middleware/intake";
import { createWorkflowTestDatabase } from "../helpers/workflow/emulator";

const database = createWorkflowTestDatabase();
const projects = new ProjectStore(database);
const conversations = new ConversationStore(database, projects);
const drafts = new CreationDraftStore(database, projects, conversations);
const app = express();
app.use(express.json());
app.use((req: RequestWithUser, _res, next) => {
  const owner = req.header("x-test-owner");
  if (owner) req.user = { uid: owner };
  next();
});
app.use("/projects", createProjectRoutes({ projects, conversations, drafts }));
app.use(errorHandler);
afterAll(async () => { await database.terminate(); });

it("WP-03 project HTTP boundary rejects anonymous, malformed and cross-owner requests", async () => {
  expect((await request(app).get("/projects")).status).toBe(401);
  const invalid = await request(app).post("/projects").set("x-test-owner", "creator").send({ id: "wrong", name: "Private" });
  expect(invalid.status).toBe(400);
  const created = await request(app).post("/projects").set("x-test-owner", "creator").send({ id: "project_http", name: "Private name" });
  expect(created.status).toBe(201);
  expect(created.body).toMatchObject({ success: true, data: { id: "project_http", ownerId: "creator" } });
  const forbidden = await request(app).get("/projects/project_http").set("x-test-owner", "other");
  expect(forbidden.status).toBe(403);
  expect(JSON.stringify(forbidden.body)).not.toContain("Private name");
});
