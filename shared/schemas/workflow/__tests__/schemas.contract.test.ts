import { describe, expect, it } from "vitest";
import { CreationDraftSchema } from "../draft.schemas";
import { AcceptedRequestSchema } from "../request.schemas";
import { CapabilityProfileSchema } from "../capability.schemas";

describe("WP-01 execution draft wire contract", () => {
  it("retains an explicit pending input independently of the words and destination", () => {
    const draft = CreationDraftSchema.parse({
      schemaVersion: "vidra-workflow/v2",
      id: "draft_followup",
      ownerId: "creator",
      projectId: "project_campaign",
      conversationId: "conversation_first",
      revision: 3,
      status: "open",
      action: "edit-image",
      instructions: "Keep the camera low.",
      inputs: [{ role: "primary", state: "pending", requestId: "request_first", slotId: "slot_first" }],
      settings: { profileId: "image-edit", profileRevision: "1", parameters: { aspectRatio: "16:9" }, outputCount: 1 },
      context: { origin: "branch", requestIds: ["request_first"], projectInstructionsRevision: 1 },
      destination: { projectId: "project_campaign", conversationId: "conversation_first" },
      createdAt: "2026-10-10T20:00:00.000Z",
      updatedAt: "2026-10-10T20:00:01.000Z",
    });

    expect(draft.inputs).toEqual([{ role: "primary", state: "pending", requestId: "request_first", slotId: "slot_first" }]);
    expect(draft.instructions).toBe("Keep the camera low.");
    expect(draft.destination).toEqual({ projectId: "project_campaign", conversationId: "conversation_first" });
  });
});

describe("WP-01 accepted request wire contract", () => {
  const request = {
    schemaVersion: "vidra-workflow/v2",
    id: "request_video",
    ownerId: "creator",
    projectId: "project_campaign",
    conversationId: "conversation_first",
    submissionId: "submission_video",
    executionDraftId: "draft_video",
    executionDraftRevision: 2,
    acceptanceSequence: 1,
    snapshotHash: "a".repeat(64),
    snapshot: {
      action: "make-video", instructions: "A runner on a floodlit track.", inputs: [],
      settings: { profileId: "wan-t2v", profileRevision: "1", parameters: { numFrames: 81, framesPerSecond: 16 }, outputCount: 1 },
      context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 },
      destination: { projectId: "project_campaign", conversationId: "conversation_first" },
    },
    materializedContext: { projectInstructions: "", entries: [] },
    slots: [{ id: "slot_video", ordinal: 1, seed: 42, outcome: "queued", delivery: "none", usage: { mode: "free", reserved: 0, settled: 0 } }],
    acceptedAt: "2026-10-10T20:00:00.000Z",
  };

  it("captures a direct video request without requiring a starting picture", () => {
    expect(AcceptedRequestSchema.parse(request).snapshot.inputs).toEqual([]);
  });

  it("rejects unresolved accepted inputs and a nonzero free reservation", () => {
    expect(AcceptedRequestSchema.safeParse({ ...request, snapshot: { ...request.snapshot, inputs: [{ role: "start-frame", state: "pending", requestId: "request_image", slotId: "slot_image" }] } }).success).toBe(false);
    expect(AcceptedRequestSchema.safeParse({ ...request, slots: [{ ...request.slots[0], usage: { mode: "free", reserved: 1, settled: 0 } }] }).success).toBe(false);
  });

  it("rejects shifted or duplicated slots and unknown schema/action identities", () => {
    expect(AcceptedRequestSchema.safeParse({ ...request, slots: [{ ...request.slots[0], ordinal: 2 }] }).success).toBe(false);
    expect(AcceptedRequestSchema.safeParse({ ...request, schemaVersion: "vidra-workflow/v3" }).success).toBe(false);
    expect(AcceptedRequestSchema.safeParse({ ...request, snapshot: { ...request.snapshot, action: "make-anything" } }).success).toBe(false);
  });
});

describe("WP-01 resolved capability profile", () => {
  it("requires explicit defaults and recovery facts instead of guessing permission", () => {
    const profile = {
      schemaVersion: "vidra-workflow/v2", id: "wan-t2v", revision: "1", label: "Wan 2.2",
      action: "make-video", provider: "replicate", endpoint: "wan-video/wan-2.2-t2v-fast", mode: "text-to-video",
      availability: "qualified", inputs: [], output: { kind: "video", maxCount: 1 }, maxContextCharacters: 32000,
      parameters: { numFrames: { policy: "editable", domain: { kind: "range", min: 81, max: 121, step: 1 }, defaultValue: 81 } },
      recovery: { start: "supported", status: "supported", cancel: "unsupported", result: "supported", deadlineSeconds: 600 },
      generatedAudio: "unsupported", pricing: { mode: "free", maximumCreditsPerSlot: 0 },
    };
    expect(CapabilityProfileSchema.parse(profile).generatedAudio).toBe("unsupported");
    expect(CapabilityProfileSchema.safeParse({ ...profile, recovery: { ...profile.recovery, deadlineSeconds: undefined } }).success).toBe(false);
    expect(CapabilityProfileSchema.safeParse({ ...profile, parameters: { numFrames: { policy: "editable", domain: { kind: "range", min: 81, max: 121, step: 1 } } } }).success).toBe(false);
  });
});
