import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { DocumentReference } from "firebase-admin/firestore";
import { ProjectStore } from "@services/projects/ProjectStore";
import { ConversationStore } from "@services/projects/ConversationStore";
import { CreationDraftStore } from "@services/creation-drafts/CreationDraftStore";
import { MediaVersionIndex } from "@services/media-history/MediaVersionIndex";
import { RequestHistoryStore } from "@services/media-history/RequestHistoryStore";
import { WorkflowExecutionService, WorkflowExecutionStore } from "@services/creation-requests/execution";
import { ConversationSchema } from "@shared/schemas/workflow/project.schemas";
import { CreationDraftSchema } from "@shared/schemas/workflow/draft.schemas";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import { AcceptedRequestSchema } from "@shared/schemas/workflow/request.schemas";
import type { WorkflowPage } from "@shared/schemas/workflow/page.schemas";
import type { ListOptions } from "@services/firestore/WorkflowLists";
import { createWorkflowTestDatabase } from "../helpers/workflow/emulator";

const database = createWorkflowTestDatabase();
const owner = "pagination-owner"; const projectId = "project_pagination"; const conversationId = "conversation_page_000";
const stamp = "2026-10-24T00:00:00.000Z"; const count = 205;
const projects = new ProjectStore(database, () => stamp);
const conversations = new ConversationStore(database, projects, () => stamp);
const drafts = new CreationDraftStore(database, projects, conversations, () => stamp);
const media = new MediaVersionIndex(database, projects); const history = new RequestHistoryStore(database, projects);
const indexSuffix = (index: number): string => String(index).padStart(3, "0");
const content = { action: "make-image", instructions: "A boat", inputs: [], settings: { profileId: "controlled", profileRevision: "1", parameters: {}, outputCount: 1 }, context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId, conversationId } };
function version(index: number) {
  const suffix = indexSuffix(index);
  return MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: `version_page_${suffix}`, ownerId: owner, projectId, kind: "image", label: `Picture ${suffix}`, origin: { kind: "upload" }, sourceInputs: [], object: { identity: "verified", assetId: `image_${suffix}`, storagePath: `users/${owner}/previews/images/${suffix}.png`, generation: "1", sha256: "a".repeat(64), bytes: 64 }, metadata: { state: "verified", width: 32, height: 32, durationSeconds: 0, audio: "absent", contentType: "image/png", probeVersion: "controlled/1" }, association: "linked", createdAt: stamp });
}
function request(index: number) {
  const suffix = indexSuffix(index); const running = index === count - 1;
  return AcceptedRequestSchema.parse({ schemaVersion: "vidra-workflow/v2", id: `request_page_${suffix}`, ownerId: owner, projectId, conversationId, submissionId: `submission_page_${suffix}`, executionDraftId: `draft_page_${suffix}`, executionDraftRevision: 1, acceptanceSequence: index + 1, snapshotHash: "a".repeat(64), snapshot: content, materializedContext: { projectInstructions: "", entries: [] }, acceptedAt: stamp, slots: [{ id: `slot_page_${suffix}`, ordinal: 1, outcome: running ? "running" : "completed", delivery: running ? "none" : "ready", ...(running ? {} : { versionId: `version_page_${suffix}` }), usage: { mode: "free", reserved: 0, settled: 0 } }] });
}
beforeAll(async () => {
  await projects.create(owner, { id: projectId, name: "Large library" });
  const base = await conversations.create(owner, projectId, { id: conversationId, name: "Main" });
  const records: Array<{ ref: DocumentReference; data: Record<string, unknown> }> = [];
  for (let index = 0; index < count; index += 1) {
    const suffix = indexSuffix(index);
    const conversation = ConversationSchema.parse({ ...base, id: `conversation_page_${suffix}`, name: `Conversation ${suffix}`, acceptanceSequence: index === 0 ? count : 0 });
    const draft = CreationDraftSchema.parse({ schemaVersion: "vidra-workflow/v2", id: `draft_page_${suffix}`, ownerId: owner, projectId, conversationId, revision: 1, status: "submitted", ...content, createdAt: stamp, updatedAt: stamp });
    const picture = version(index);
    if (index < count - 1) picture.origin = { kind: "generated", requestId: request(index).id, slotId: request(index).slots[0]!.id };
    records.push({ ref: database.collection("creation_projects").doc(projectId).collection("conversations").doc(conversation.id), data: conversation }, { ref: database.collection("creation_projects").doc(projectId).collection("drafts").doc(draft.id), data: draft }, { ref: database.collection("creation_projects").doc(projectId).collection("media_versions").doc(picture.id), data: picture }, { ref: database.collection("creation_requests").doc(request(index).id), data: request(index) });
  }
  // Existing records may predate the optional draft-identity projection; listing must retain them too.
  for (let start = 0; start < records.length; start += 400) { const batch = database.batch(); for (const row of records.slice(start, start + 400)) batch.set(row.ref, row.data); await batch.commit(); }
});
afterAll(async () => { await database.terminate(); });
async function collect(read: (options: ListOptions) => Promise<WorkflowPage<{ id: string }>>): Promise<string[]> {
  const ids: string[] = []; let cursor: string | undefined;
  do { const page = await read({ limit: 37, cursor }); ids.push(...page.items.map(row => row.id)); cursor = page.nextCursor; } while (cursor);
  return ids;
}
it("traverses more than 200 tied media, conversation, draft and filtered request records without omissions or duplicates", async () => {
  const collections = await Promise.all([collect(options => media.page(owner, projectId, options)), collect(options => conversations.page(owner, projectId, options)), collect(options => drafts.page(owner, projectId, conversationId, options)), collect(options => history.page(owner, projectId, conversationId, options))]);
  for (const ids of collections) { expect(ids).toHaveLength(205); expect(new Set(ids).size).toBe(205); }
  expect(collections[0]).toContain("version_page_204"); expect(collections[1]).toContain("conversation_page_204"); expect(collections[2]).toContain("draft_page_204"); expect(collections[3]).toContain("request_page_204");
  expect(await media.list(owner, projectId)).toHaveLength(205); expect(await conversations.list(owner, projectId)).toHaveLength(205); expect(await drafts.list(owner, projectId, conversationId)).toHaveLength(205); expect(await history.list(owner, projectId, conversationId)).toHaveLength(205);
});
it("opens a conversation beyond the first page and rejects a request cursor reused for another conversation or owner", async () => {
  const first = await conversations.page(owner, projectId);
  expect(first.items.some(row => row.id === "conversation_page_204")).toBe(false);
  expect((await conversations.get(owner, projectId, "conversation_page_204")).id).toBe("conversation_page_204");
  const requests = await history.page(owner, projectId, conversationId, { limit: 37 });
  await expect(history.page(owner, projectId, "conversation_page_204", { cursor: requests.nextCursor })).rejects.toMatchObject({ code: "invalid_settings" });
  await expect(media.page("another-owner", projectId)).rejects.toMatchObject({ code: "access_denied" });
});
it("status polling and media refresh observe a late result beyond the original cap without invoking a provider", async () => {
  const record = request(204); const execute = vi.fn();
  const service = new WorkflowExecutionService(new WorkflowExecutionStore(database, media), { available: () => false, execute }, { materialize: vi.fn() });
  expect((await service.get(owner, record.id)).slots[0]?.outcome).toBe("running"); await service.drain();
  const late = MediaVersionSchema.parse({ ...version(999), origin: { kind: "generated", requestId: record.id, slotId: record.slots[0]!.id } });
  const batch = database.batch(); batch.set(database.collection("creation_projects").doc(projectId).collection("media_versions").doc(late.id), late); batch.set(database.collection("creation_requests").doc(record.id), { ...record, slots: [{ ...record.slots[0], outcome: "completed", delivery: "ready", versionId: late.id }] }); await batch.commit();
  expect((await service.get(owner, record.id)).slots[0]?.versionId).toBe("version_page_999"); await service.drain();
  const refreshed = await media.list(owner, projectId); expect(refreshed).toHaveLength(206); expect(refreshed.some(row => row.id === late.id)).toBe(true);
  expect(execute).not.toHaveBeenCalled();
});
