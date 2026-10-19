import { expect, it } from "vitest";
import { VideoEditSchema, VideoExportSchema, VideoValidationIssueSchema } from "../video-edit.schemas";

const composition = { normalizationVersion: "vidra-cfr30/v1", preset: "landscape", fps: 30, items: [], text: [] };
const edit = { schemaVersion: "vidra-workflow/v2", id: "edit_contract", ownerId: "creator", projectId: "project_contract", name: "Video edit", revision: 2, composition, issues: [], createdAt: "2026-10-18T20:00:00.000Z", updatedAt: "2026-10-18T20:00:00.000Z" };

it("reads revisions saved before their command was stored and requires restores to name their source", () => {
  expect(VideoEditSchema.parse(edit).change).toBeUndefined();
  expect(VideoEditSchema.parse({ ...edit, change: { kind: "restore", restoredFrom: 1 } }).change).toEqual({ kind: "restore", restoredFrom: 1 });
  expect(VideoEditSchema.parse({ ...edit, change: { kind: "trim" } }).change).toEqual({ kind: "trim" });
  expect(VideoEditSchema.safeParse({ ...edit, change: { kind: "restore" } }).success).toBe(false);
  expect(VideoEditSchema.safeParse({ ...edit, change: { kind: "trim", restoredFrom: 1 } }).success).toBe(false);
  expect(VideoEditSchema.safeParse({ ...edit, change: { kind: "rename" } }).success).toBe(false);
});

it("reads version-keyed source issues and failed exports saved before structured source failures", () => {
  expect(VideoValidationIssueSchema.parse({ elementId: "version_old", code: "source_unavailable", message: "Unavailable." }).versionId).toBeUndefined();
  expect(VideoValidationIssueSchema.safeParse({ elementId: "item", code: "source_unavailable", message: "Unavailable.", versionId: "not-a-version" }).success).toBe(false);
  const failed = { schemaVersion: "vidra-workflow/v2", id: "export_contract", ownerId: "creator", projectId: "project_contract", editId: "edit_contract", revision: 2, submissionId: "submission_contract", executionDraftId: "draft_contract", executionDraftRevision: 1, composition, compositionHash: "a".repeat(64), sources: [], renderer: "native/v1", attemptId: "attempt_contract", state: "failed", progress: 0, message: "Source version_gone is unavailable.", createdAt: edit.createdAt, updatedAt: edit.updatedAt };
  expect(VideoExportSchema.parse(failed).failedVersionId).toBeUndefined();
  expect(VideoExportSchema.parse({ ...failed, failedItemId: "clip_one", failedVersionId: "version_gone" })).toMatchObject({ failedItemId: "clip_one", failedVersionId: "version_gone" });
  expect(VideoExportSchema.safeParse({ ...failed, failedItemId: "clip one", failedVersionId: "version_gone" }).success).toBe(false);
});
