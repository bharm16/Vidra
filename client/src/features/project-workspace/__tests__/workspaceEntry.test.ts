import { describe, expect, it } from "vitest";
import { CreationDraftSchema } from "@shared/schemas/workflow/draft.schemas";
import { bindWorkspaceEntry, consumeCreatedWorkspaceEntry, createdWorkspaceState, readWorkspaceEntry, reopenWorkspaceState, workspaceEntryMatches, workspaceEntryPath } from "../state/workspaceEntry";

const target = { ownerId: "creator", projectId: "project_one", conversationId: "conversation_one", draftId: "draft_one" };
const record = CreationDraftSchema.parse({ schemaVersion: "vidra-workflow/v2", id: target.draftId, ownerId: target.ownerId, projectId: target.projectId, conversationId: target.conversationId, revision: 1, status: "open", action: "make-image", instructions: "Keep these unfinished words.", inputs: [], settings: { profileId: "unselected", profileRevision: "unresolved", parameters: {}, outputCount: 1 }, context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId: target.projectId, conversationId: target.conversationId }, createdAt: "2026-10-18T00:00:00.000Z", updatedAt: "2026-10-18T00:00:00.000Z" });

describe("explicit workspace entry", () => {
  it("carries a unique explicit navigation ticket and exact draft without a duplicate URL selector", () => {
    const first = reopenWorkspaceState(target), second = reopenWorkspaceState(target);
    expect(first.workspaceEntry.entryId).not.toBe(second.workspaceEntry.entryId);
    expect(workspaceEntryPath(target)).toBe("/app/project/project_one?conversation=conversation_one");
    expect(readWorkspaceEntry(first, target.ownerId, target.projectId)).toEqual(first.workspaceEntry);
    expect(bindWorkspaceEntry(first.workspaceEntry, record)).toEqual({ ...target, kind: "reopen", entryId: first.workspaceEntry.entryId });
  });
  it("never infers entry from cold navigation, saved words, a different owner or malformed identities", () => {
    const state = reopenWorkspaceState(target);
    expect(readWorkspaceEntry(undefined, target.ownerId, target.projectId)).toBeUndefined();
    expect(readWorkspaceEntry(record, target.ownerId, target.projectId)).toBeUndefined();
    expect(readWorkspaceEntry(state, "other", target.projectId)).toBeUndefined();
    expect(readWorkspaceEntry(state, target.ownerId, "project_other")).toBeUndefined();
    expect(readWorkspaceEntry({ workspaceEntry: { ...state.workspaceEntry, draftId: "not-an-id" } }, target.ownerId, target.projectId)).toBeUndefined();
    expect(() => reopenWorkspaceState({ ownerId: "creator", projectId: "project_one", draftId: "draft_one" })).toThrow();
  });
  it("binds only the validated requested working copy, never an arbitrary current draft", () => {
    const ticket = reopenWorkspaceState(target).workspaceEntry;
    expect(bindWorkspaceEntry(ticket, { ...record, id: CreationDraftSchema.shape.id.parse("draft_other") })).toBeUndefined();
    expect(bindWorkspaceEntry(ticket, { ...record, conversationId: CreationDraftSchema.shape.conversationId.parse("conversation_other") })).toBeUndefined();
    expect(bindWorkspaceEntry(ticket, { ...record, status: "submitted" })).toBeUndefined();
    expect(bindWorkspaceEntry(ticket, { ...record, ownerId: "other" })).toBeUndefined();
    expect(bindWorkspaceEntry(ticket, undefined)).toBeUndefined();
  });
  it("retains presentation through editing and acknowledgement but expires on record identity or lifecycle changes", () => {
    const binding = bindWorkspaceEntry(reopenWorkspaceState(target).workspaceEntry, record);
    expect(workspaceEntryMatches(binding, { ...record, status: "parked" })).toBe(true);
    const edited = CreationDraftSchema.parse({ ...record, revision: 2, instructions: "Edited words." });
    expect(workspaceEntryMatches(binding, edited)).toBe(true);
    expect(workspaceEntryMatches(binding, { ...record, status: "submitted" })).toBe(false);
    expect(workspaceEntryMatches(binding, { ...record, status: "discarded" })).toBe(false);
    expect(workspaceEntryMatches(binding, { ...record, id: CreationDraftSchema.shape.id.parse("draft_next") })).toBe(false);
    expect(workspaceEntryMatches(binding, { ...record, ownerId: "other" })).toBe(false);
    expect(workspaceEntryMatches(binding, undefined)).toBe(false);
  });
  it("binds a successful created-project entry to its validated first working copy without using its name, words or model", () => {
    const state = createdWorkspaceState({ ownerId: target.ownerId, projectId: target.projectId });
    const ticket = readWorkspaceEntry(state, target.ownerId, target.projectId);
    if (!ticket) throw new Error("Expected the validated creation event");
    expect(ticket.kind).toBe("created");
    expect(bindWorkspaceEntry(ticket, record)).toEqual({ kind: "created", ...target, entryId: ticket.entryId });
    const binding = bindWorkspaceEntry(ticket, record);
    const edited = CreationDraftSchema.parse({ ...record, revision: 2, instructions: "Words saved after creation.", status: "parked" });
    expect(workspaceEntryMatches(binding, edited)).toBe(true);
    expect(workspaceEntryMatches(binding, { ...record, id: CreationDraftSchema.shape.id.parse("draft_next") })).toBe(false);
    expect(workspaceEntryMatches(binding, { ...record, conversationId: CreationDraftSchema.shape.conversationId.parse("conversation_next") })).toBe(false);
    expect(workspaceEntryMatches(binding, { ...record, status: "submitted" })).toBe(false);
    expect(workspaceEntryMatches(binding, { ...record, status: "discarded" })).toBe(false);
  });
  it("rejects foreign or retargeted creation tickets and never binds a closed or unowned first copy", () => {
    const state = createdWorkspaceState({ ownerId: target.ownerId, projectId: target.projectId });
    expect(readWorkspaceEntry(state, "other", target.projectId)).toBeUndefined();
    expect(readWorkspaceEntry(state, target.ownerId, "project_other")).toBeUndefined();
    expect(readWorkspaceEntry({ workspaceEntry: { ...state.workspaceEntry, draftId: target.draftId, conversationId: target.conversationId } }, target.ownerId, target.projectId)).toBeUndefined();
    expect(readWorkspaceEntry({ workspaceEntry: { ...state.workspaceEntry, entryId: "not-a-ticket" } }, target.ownerId, target.projectId)).toBeUndefined();
    expect(bindWorkspaceEntry(state.workspaceEntry, { ...record, ownerId: "other" })).toBeUndefined();
    expect(bindWorkspaceEntry(state.workspaceEntry, { ...record, projectId: CreationDraftSchema.shape.projectId.parse("project_other") })).toBeUndefined();
    expect(bindWorkspaceEntry(state.workspaceEntry, { ...record, status: "submitted" })).toBeUndefined();
    expect(bindWorkspaceEntry(state.workspaceEntry, undefined)).toBeUndefined();
  });
  it("consumes just the matching created ticket and preserves unrelated router state without mutating it", () => {
    const created = createdWorkspaceState({ ownerId: target.ownerId, projectId: target.projectId });
    const state = { ...created, returnTo: "/docs", restore: { scrollTop: 80 }, marker: ["keep"] };
    const consumed = consumeCreatedWorkspaceEntry(state, created.workspaceEntry.entryId);
    expect(consumed).toEqual({ consumed: true, state: { returnTo: "/docs", restore: { scrollTop: 80 }, marker: ["keep"] } });
    expect(state.workspaceEntry).toEqual(created.workspaceEntry);
    expect(readWorkspaceEntry(consumed.state, target.ownerId, target.projectId)).toBeUndefined();
    expect(consumeCreatedWorkspaceEntry(consumed.state, created.workspaceEntry.entryId)).toEqual({ consumed: false, state: consumed.state });
    expect(consumeCreatedWorkspaceEntry(created, created.workspaceEntry.entryId)).toEqual({ consumed: true, state: undefined });
  });
  it("does not consume a different entry or the exact retained-draft return ticket", () => {
    const created = createdWorkspaceState({ ownerId: target.ownerId, projectId: target.projectId });
    const other = createdWorkspaceState({ ownerId: target.ownerId, projectId: target.projectId });
    expect(consumeCreatedWorkspaceEntry(created, other.workspaceEntry.entryId)).toEqual({ consumed: false, state: created });
    const reopened = reopenWorkspaceState(target);
    expect(consumeCreatedWorkspaceEntry(reopened, reopened.workspaceEntry.entryId)).toEqual({ consumed: false, state: reopened });
    expect(readWorkspaceEntry(reopened, target.ownerId, target.projectId)).toEqual(reopened.workspaceEntry);
  });
});
