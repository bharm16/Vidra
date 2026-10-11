import { expect, it } from "vitest";
import { ProjectSchema } from "../project.schemas";

it("WP-01 records exact legacy origin IDs without inferring identity from titles", () => {
  const project = {
    schemaVersion: "vidra-workflow/v2", id: "project_legacy", ownerId: "creator", revision: 1,
    name: "Evening campaign", status: "active", instructions: { revision: 1, text: "" },
    origin: { kind: "legacy-session", recordId: "original-session-id", authority: "legacy" },
    createdAt: "2026-10-10T20:00:00.000Z", updatedAt: "2026-10-10T20:00:00.000Z",
  };
  expect(ProjectSchema.parse(project).origin).toEqual({ kind: "legacy-session", recordId: "original-session-id", authority: "legacy" });
  expect(ProjectSchema.safeParse({ ...project, id: "original-session-id" }).success).toBe(false);
});
