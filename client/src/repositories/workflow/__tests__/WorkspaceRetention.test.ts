import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreationDraftSchema, DraftContentSchema } from "@shared/schemas/workflow/draft.schemas";
import { SubmissionCommandSchema } from "@shared/schemas/workflow/request.schemas";
import { DraftIdSchema, ProjectIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { DraftCheckpointStore, type DraftCheckpoint, type OwnedWorkflowRetention, type SubmissionCheckpoint } from "../DraftCheckpointStore";
import { prepareWorkspaceSignOut, registerWorkspaceRetention, type DeviceWorkCheck } from "../WorkspaceRetention";

const record = CreationDraftSchema.parse({
  schemaVersion: "vidra-workflow/v2", id: "draft_one", ownerId: "creator", projectId: "project_one", conversationId: "conversation_one",
  revision: 2, status: "open", action: "make-image", instructions: "Server words", inputs: [],
  settings: { profileId: "image", profileRevision: "1", parameters: { aspect: "16:9" }, outputCount: 1 },
  context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 },
  destination: { projectId: "project_one", conversationId: "conversation_one" },
  createdAt: "2026-10-17T00:00:00.000Z", updatedAt: "2026-10-17T00:00:00.000Z",
});
function checkpoint(instructions = record.instructions): DraftCheckpoint {
  return { schemaVersion: "vidra-draft-checkpoint/v2", ownerId: record.ownerId, projectId: record.projectId, draftId: record.id, record, content: { ...DraftContentSchema.strip().parse(record), instructions }, sequence: 7, serverRevision: record.revision, updatedAt: record.updatedAt };
}
function submission(state: SubmissionCheckpoint["state"]): SubmissionCheckpoint {
  return { ownerId: "creator", projectId: record.projectId, submissionId: SubmissionCommandSchema.shape.submissionId.parse("submission_one"), command: SubmissionCommandSchema.parse({ submissionId: "submission_one", draftId: record.id, draftRevision: record.revision, reviewedHash: "a".repeat(64) }), sequence: 7, state };
}
let retained: OwnedWorkflowRetention;
const unregister: Array<() => void> = [];
beforeEach(() => { retained = { drafts: [], submissions: [] }; vi.spyOn(DraftCheckpointStore.prototype, "retention").mockImplementation(async () => retained); vi.spyOn(DraftCheckpointStore.prototype, "close").mockImplementation(() => undefined); });
afterEach(() => { for (const cleanup of unregister.splice(0)) cleanup(); vi.restoreAllMocks(); });

describe("Account sign-out retention", () => {
  it("finds an owner draft on this device after the workspace has unmounted", async () => {
    const mounted = vi.fn(async () => false);
    const unmount = registerWorkspaceRetention("creator", mounted); unmount();
    retained.drafts = [checkpoint("Unsent words retained on this device")];
    expect(await prepareWorkspaceSignOut("creator")).toMatchObject({ safe: false, canSignOutWithDeviceCopy: true, returnToDraft: { ownerId: "creator", projectId: record.projectId, conversationId: record.conversationId, draftId: record.id } });
    expect(mounted).not.toHaveBeenCalled();
    expect(DraftCheckpointStore.prototype.retention).toHaveBeenCalledWith("creator");
    expect(DraftCheckpointStore.prototype.close).toHaveBeenCalledOnce();
  });
  it("allows acknowledged checkpoints even when their local sequence is nonzero", async () => {
    retained.drafts = [checkpoint()];
    expect(await prepareWorkspaceSignOut("creator")).toEqual({ safe: true });
  });
  it("returns one draft destination across competing copies without choosing either copy's words", async () => {
    retained.drafts = [checkpoint("First device words"), checkpoint("Competing device words")];
    const result = await prepareWorkspaceSignOut("creator");
    expect(result).toMatchObject({ safe: false, returnToDraft: { ownerId: "creator", projectId: record.projectId, conversationId: record.conversationId, draftId: record.id } });
    expect(retained.drafts.map(draft => draft.content.instructions)).toEqual(["First device words", "Competing device words"]);
  });
  it("leaves unrelated unfinished destinations for the project browser", async () => {
    const second = checkpoint("Second unfinished draft");
    const secondId = DraftIdSchema.parse("draft_two");
    retained.drafts = [checkpoint("First unfinished draft"), { ...second, draftId: secondId, record: { ...second.record, id: secondId } }];
    const result = await prepareWorkspaceSignOut("creator");
    expect(result).toMatchObject({ safe: false, canSignOutWithDeviceCopy: true });
    expect(result).not.toHaveProperty("returnToDraft");
  });
  it("recognizes a recovered writer's newer acknowledgement without deleting the original copy", async () => {
    const original = checkpoint("Recovered words");
    const saved = { ...original, record: { ...record, revision: 3, instructions: original.content.instructions }, serverRevision: 3 };
    retained.drafts = [original, saved];
    expect(await prepareWorkspaceSignOut("creator")).toEqual({ safe: true });
    expect(retained.drafts).toHaveLength(2);
    retained.drafts = [checkpoint("Other unsaved words"), saved];
    expect(await prepareWorkspaceSignOut("creator")).toMatchObject({ safe: false, canSignOutWithDeviceCopy: true });
  });
  it("treats an explicitly discarded record as discarded work", async () => {
    const discarded = checkpoint("Words intentionally discarded");
    retained.drafts = [{ ...discarded, record: { ...discarded.record, status: "discarded" } }];
    expect(await prepareWorkspaceSignOut("creator")).toEqual({ safe: true });
  });
  it("runs only this owner's mounted flushes before reading their device state", async () => {
    const order: string[] = [];
    const foreign = vi.fn(async () => false);
    unregister.push(registerWorkspaceRetention("other", foreign));
    unregister.push(registerWorkspaceRetention("creator", async () => { order.push("flush"); return true; }));
    vi.mocked(DraftCheckpointStore.prototype.retention).mockImplementation(async () => { order.push("read"); return retained; });
    expect(await prepareWorkspaceSignOut("creator")).toEqual({ safe: true });
    expect(order).toEqual(["flush", "read"]);
    expect(foreign).not.toHaveBeenCalled();
  });
  it("does not offer sign-out when current in-memory work could not be retained", async () => {
    unregister.push(registerWorkspaceRetention("creator", async () => false));
    expect(await prepareWorkspaceSignOut("creator")).toMatchObject({ safe: false });
    expect(await prepareWorkspaceSignOut("creator")).not.toHaveProperty("canSignOutWithDeviceCopy");
    expect(DraftCheckpointStore.prototype.retention).not.toHaveBeenCalled();
  });
  it("does not confuse a lost submission response with a safe device-only draft", async () => {
    retained = { drafts: [checkpoint("Unsent words")], submissions: [submission("unknown")] };
    const result = await prepareWorkspaceSignOut("creator");
    expect(result).toMatchObject({ safe: false, reason: expect.stringContaining("request has not finished confirming") });
    expect(result).not.toHaveProperty("canSignOutWithDeviceCopy");
    expect(result).toHaveProperty("returnToDraft.draftId", record.id);
  });
  it("does not redirect an unresolved request to an unrelated retained draft", async () => {
    const missing = submission("unknown");
    retained = { drafts: [checkpoint("Unsent words")], submissions: [{ ...missing, command: { ...missing.command, draftId: DraftIdSchema.parse("draft_missing") } }] };
    const result = await prepareWorkspaceSignOut("creator");
    expect(result).toMatchObject({ safe: false });
    expect(result).not.toHaveProperty("returnToDraft");
    expect(result).not.toHaveProperty("canSignOutWithDeviceCopy");
  });
  it("allows resolved accepted and rejected submission receipts", async () => {
    retained.submissions = [submission("accepted"), submission("rejected")];
    expect(await prepareWorkspaceSignOut("creator")).toEqual({ safe: true });
  });
  it("fails closed when the device database cannot be read", async () => {
    vi.mocked(DraftCheckpointStore.prototype.retention).mockRejectedValue(new Error("IDB read denied"));
    const result = await prepareWorkspaceSignOut("creator");
    expect(result).toMatchObject({ safe: false, reason: expect.stringContaining("could not be checked") });
    expect(result).not.toHaveProperty("canSignOutWithDeviceCopy");
    expect(DraftCheckpointStore.prototype.close).toHaveBeenCalledOnce();
  });
  it("rejects an inconsistent owner boundary without revealing their draft", async () => {
    const foreign = checkpoint("Another owner's private words");
    retained.drafts = [{ ...foreign, ownerId: "other", record: { ...foreign.record, ownerId: "other" } }];
    const result = await prepareWorkspaceSignOut("creator");
    expect(result).toMatchObject({ safe: false });
    expect(JSON.stringify(result)).not.toContain("Another owner's private words");
    expect(result).not.toHaveProperty("canSignOutWithDeviceCopy");
    expect(result).not.toHaveProperty("returnToDraft");
  });
  it("rejects inconsistent nested draft ownership before constructing a destination", async () => {
    const privateDraft = checkpoint("Another owner's private words");
    retained.drafts = [{ ...privateDraft, record: { ...privateDraft.record, ownerId: "other", projectId: ProjectIdSchema.parse("project_private") } }];
    const result = await prepareWorkspaceSignOut("creator");
    expect(result).toMatchObject({ safe: false, reason: expect.stringContaining("could not be checked") });
    expect(result).not.toHaveProperty("returnToDraft");
    expect(JSON.stringify(result)).not.toContain("project_private");
  });
  it("blocks sign-out for an unfinished upload or edit kept on this device, offering the device copy", async () => {
    const upload = vi.fn(async () => true);
    const work: DeviceWorkCheck[] = [{ label: "an upload", unfinished: upload }, { label: "a video edit", unfinished: async () => false }];
    const result = await prepareWorkspaceSignOut("creator", work);
    expect(result).toMatchObject({ safe: false, canSignOutWithDeviceCopy: true, reason: expect.stringContaining("an upload") });
    expect(result).not.toHaveProperty("returnToDraft");
    expect(JSON.stringify(result)).not.toContain("a video edit");
    expect(upload).toHaveBeenCalledWith("creator");
  });
  it("keeps the account when other device work cannot be read", async () => {
    const result = await prepareWorkspaceSignOut("creator", [{ label: "an upload", unfinished: async () => { throw new Error("IDB read denied"); } }]);
    expect(result).toMatchObject({ safe: false, reason: expect.stringContaining("could not be checked") });
    expect(result).not.toHaveProperty("canSignOutWithDeviceCopy");
  });
  it("signs out when no device work is unfinished", async () => {
    expect(await prepareWorkspaceSignOut("creator", [{ label: "an upload", unfinished: async () => false }])).toEqual({ safe: true });
  });
});
