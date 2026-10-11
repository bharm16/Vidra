import { afterAll, expect, it } from "vitest";
import { ProjectStore } from "@services/projects/ProjectStore";
import { ConversationStore } from "@services/projects/ConversationStore";
import { CreationDraftStore } from "@services/creation-drafts/CreationDraftStore";
import { CreationContextService } from "@services/creation-context/CreationContextService";
import { ActionPreparationService } from "@services/creation-requests/preparation/ActionPreparationService";
import { RequestIdempotencyService } from "@services/admission/idempotency/RequestIdempotencyService";
import { CapabilityProfileSchema } from "@shared/schemas/workflow/capability.schemas";
import { createWorkflowTestDatabase } from "../helpers/workflow/emulator";

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
const preparation = new ActionPreparationService({ database, projects, drafts, contexts, profiles: { get: id => id === profile.id ? profile : undefined }, media: { get: async () => undefined } });
const receipts = new RequestIdempotencyService(undefined, { database });
afterAll(async () => { await database.terminate(); });

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
