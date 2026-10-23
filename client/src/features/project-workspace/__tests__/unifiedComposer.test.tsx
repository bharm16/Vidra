import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CapabilityProfileSchema, type CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import { DraftContentSchema, DraftInputSchema } from "@shared/schemas/workflow/draft.schemas";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import { AcceptedRequestSchema } from "@shared/schemas/workflow/request.schemas";
import { AdvancedSettings } from "../components/AdvancedSettings";
import { CapabilitySettings } from "../components/CapabilitySettings";
import { GenerationFeed } from "../components/GenerationFeed";
import { inputsForAction, inputsWithResult, offeredInputRoles } from "../state/inputBinding";
import { verbsForResult } from "../state/resultVerbs";

afterEach(cleanup);
const at = "2026-10-22T05:00:00.000Z";
const base = { schemaVersion: "vidra-workflow/v2", revision: "1", provider: "controlled", mode: "controlled", availability: "qualified", maxContextCharacters: 32000, constraints: [], recovery: { start: "supported", status: "supported", cancel: "unsupported", result: "supported", deadlineSeconds: 600 }, generatedAudio: "unsupported", pricing: { mode: "free", maximumCreditsPerSlot: 0 } };
function profile(fields: Record<string, unknown>): CapabilityProfile { return CapabilityProfileSchema.parse({ ...base, ...fields }); }
const picture = profile({ id: "picture", label: "Picture model", action: "make-image", endpoint: "controlled/picture", inputs: [{ role: "reference", kinds: ["image"], minCount: 0, maxCount: 4 }], output: { kind: "image", maxCount: 4 }, parameters: {}, presentation: { words: "required", parameters: {} } });
const voice = profile({ id: "voice", label: "Voice model", action: "make-voiceover", endpoint: "controlled/voice", inputs: [], output: { kind: "audio", maxCount: 2 }, parameters: {
  voice: { policy: "editable", domain: { kind: "enum", values: ["Rachel", "Drew"] }, defaultValue: "Rachel" },
  stability: { policy: "editable", domain: { kind: "range", min: 0, max: 1, step: 0.01 }, defaultValue: 0.5 },
  previousText: { policy: "editable", domain: { kind: "text", maxLength: 100 }, defaultValue: "" },
  seed: { policy: "editable", domain: { kind: "range", min: -1, max: 100, step: 1 }, defaultValue: -1 },
}, presentation: { words: "script", parameters: { voice: { label: "Voice", role: "voice" }, stability: { label: "Stability", format: "fraction" }, previousText: { label: "Text before", placeholder: "Words spoken just before this script" }, seed: { label: "Seed", hidden: true } } } });
const upscale = profile({ id: "upscale", label: "Upscaler", action: "upscale-video", endpoint: "controlled/upscale", inputs: [{ role: "clip", kinds: ["video"], minCount: 1, maxCount: 1 }], output: { kind: "video", maxCount: 1 }, parameters: {}, presentation: { words: "none", parameters: {} } });
const captions = profile({ id: "captions", label: "Captioner", action: "transcribe", endpoint: "controlled/captions", inputs: [{ role: "primary", kinds: ["video", "audio"], minCount: 1, maxCount: 1 }], output: { kind: "text", maxCount: 1 }, parameters: {}, presentation: { words: "none", parameters: {} } });
const content = (action: "make-image" | "make-voiceover" | "upscale-video", profileId = "unselected") => DraftContentSchema.parse({ action, instructions: "", inputs: [], settings: { profileId, profileRevision: profileId === "unselected" ? "unresolved" : "1", parameters: {}, outputCount: 1 }, context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId: "project_current", conversationId: "conversation_current" } });
const clip = MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_clip", ownerId: "owner", projectId: "project_current", kind: "video", label: "Stadium clip", origin: { kind: "generated", requestId: "request_clip", slotId: "slot_clip" }, sourceInputs: [], object: { identity: "unknown", assetId: "clip", storagePath: "users/owner/clip" }, metadata: { state: "verified", width: 1920, height: 1080, durationSeconds: 4, audio: "present", probeVersion: "controlled" }, association: "linked", createdAt: at });
const still = MediaVersionSchema.parse({ ...clip, id: "version_still", kind: "image", label: "Desk", metadata: { state: "verified", width: 1920, height: 1080, durationSeconds: 0, audio: "absent", probeVersion: "controlled" } });

it("moves each input to the role the new place uses for its kind and parks the rest (Rule 4)", () => {
  const reference = DraftInputSchema.parse({ state: "resolved", role: "reference", versionId: still.id });
  const source = DraftInputSchema.parse({ state: "resolved", role: "clip", versionId: clip.id });
  expect(inputsForAction([reference, source], "make-image", [picture, upscale], [still, clip])).toEqual({ inputs: [reference], parked: [source] });
  expect(inputsForAction([reference, source], "upscale-video", [picture, upscale], [still, clip])).toEqual({ inputs: [source], parked: [reference] });
  expect(inputsForAction([{ ...source, role: "primary" }], "transcribe", [captions], [clip]).inputs).toEqual([{ ...source, role: "primary" }]);
});

it("binds a result in its verb's role first and moves or parks the inputs already there (Rule 8)", () => {
  const reference = DraftInputSchema.parse({ state: "resolved", role: "reference", versionId: still.id });
  expect(inputsWithResult([reference], "upscale-video", clip.id, "clip", [picture, upscale], [still, clip])).toEqual({ inputs: [{ state: "resolved", role: "clip", versionId: clip.id }], parked: [reference] });
  expect(inputsWithResult([reference], "make-image", still.id, "reference", [picture], [still]).inputs).toEqual([reference]);
});

it("lets Auto choose a text setting such as Captions' Language", () => {
  const scribe = profile({ ...captions, id: "scribe", parameters: { languageCode: { policy: "editable", domain: { kind: "text", maxLength: 8 }, defaultValue: "" } }, presentation: { words: "none", parameters: { languageCode: { label: "Language", role: "language", format: "language" } } } });
  render(<CapabilitySettings profiles={[scribe]} content={{ ...content("upscale-video"), action: "transcribe" }} media={[]} disabled={false} onProfile={vi.fn()} onAuto={vi.fn()} onChange={vi.fn()} />);
  expect(screen.getByRole("button", { name: /^Language/ })).toBeEnabled();
});

it("offers every role a place's models take, not only pictures", () => {
  expect(offeredInputRoles(content("upscale-video"), [upscale])).toEqual(["clip"]);
  expect(offeredInputRoles({ ...content("upscale-video"), action: "transcribe" }, [captions])).toEqual(["primary"]);
});

it("keeps voice as a core chip and the long tail under Advanced, with seeds kept out", () => {
  render(<CapabilitySettings profiles={[voice]} content={{ ...content("make-voiceover", "voice"), settings: { profileId: "voice", profileRevision: "1", parameters: { voice: "Rachel", stability: 0.5, previousText: "", seed: -1 }, outputCount: 1 } }} media={[]} disabled={false} onProfile={vi.fn()} onChange={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Voice: Rachel" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Results: 1 take" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Advanced" })).toBeInTheDocument();
});

it("draws Advanced as one field per setting: a labelled slider and a text field, never the seed", () => {
  const change = vi.fn();
  const current = { ...content("make-voiceover", "voice"), settings: { profileId: "voice", profileRevision: "1", parameters: { voice: "Rachel", stability: 0.5, previousText: "", seed: -1 }, outputCount: 1 } };
  render(<AdvancedSettings profile={voice} content={current} disabled={false} onChange={change} />);
  fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
  expect(screen.getByText("50%")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Text before" })).toHaveAttribute("placeholder", "Words spoken just before this script");
  expect(screen.queryByText("Seed")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "Text before" }), { target: { value: "We open at six." } });
  fireEvent.blur(screen.getByRole("textbox", { name: "Text before" }));
  expect(change).toHaveBeenCalledWith({ ...current, settings: { ...current.settings, parameters: { ...current.settings.parameters, previousText: "We open at six." } } });
});

it("lists a clip's verbs from the profiles that take clips, in Figma's order", () => {
  const edit = profile({ id: "edit", label: "Editor", action: "edit-video", endpoint: "controlled/edit", inputs: [{ role: "clip", kinds: ["video"], minCount: 1, maxCount: 1 }], output: { kind: "video", maxCount: 1 }, parameters: {} });
  expect(verbsForResult(clip, [edit, upscale, captions], { variation: true }).map(verb => verb.label)).toEqual(["Edit", "Upscale", "Make captions", "Use a frame", "Add to video"]);
  expect(verbsForResult(still, [picture], { variation: true }).map(verb => verb.label)).toEqual(["New variation", "Use as reference"]);
  const cutout = profile({ id: "cutout", label: "Cutout", action: "remove-background", endpoint: "controlled/cutout", inputs: [{ role: "primary", kinds: ["image"], minCount: 1, maxCount: 1 }], output: { kind: "image", maxCount: 1 }, parameters: {} });
  expect(verbsForResult(still, [picture, cutout], { variation: true }).map(verb => verb.label)).toEqual(["New variation", "Remove background", "Use as reference"]);
});

it("shows each result's verbs as buttons in the feed and opens the composer bound to it", () => {
  const request = AcceptedRequestSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "request_clip", ownerId: "owner", projectId: "project_current", conversationId: "conversation_current", submissionId: "submission_clip", executionDraftId: "draft_clip", executionDraftRevision: 1, acceptanceSequence: 1, snapshotHash: "a".repeat(64), snapshot: { action: "make-video", instructions: "Night falls over the stadium.", inputs: [], settings: { profileId: "unknown", profileRevision: "1", parameters: {}, outputCount: 1 }, context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId: "project_current", conversationId: "conversation_current" } }, materializedContext: { projectInstructions: "", entries: [] }, slots: [{ id: "slot_clip", ordinal: 1, outcome: "completed", delivery: "ready", versionId: clip.id, usage: { mode: "free", reserved: 0, settled: 0 } }], acceptedAt: at });
  const onVerb = vi.fn(); const onOpen = vi.fn();
  render(<GenerationFeed requests={[request]} media={[clip]} profiles={[upscale]} pending={[]} viewedVersionId={undefined} access={async () => ({ url: "/clip.mp4" })} onOpen={onOpen} onVerb={onVerb} onDownload={vi.fn()} onRetry={vi.fn()} onRecover={vi.fn()} onApplyText={vi.fn()} />);
  const block = screen.getByRole("article", { name: "Night falls over the stadium." });
  const actions = within(block).getByRole("group", { name: "Result actions" });
  expect(within(actions).getAllByRole("button").map(button => button.textContent || button.getAttribute("aria-label"))).toEqual(["Upscale", "Use a frame", "Add to video", "Download original"]);
  fireEvent.click(within(actions).getByRole("button", { name: "Upscale" }));
  expect(onVerb).toHaveBeenCalledWith(expect.objectContaining({ kind: "action", action: "upscale-video", role: "clip" }), clip, request);
  fireEvent.click(within(block).getByRole("button", { name: "Open Stadium clip" }));
  expect(onOpen).toHaveBeenCalledWith(clip.id);
});
