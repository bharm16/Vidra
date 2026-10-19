import { expect, it } from "vitest";
import { CreationDraftSchema } from "@shared/schemas/workflow/draft.schemas";
import { openDraftBuffer } from "../state/draftBuffer";
import { EMPTY_WORKSPACE_VIEW, workspaceViewReducer } from "../state/workspaceState";

it("PE-W02 inspecting another version and hiding the timeline preserve exact unfinished work", () => {
  const record = CreationDraftSchema.parse({
    schemaVersion: "vidra-workflow/v2", id: "draft_current", ownerId: "creator", projectId: "project_current", conversationId: "conversation_current", revision: 1, status: "open",
    action: "make-video", instructions: "Keep the camera low", inputs: [{ role: "start-frame", state: "resolved", versionId: "version_input" }],
    settings: { profileId: "unselected", profileRevision: "unresolved", parameters: {}, outputCount: 1 },
    context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId: "project_current", conversationId: "conversation_current" },
    createdAt: "2026-10-10T20:00:00.000Z", updatedAt: "2026-10-10T20:00:00.000Z",
  });
  const opened = workspaceViewReducer(EMPTY_WORKSPACE_VIEW, { type: "open-draft", buffer: openDraftBuffer(record) });
  const viewed = workspaceViewReducer(opened, { type: "view-media", versionId: "version_other" });
  const collapsed = workspaceViewReducer(viewed, { type: "timeline-visibility", visible: false });
  expect(collapsed.drafts).toBe(opened.drafts);
  expect(collapsed.activeDraftId).toBe("draft_current");
  expect(collapsed.viewedVersionId).toBe("version_other");
  expect(collapsed.timelineVisible).toBe(false);
});
