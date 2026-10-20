import { expect, it } from "vitest";
import { CapabilityProfileSchema, type CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import { ConversationIdSchema, ProjectIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { emptyDraftContent } from "../state/inputBinding";
import { settingsForOutput } from "../state/capabilitySettings";

function profile(id: string, action: "make-image" | "make-video", maxCount: number, availability: "qualified" | "unqualified" = "qualified"): CapabilityProfile {
  return CapabilityProfileSchema.parse({ schemaVersion: "vidra-workflow/v2", id, revision: "1", label: id, action, provider: "controlled", endpoint: `controlled/${id}`, mode: action === "make-image" ? "text-to-image" : "text-to-video", availability, inputs: [], output: { kind: action === "make-image" ? "image" : "video", maxCount }, maxContextCharacters: 32000, parameters: {}, recovery: { start: "supported", status: "supported", cancel: "supported", result: "supported", deadlineSeconds: 600 }, generatedAudio: "unsupported", pricing: { mode: "free", maximumCreditsPerSlot: 0 } });
}
const project = ProjectIdSchema.parse("project_switch");
const conversation = ConversationIdSchema.parse("conversation_switch");
const picture = profile("picture", "make-image", 4);
const closed = profile("closed-video", "make-video", 1, "unqualified");
const first = profile("first-video", "make-video", 1);
const second = profile("second-video", "make-video", 1);

it("gives a switched output its first qualified model instead of Choose model", () => {
  const content = emptyDraftContent("make-image", project, conversation, 1);
  expect(settingsForOutput(content, "make-video", [picture, closed, first, second])).toMatchObject({ profileId: "first-video", profileRevision: "1" });
});

it("restores the model last used for that output", () => {
  const content = emptyDraftContent("make-image", project, conversation, 1);
  const remembered = { profileId: "second-video", profileRevision: "1", parameters: {}, outputCount: 1 };
  expect(settingsForOutput(content, "make-video", [picture, first, second], remembered)).toMatchObject({ profileId: "second-video" });
});

it("keeps Choose model when the output has no qualified model", () => {
  const content = emptyDraftContent("make-image", project, conversation, 1);
  expect(settingsForOutput(content, "make-video", [picture, closed])).toMatchObject({ profileId: "unselected", profileRevision: "unresolved" });
});

it("never carries more results than the new model makes", () => {
  const content = { ...emptyDraftContent("make-image", project, conversation, 1), settings: { profileId: "picture", profileRevision: "1", parameters: {}, outputCount: 4 } };
  expect(settingsForOutput(content, "make-video", [picture, first]).outputCount).toBe(1);
});
