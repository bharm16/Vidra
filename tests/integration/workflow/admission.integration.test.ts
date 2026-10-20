import { afterAll, expect, it } from "vitest";
import { ProjectStore } from "@services/projects/ProjectStore";
import { ConversationStore } from "@services/projects/ConversationStore";
import { CreationDraftStore } from "@services/creation-drafts/CreationDraftStore";
import { CreationContextService } from "@services/creation-context/CreationContextService";
import { ActionPreparationService } from "@services/creation-requests/preparation/ActionPreparationService";
import { RequestIdempotencyService } from "@services/admission/idempotency/RequestIdempotencyService";
import { FirestoreCircuitExecutor } from "@services/firestore/FirestoreCircuitExecutor";
import { CapabilityProfileSchema } from "@shared/schemas/workflow/capability.schemas";
import { createWorkflowTestDatabase } from "../helpers/workflow/emulator";
import { acceptWorkflowRequest, readWorkflowRequest, workflowReceiptId } from "@services/admission/idempotency/workflowReceipts";
import { sha256Hex } from "@utils/hash";

const database = createWorkflowTestDatabase();
const projects = new ProjectStore(database);
const conversations = new ConversationStore(database, projects);
const drafts = new CreationDraftStore(database, projects, conversations);
const contexts = new CreationContextService(database, projects);
const profile = CapabilityProfileSchema.parse({
  schemaVersion: "vidra-workflow/v2", id: "controlled-video", revision: "1", label: "Controlled video",
  action: "make-video", provider: "controlled", endpoint: "controlled/video", mode: "text-to-video", availability: "qualified",
  inputs: [], output: { kind: "video", maxCount: 1 }, maxContextCharacters: 32000, parameters: {},
  recovery: { start: "supported", status: "supported", cancel: "unsupported", result: "supported", deadlineSeconds: 600 }, generatedAudio: "unsupported", pricing: { mode: "free", maximumCreditsPerSlot: 0 },
});
const fixedSeedProfile = CapabilityProfileSchema.parse({ ...profile, id: "controlled-fixed-seed", parameters: { seed: { policy: "fixed", value: 7 } }, output: { kind: "video", maxCount: 2 } });
const preparation = new ActionPreparationService({ database, projects, conversations, drafts, contexts, profiles: { get: id => [profile, fixedSeedProfile].find(candidate => candidate.id === id) }, media: { get: async () => undefined } });
// Real emulator transactions may back off under lock contention; keep that
// concurrency proof independent of the production transport response deadline.
const receipts = new RequestIdempotencyService(new FirestoreCircuitExecutor(), { database });
afterAll(async () => { await database.terminate(); });

it("refuses export-tagged canonical receipt and consumed-draft identities before interpreting them as media", async () => {
  const tag = { kind: "video-export/v1", ownerId: "creator", projectId: "project_cross_kind", editId: "edit_cross_kind", exportId: "export_cross_kind", payloadHash: "c".repeat(64) };
  const command = { submissionId: "submission_cross_kind", draftId: "draft_cross_kind", draftRevision: 1, reviewedHash: "a".repeat(64) };
  const ref = database.collection("request_idempotency").doc(workflowReceiptId("creator", command.submissionId));
  await ref.create(tag);
  const submit = async (): Promise<unknown> => acceptWorkflowRequest(database, { ownerId: "creator", projectId: "project_cross_kind", command, prepare: async () => { throw new Error("Cross-kind collision must be rejected before preparing a new request"); } });
  await expect(submit()).rejects.toMatchObject({ code: "submission_conflict" });
  await expect(readWorkflowRequest(database, "creator", command.submissionId)).rejects.toMatchObject({ code: "submission_conflict" });
  await ref.delete();
  await database.collection("creation_consumed_drafts").doc(sha256Hex(`creator|${command.draftId}|1`)).create(tag);
  await expect(submit()).rejects.toMatchObject({ code: "submission_conflict" });
});

it("JOB-02 competing submission IDs converge and a lost acceptance response recovers the original request", async () => {
  await projects.create("creator", { id: "project_admission", name: "Campaign" });
  await conversations.create("creator", "project_admission", { id: "conversation_admission", name: "Ideas" });
  await drafts.create("creator", "project_admission", "conversation_admission", { id: "draft_admission", content: {
    action: "make-video", instructions: "A runner on a floodlit track", inputs: [],
    settings: { profileId: profile.id, profileRevision: "1", parameters: {}, outputCount: 1 },
    context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 },
    destination: { projectId: "project_admission", conversationId: "conversation_admission" },
  } });
  const ready = await preparation.prepare("creator", "project_admission", "draft_admission");
  if (ready.state !== "ready") throw new Error("Fixture must reach the admission boundary");
  const submit = (submissionId: string, reviewedHash = ready.reviewedHash) => receipts.acceptWorkflow({
    ownerId: "creator", projectId: "project_admission",
    command: { submissionId, draftId: "draft_admission", draftRevision: 1, reviewedHash },
    prepare: transaction => preparation.prepareInTransaction(transaction, "creator", "project_admission", "draft_admission"),
  });
  const [first, second] = await Promise.all([submit("submission_first"), submit("submission_second")]);
  expect(second.id).toBe(first.id);
  expect(second.slots.map(slot => slot.id)).toEqual(first.slots.map(slot => slot.id));
  expect(first.slots[0]?.usage).toEqual({ mode: "free", reserved: 0, settled: 0 });
  expect((await receipts.getWorkflowRequest("creator", "submission_second"))?.id).toBe(first.id);
  expect((await drafts.get("creator", "project_admission", "draft_admission")).status).toBe("submitted");
  await expect(submit("submission_first", "b".repeat(64))).rejects.toMatchObject({ code: "submission_conflict" });
  expect(await receipts.getWorkflowRequest("other-owner", "submission_first")).toBeUndefined();
});

it("freezes a valid seed for every output slot before review and acceptance", async () => {
  await projects.create("creator", { id: "project_seeds", name: "Seeds" });
  await conversations.create("creator", "project_seeds", { id: "conversation_seeds", name: "Seeds" });
  await drafts.create("creator", "project_seeds", "conversation_seeds", { id: "draft_seeds", content: {
    action: "make-video", instructions: "A runner", inputs: [],
    settings: { profileId: fixedSeedProfile.id, profileRevision: "1", parameters: { seed: 7 }, outputCount: 2 },
    context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 },
    destination: { projectId: "project_seeds", conversationId: "conversation_seeds" },
  } });
  const ready = await preparation.prepare("creator", "project_seeds", "draft_seeds");
  if (ready.state !== "ready") throw new Error("Fixture must reach admission with the exact fixed seed");
  await expect(receipts.acceptWorkflow({ ownerId: "creator", projectId: "project_seeds", command: { submissionId: "submission_invalid_seed_plan", draftId: "draft_seeds", draftRevision: 1, reviewedHash: ready.reviewedHash }, prepare: async () => ({ ...ready, slotPlan: [{ ordinal: 1, seed: 7 }, { ordinal: 2, seed: 8 }] }) })).rejects.toThrow("The effective slot seed must match the reviewed seed policy and domain");
  expect(await receipts.getWorkflowRequest("creator", "submission_invalid_seed_plan")).toBeUndefined();
  expect((await drafts.get("creator", "project_seeds", "draft_seeds")).status).toBe("open");
  const request = await receipts.acceptWorkflow({ ownerId: "creator", projectId: "project_seeds", command: { submissionId: "submission_seeds", draftId: "draft_seeds", draftRevision: 1, reviewedHash: ready.reviewedHash }, prepare: transaction => preparation.prepareInTransaction(transaction, "creator", "project_seeds", "draft_seeds") });
  expect(request.slots.map(slot => slot.seed)).toEqual([7, 7]);
  expect(ready.slotPlan.map(slot => slot.seed)).toEqual([7, 7]);
});
