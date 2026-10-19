import { afterAll, expect, it } from "vitest";
import { ProjectStore } from "@services/projects/ProjectStore";
import { CreationContextService } from "@services/creation-context/CreationContextService";
import { createWorkflowTestDatabase } from "../helpers/workflow/emulator";
import { seedRequest } from "../helpers/workflow/requestFixture";

const database = createWorkflowTestDatabase();
const projects = new ProjectStore(database);
const context = new CreationContextService(database, projects);
afterAll(async () => { await database.terminate(); });

it("CONTEXT-01 excludes siblings and later messages from a captured branch", async () => {
  await projects.create("creator", { id: "project_history", name: "Campaign" });
  const a = await seedRequest(database, { id: "request_a", instructions: "A red lamp", sequence: 1 });
  const b = await seedRequest(database, { id: "request_b", instructions: "Make it blue", sequence: 2, ancestors: [a] });
  await seedRequest(database, { id: "request_c", instructions: "Make it green", sequence: 3, ancestors: [a, b] });
  await seedRequest(database, { id: "request_d", instructions: "A sibling yellow lamp", sequence: 4, ancestors: [a] });
  const materialized = await context.materialize("creator", "project_history", { origin: "branch", parentRequestId: "request_b", requestIds: ["request_a", "request_b"], projectInstructionsRevision: 1 });
  expect(materialized.entries).toEqual([{ requestId: "request_a", instructions: "A red lamp" }, { requestId: "request_b", instructions: "Make it blue" }]);
  await expect(context.materialize("creator", "project_history", { origin: "branch", parentRequestId: "request_b", requestIds: ["request_a", "request_d", "request_b"], projectInstructionsRevision: 1 })).rejects.toMatchObject({ code: "invalid_context" });
  await expect(context.materialize("other-owner", "project_history", { origin: "empty", requestIds: [], projectInstructionsRevision: 1 })).rejects.toMatchObject({ code: "access_denied" });
});
