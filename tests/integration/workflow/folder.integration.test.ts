import express from "express";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { ProjectStore } from "@services/projects/ProjectStore";
import { ConversationStore } from "@services/projects/ConversationStore";
import { FolderStore } from "@services/projects/FolderStore";
import { createFolderRoutes } from "@routes/folders.routes";
import { errorHandler } from "@middleware/errorHandler";
import type { RequestWithUser } from "@middleware/intake";
import { createWorkflowTestDatabase } from "../helpers/workflow/emulator";

const database = createWorkflowTestDatabase();
const projects = new ProjectStore(database);
const folders = new FolderStore(database);
const conversations = new ConversationStore(
  database,
  projects,
  undefined,
  folders,
);
afterAll(async () => {
  await database.terminate();
});

describe("projects as folders for library work", () => {
  it("creates projects idempotently and lists only the owner's", async () => {
    const [first, second] = await Promise.all([
      folders.create("filer", { id: "folder_campaign", name: "Campaign" }),
      folders.create("filer", { id: "folder_campaign", name: "Campaign" }),
    ]);
    expect(first).toEqual(second);
    expect((await folders.list("filer")).map((folder) => folder.id)).toContain(
      "folder_campaign",
    );
    expect(await folders.list("filer-intruder")).toEqual([]);
    await expect(
      folders.create("filer-intruder", {
        id: "folder_campaign",
        name: "Taken",
      }),
    ).rejects.toMatchObject({ code: "access_denied" });
  });

  it("renames and trashes with the revision it started from", async () => {
    await folders.create("filer", { id: "folder_race", name: "Original" });
    const changes = await Promise.allSettled([
      folders.change("filer", "folder_race", {
        expectedRevision: 1,
        name: "First",
      }),
      folders.change("filer", "folder_race", {
        expectedRevision: 1,
        name: "Second",
      }),
    ]);
    expect(
      changes.filter((result) => result.status === "rejected"),
    ).toMatchObject([{ reason: { code: "revision_conflict" } }]);
    const trashed = await folders.change("filer", "folder_race", {
      expectedRevision: 2,
      status: "trashed",
    });
    await expect(
      folders.change("filer", "folder_race", {
        expectedRevision: trashed.revision,
        name: "While trashed",
      }),
    ).rejects.toMatchObject({ code: "read_only" });
    await expect(
      folders.change("filer-intruder", "folder_race", {
        expectedRevision: trashed.revision,
        status: "active",
      }),
    ).rejects.toMatchObject({ code: "access_denied" });
  });

  it("files a library conversation into a project and takes it out again without moving its work", async () => {
    const library = await projects.ensureLibrary("filer");
    await folders.create("filer", { id: "folder_filing", name: "Filing" });
    const started = await conversations.create("filer", library.id, {
      id: "conversation_started_in_project",
      name: "Started there",
      folderId: "folder_filing",
    });
    expect(started).toMatchObject({
      projectId: library.id,
      folderId: "folder_filing",
    });
    const loose = await conversations.create("filer", library.id, {
      id: "conversation_filed_later",
      name: "Filed later",
    });
    const filed = await conversations.change("filer", library.id, loose.id, {
      expectedRevision: 1,
      folderId: "folder_filing",
    });
    expect(filed).toMatchObject({
      projectId: library.id,
      folderId: "folder_filing",
      revision: 2,
    });
    const renamed = await conversations.change("filer", library.id, loose.id, {
      expectedRevision: 2,
      name: "Still filed",
    });
    expect(renamed.folderId).toBe("folder_filing");
    const removed = await conversations.change("filer", library.id, loose.id, {
      expectedRevision: 3,
      folderId: null,
    });
    expect(removed).not.toHaveProperty("folderId");
    expect(removed.projectId).toBe(library.id);
  });

  it("refuses another owner's project, a trashed project and work that already has a project", async () => {
    const library = await projects.ensureLibrary("filer");
    await folders.create("filer-intruder", {
      id: "folder_foreign",
      name: "Not yours",
    });
    await expect(
      conversations.create("filer", library.id, {
        id: "conversation_foreign_folder",
        name: "Foreign",
        folderId: "folder_foreign",
      }),
    ).rejects.toMatchObject({ code: "access_denied" });
    const trashed = await folders.create("filer", {
      id: "folder_trashed",
      name: "Trashed",
    });
    await folders.change("filer", trashed.id, {
      expectedRevision: 1,
      status: "trashed",
    });
    const loose = await conversations.create("filer", library.id, {
      id: "conversation_for_trash",
      name: "Loose",
    });
    await expect(
      conversations.change("filer", library.id, loose.id, {
        expectedRevision: 1,
        folderId: "folder_trashed",
      }),
    ).rejects.toMatchObject({ code: "read_only" });
    await expect(
      conversations.change("filer", library.id, loose.id, {
        expectedRevision: 1,
        folderId: "folder_missing",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await projects.create("filer", {
      id: "project_named_container",
      name: "Named",
    });
    await folders.create("filer", {
      id: "folder_for_named",
      name: "For named",
    });
    await expect(
      conversations.create("filer", "project_named_container", {
        id: "conversation_named",
        name: "Named",
        folderId: "folder_for_named",
      }),
    ).rejects.toMatchObject({ code: "invalid_context" });
    expect(
      (await conversations.get("filer", library.id, loose.id)).revision,
    ).toBe(1);
  });

  it("guards the HTTP boundary", async () => {
    const app = express();
    app.use(express.json());
    app.use((req: RequestWithUser, _res, next) => {
      const owner = req.header("x-test-owner");
      if (owner) req.user = { uid: owner };
      next();
    });
    app.use("/folders", createFolderRoutes(folders));
    app.use(errorHandler);
    expect((await request(app).get("/folders")).status).toBe(401);
    expect(
      (
        await request(app)
          .post("/folders")
          .set("x-test-owner", "http-filer")
          .send({ id: "not-a-folder", name: "Bad" })
      ).status,
    ).toBe(400);
    const created = await request(app)
      .post("/folders")
      .set("x-test-owner", "http-filer")
      .send({ id: "folder_http", name: "Private name" });
    expect(created.status).toBe(201);
    const forbidden = await request(app)
      .patch("/folders/folder_http")
      .set("x-test-owner", "http-intruder")
      .send({ expectedRevision: 1, name: "Stolen" });
    expect(forbidden.status).toBe(403);
    expect(JSON.stringify(forbidden.body)).not.toContain("Private name");
    expect(
      (
        await request(app)
          .patch("/folders/bad")
          .set("x-test-owner", "http-filer")
          .send({ expectedRevision: 1, name: "x" })
      ).status,
    ).toBe(400);
  });
});
