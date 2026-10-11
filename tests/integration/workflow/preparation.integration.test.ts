import { afterAll, beforeAll, expect, it } from "vitest";
import { ProjectStore } from "@services/projects/ProjectStore";
import { ConversationStore } from "@services/projects/ConversationStore";
import { CreationDraftStore } from "@services/creation-drafts/CreationDraftStore";
import { CreationContextService } from "@services/creation-context/CreationContextService";
import { ActionPreparationService } from "@services/creation-requests/preparation/ActionPreparationService";
import { CapabilityProfileSchema } from "@shared/schemas/workflow/capability.schemas";
import { createWorkflowTestDatabase } from "../helpers/workflow/emulator";

const database = createWorkflowTestDatabase();
const projects = new ProjectStore(database);
const conversations = new ConversationStore(database, projects);
const drafts = new CreationDraftStore(database, projects, conversations);
const contexts = new CreationContextService(database, projects);
const profile = CapabilityProfileSchema.parse({
  schemaVersion: "vidra-workflow/v2", id: "wan-t2v", revision: "1", label: "Wan 2.2",
  action: "make-video", provider: "controlled", endpoint: "wan-video/wan-2.2-t2v-fast", mode: "text-to-video",
  availability: "qualified", inputs: [], output: { kind: "video", maxCount: 1 }, maxContextCharacters: 32000,
  parameters: { numFrames: { policy: "editable", domain: { kind: "range", min: 81, max: 121, step: 1 }, defaultValue: 81 }, framesPerSecond: { policy: "editable", domain: { kind: "range", min: 5, max: 30, step: 1 }, defaultValue: 16 } },
  recovery: { start: "supported", status: "supported", cancel: "unsupported", result: "supported", deadlineSeconds: 600 }, generatedAudio: "unsupported", pricing: { mode: "free", maximumCreditsPerSlot: 0 },
});
const preparation = new ActionPreparationService({ database, projects, drafts, contexts, profiles: { get: id => id === profile.id ? profile : undefined }, media: { get: async () => undefined } });
afterAll(async () => { await database.terminate(); });
beforeAll(async () => {
  await projects.create("creator", { id: "project_prepare", name: "Campaign" });
  await conversations.create("creator", "project_prepare", { id: "conversation_prepare", name: "Ideas" });
});

it("ACTION-01 prepares direct video, preserves invalid settings and never invents a starting image", async () => {
  const content = { action: "make-video", instructions: "A runner on a floodlit track", inputs: [], settings: { profileId: "wan-t2v", profileRevision: "1", parameters: { numFrames: 81, framesPerSecond: 16 }, outputCount: 1 }, context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId: "project_prepare", conversationId: "conversation_prepare" } };
  await drafts.create("creator", "project_prepare", "conversation_prepare", { id: "draft_prepare", content });
  const ready = await preparation.prepare("creator", "project_prepare", "draft_prepare");
  expect(ready.state).toBe("ready");
  if (ready.state !== "ready") throw new Error("Expected direct video readiness");
  expect(ready.snapshot.inputs).toEqual([]);
  const invalid = { ...content, settings: { ...content.settings, parameters: { numFrames: 50, framesPerSecond: 16 } } };
  await drafts.save("creator", "project_prepare", "draft_prepare", { expectedRevision: 1, content: invalid });
  expect(await preparation.prepare("creator", "project_prepare", "draft_prepare")).toMatchObject({ state: "blocked", reasons: [{ code: "settings_invalid", field: "numFrames" }] });
  expect((await drafts.get("creator", "project_prepare", "draft_prepare")).settings.parameters.numFrames).toBe(50);
});

it("keeps an empty video draft blocked without starting hidden description assistance", async () => {
  await drafts.create("creator", "project_prepare", "conversation_prepare", { id: "draft_empty", content: {
    action: "make-video", instructions: "", inputs: [],
    settings: { profileId: "wan-t2v", profileRevision: "1", parameters: { numFrames: 81, framesPerSecond: 16 }, outputCount: 1 },
    context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 },
    destination: { projectId: "project_prepare", conversationId: "conversation_prepare" },
  } });
  expect(await preparation.prepare("creator", "project_prepare", "draft_empty")).toMatchObject({ state: "blocked", reasons: [{ code: "settings_invalid", field: "instructions" }] });
});
