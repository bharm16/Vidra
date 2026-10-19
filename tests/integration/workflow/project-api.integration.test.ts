import express from "express";
import request from "supertest";
import { afterAll, expect, it } from "vitest";
import { ProjectStore } from "@services/projects/ProjectStore";
import { ConversationStore } from "@services/projects/ConversationStore";
import { CreationDraftStore } from "@services/creation-drafts/CreationDraftStore";
import { RequestHistoryStore } from "@services/media-history/RequestHistoryStore";
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

it("lists conversations with their media counts when request history is available, and without them otherwise", async () => {
  const counted = express(); counted.use(express.json());
  counted.use((req: RequestWithUser, _res, next) => { const owner = req.header("x-test-owner"); if (owner) req.user = { uid: owner }; next(); });
  counted.use("/projects", createProjectRoutes({ projects, conversations, drafts, history: new RequestHistoryStore(database, projects) })); counted.use(errorHandler);
  await projects.create("creator", { id: "project_counts", name: "Counts" });
  await conversations.create("creator", "project_counts", { id: "conversation_counts", name: "First ideas" });
  const withCounts = await request(counted).get("/projects/project_counts/conversations").set("x-test-owner", "creator");
  expect(withCounts.status).toBe(200); expect(withCounts.body.data).toMatchObject([{ id: "conversation_counts", media: { pictures: 0, clips: 0 } }]);
  const withoutCounts = await request(app).get("/projects/project_counts/conversations").set("x-test-owner", "creator");
  expect(withoutCounts.body.data[0]).not.toHaveProperty("media");
  expect((await request(counted).get("/projects/project_counts/conversations").set("x-test-owner", "intruder")).status).toBe(403);
});
