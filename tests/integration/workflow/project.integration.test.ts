import { afterAll, describe, expect, it } from "vitest";
import { ProjectStore } from "@services/projects/ProjectStore";
import { createWorkflowTestDatabase } from "../helpers/workflow/emulator";

const database = createWorkflowTestDatabase();
const store = new ProjectStore(database);
afterAll(async () => { await database.terminate(); });

describe("WP-03 owner-scoped project command boundary", () => {
  it("HISTORY-01 converges repeated creation and keeps equally named projects distinct", async () => {
    const command = { id: "project_first", name: "Evening campaign" };
    const results = await Promise.all([store.create("creator", command), store.create("creator", command)]);
    expect(results[0]?.id).toBe("project_first");
    expect(results[1]).toEqual(results[0]);
    const second = await store.create("creator", { id: "project_second", name: "Evening campaign" });
    expect(second.id).toBe("project_second");
    expect((await store.list("creator")).map(project => project.id).sort()).toEqual(["project_first", "project_second"]);
    await expect(store.get("other-owner", "project_first")).rejects.toMatchObject({ code: "access_denied" });
    expect(await store.list("other-owner")).toEqual([]);
  });

  it("preserves the winner of competing project changes and rejects an unauthorized change", async () => {
    await store.create("creator", { id: "project_race", name: "Original" });
    const changes = await Promise.allSettled([
      store.change("creator", "project_race", { expectedRevision: 1, name: "First change" }),
      store.change("creator", "project_race", { expectedRevision: 1, name: "Second change" }),
    ]);
    expect(changes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(changes.filter(result => result.status === "rejected")).toMatchObject([{ reason: { code: "revision_conflict" } }]);
    await expect(store.change("other-owner", "project_race", { expectedRevision: 2, name: "Stolen" })).rejects.toMatchObject({ code: "access_denied" });
    const current = await store.get("creator", "project_race");
    expect(current.revision).toBe(2);
    expect(current.name).not.toBe("Stolen");
  });

  it("rejects project records whose stored identity disagrees with their address", async () => {
    const project = await store.create("creator", { id: "project_bound", name: "Bound project" });
    await database.collection("creation_projects").doc(project.id).set({ ...project, id: "project_alias" });
    await expect(store.get("creator", "project_bound")).rejects.toMatchObject({ code: "access_denied" });
    await expect(store.create("creator", { id: "project_bound", name: "Bound project" })).rejects.toMatchObject({ code: "access_denied" });
    await expect(store.change("creator", "project_bound", { expectedRevision: 1, name: "A new name" })).rejects.toMatchObject({ code: "access_denied" });
    await expect(store.list("creator")).rejects.toMatchObject({ code: "access_denied" });
  });
});
