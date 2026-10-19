import { expect, it } from "vitest";
import { CreationDraftSchema } from "@shared/schemas/workflow/draft.schemas";
import { openDraftBuffer, editDraftBuffer, acknowledgeDraftBuffer, draftHasSafeRetention, undoDraftBuffer, redoDraftBuffer } from "../state/draftBuffer";

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
