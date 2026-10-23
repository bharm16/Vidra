import { expect, it } from "vitest";
import { CreationDraftSchema } from "@shared/schemas/workflow/draft.schemas";
import { openDraftBuffer, editDraftBuffer, acknowledgeDraftBuffer, draftHasSafeRetention, undoDraftBuffer, redoDraftBuffer, sortDeviceCopies } from "../state/draftBuffer";

const record = CreationDraftSchema.parse({
  schemaVersion: "vidra-workflow/v2", id: "draft_buffer", ownerId: "creator", projectId: "project_buffer", conversationId: "conversation_buffer", revision: 1, status: "open",
  action: "make-video", instructions: "Original", inputs: [], settings: { profileId: "unselected", profileRevision: "unresolved", parameters: {}, outputCount: 1 },
  context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId: "project_buffer", conversationId: "conversation_buffer" },
  createdAt: "2026-10-10T20:00:00.000Z", updatedAt: "2026-10-10T20:00:00.000Z",
});

it("PE-A11 an older server acknowledgment preserves newer words and cannot claim they are saved", () => {
  let buffer = openDraftBuffer(record);
  buffer = editDraftBuffer(buffer, { ...buffer.content, instructions: "First change" });
  buffer = editDraftBuffer(buffer, { ...buffer.content, instructions: "Newer change" });
  buffer = acknowledgeDraftBuffer(buffer, { ...record, instructions: "First change", revision: 2 }, 1);
  expect(buffer.content.instructions).toBe("Newer change");
  expect(draftHasSafeRetention(buffer)).toBe(false);
  expect(draftHasSafeRetention({ ...buffer, checkpointSequence: 2 })).toBe(true);
});

it("PE-A10 replacement undo/redo belongs to this draft and a new edit clears redo", () => {
  let buffer = openDraftBuffer(record);
  for (const instructions of ["First", "Second", "Third"]) buffer = editDraftBuffer(buffer, { ...buffer.content, instructions });
  buffer = undoDraftBuffer(undoDraftBuffer(buffer));
  expect(buffer.content.instructions).toBe("First");
  buffer = redoDraftBuffer(buffer);
  expect(buffer.content.instructions).toBe("Second");
  buffer = editDraftBuffer(buffer, { ...buffer.content, instructions: "New branch" });
  expect(redoDraftBuffer(buffer).content.instructions).toBe("New branch");
});

it("an old save acknowledgment cannot reopen a submitted draft at the same revision", () => {
  const frozen = openDraftBuffer({ ...record, status: "submitted" });
  const observed = acknowledgeDraftBuffer(frozen, record, 0);
  expect(observed.record.status).toBe("submitted");
  expect(editDraftBuffer(observed, { ...observed.content, instructions: "Overwrite" }).content.instructions).toBe("Original");
});

it("offers only device copies holding words their saved base lacks, and settles copies of submitted drafts", () => {
  const base = (draftId: string, conversationId = "conversation_buffer") => CreationDraftSchema.parse({ ...record, id: draftId, conversationId, destination: { ...record.destination, conversationId } });
  const copy = (draftId: string, serverRevision: number, instructions: string, conversationId?: string) => ({ draftId, record: base(draftId, conversationId), serverRevision, content: { ...openDraftBuffer(record).content, instructions } });
  const current = copy("draft_buffer", 1, "Unsaved words");
  const behind = copy("draft_behind", 1, "Older device words");
  const staleTab = copy("draft_behind", 1, "Original");
  const submitted = copy("draft_submitted", 1, "Unsaved before submit");
  const missing = copy("draft_missing", 1, "Never confirmed");
  const elsewhere = copy("draft_other", 1, "Other conversation", "conversation_other");
  const drafts = [record, CreationDraftSchema.parse({ ...record, id: "draft_behind", revision: 3, instructions: "Server moved on" }), CreationDraftSchema.parse({ ...record, id: "draft_submitted", status: "submitted" })];
  const { recoverable, settled } = sortDeviceCopies([current, behind, staleTab, submitted, missing, elsewhere], drafts, "conversation_buffer");
  expect(recoverable.map(item => item.draftId)).toEqual(["draft_behind", "draft_missing"]);
  expect(recoverable).not.toContain(staleTab);
  expect(settled.map(item => item.draftId)).toEqual(["draft_submitted"]);
});
