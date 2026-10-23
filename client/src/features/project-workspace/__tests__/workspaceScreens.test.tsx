import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MediaVersionSchema, type MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { CapabilityProfileSchema } from "@shared/schemas/workflow/capability.schemas";
import { DraftContentSchema } from "@shared/schemas/workflow/draft.schemas";
import { AcceptedRequestSchema } from "@shared/schemas/workflow/request.schemas";
import { VersionsPanel } from "../components/VersionsPanel";
import { CapabilitySettings } from "../components/CapabilitySettings";
import { MediaViewer } from "../components/MediaViewer";
import { ConversationHistory } from "../components/ConversationHistory";
import { versionTree } from "../state/versionTree";
import { capabilityProblems, derivedParameter } from "../state/capabilitySettings";

const timestamp = "2026-10-17T06:00:00.000Z";
function media(id: string, parent?: string, role = "primary"): MediaVersion {
  return MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: `version_${id}`, ownerId: "owner", projectId: "project_current", kind: "image", label: id, origin: { kind: "upload" }, sourceInputs: parent ? [{ state: "resolved", role, versionId: `version_${parent}` }] : [], object: { identity: "unknown", assetId: id, storagePath: `uploads/owner/${id}` }, metadata: { state: "verified", width: 1920, height: 1080, durationSeconds: 0, audio: "absent", probeVersion: "test" }, association: "linked", createdAt: timestamp });
}
const bareProfile = CapabilityProfileSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "model", revision: "1", label: "Qualified model", action: "make-video", provider: "controlled", endpoint: "controlled/video", mode: "text-to-video", availability: "qualified", inputs: [], output: { kind: "video", maxCount: 1 }, maxContextCharacters: 32000, parameters: { duration: { policy: "editable", domain: { kind: "enum", values: [5, 10] }, defaultValue: 5 }, aspectRatio: { policy: "fixed", value: "16:9" }, resolution: { policy: "editable", domain: { kind: "enum", values: ["720p", "1080p"] }, defaultValue: "720p" } }, constraints: [{ parameter: "resolution", equals: "1080p", requires: { duration: [10] }, reason: "1080p requires a ten second clip." }], recovery: { start: "supported", status: "supported", cancel: "supported", result: "supported", deadlineSeconds: 600 }, generatedAudio: "always", pricing: { mode: "free", maximumCreditsPerSlot: 0 } });
const SHOWN = { duration: { label: "Duration", role: "duration", format: "seconds" }, durationSeconds: { label: "Duration", role: "duration", format: "seconds" }, aspectRatio: { label: "Shape", role: "shape" }, resolution: { label: "Resolution", role: "resolution" }, numFrames: { label: "Frames" } } as const;
function shown(parameters: Record<string, unknown>): { words: "required"; parameters: Record<string, (typeof SHOWN)[keyof typeof SHOWN]> } { return { words: "required", parameters: Object.fromEntries(Object.keys(parameters).flatMap(name => name in SHOWN ? [[name, SHOWN[name as keyof typeof SHOWN]]] : [])) }; }
const profile = CapabilityProfileSchema.parse({ ...bareProfile, presentation: shown(bareProfile.parameters) });
const content = DraftContentSchema.parse({ action: "make-video", instructions: "Keep the camera low", inputs: [], settings: { profileId: "model", profileRevision: "1", parameters: { duration: 5, aspectRatio: "16:9", resolution: "720p" }, outputCount: 1 }, context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId: "project_current", conversationId: "conversation_current" } });
const access = vi.fn(async (id: string) => ({ url: `/media/${id}.png` }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("draws the actual selected branch and keeps row selection separate from editing/preference", async () => {
  const versions = [media("1"), media("2", "1"), media("3", "2"), media("4", "1"), media("unrelated", "1", "reference")];
  expect(versionTree(versions, "version_2").map(row => [row.version.id, row.depth, row.nextSibling, row.ancestorRails])).toEqual([["version_1", 0, false, []], ["version_2", 1, true, []], ["version_3", 2, false, [true]], ["version_4", 1, false, []]]);
  const onView = vi.fn(); const onEdit = vi.fn(); const onPreferred = vi.fn();
  render(<VersionsPanel versions={versions} selectedVersionId="version_2" preferredVersionId="version_1" access={access} onView={onView} onClose={vi.fn()} onEdit={onEdit} onPreferred={onPreferred} />);
  fireEvent.click(screen.getByRole("button", { name: "View version 4: 4" }));
  expect(onView).toHaveBeenCalledWith("version_4");
  expect(onEdit).not.toHaveBeenCalled(); expect(onPreferred).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Edit v2" }));
  expect(onEdit).toHaveBeenCalledWith(versions[1]);
  expect(screen.queryByText("unrelated")).not.toBeInTheDocument();
  await waitFor(() => expect(access).toHaveBeenCalledTimes(4));
});

it("shows preferred state as inert and keeps broken ancestry bounded", async () => {
  const first = media("a", "b"); const second = media("b", "a");
  expect(versionTree([first, second], first.id).length).toBeLessThanOrEqual(2);
  render(<VersionsPanel versions={[media("one")]} selectedVersionId="version_one" preferredVersionId="version_one" access={access} onView={vi.fn()} onClose={vi.fn()} onPreferred={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Preferred" })).toBeDisabled();
  await waitFor(() => expect(access).toHaveBeenCalled());
});

it("keeps variation unavailable without a saved setup and makes version mutations inert in read-only work", async () => {
  const version = media("imported");
  const props = { versions: [version], selectedVersionId: version.id, access, onView: vi.fn(), onClose: vi.fn(), onPreferred: vi.fn(), onVariation: vi.fn(), onEdit: vi.fn(), canVary: (): boolean => false };
  const { rerender } = render(<VersionsPanel {...props} />);
  expect(screen.getByRole("button", { name: "New variation" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Edit v1" })).toBeEnabled();
  rerender(<VersionsPanel {...props} readOnly />);
  expect(screen.getByRole("button", { name: "Make preferred" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Edit v1" })).toBeDisabled();
  expect(props.onVariation).not.toHaveBeenCalled();
  await waitFor(() => expect(access).toHaveBeenCalled());
});

it("renders only editable capability values as dropdowns and retains words when a setting changes", async () => {
  const onChange = vi.fn();
  render(<CapabilitySettings profiles={[profile]} content={content} media={[]} disabled={false} onProfile={vi.fn()} onChange={onChange} />);
  expect(screen.getByLabelText("Shape: 16:9").tagName).toBe("SPAN");
  expect(screen.getByLabelText("Sound: Sound included").tagName).toBe("SPAN");
  expect(screen.queryByRole("button", { name: /sound/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Duration: 5s" }));
  fireEvent.click(await screen.findByRole("button", { name: "10s" }));
  expect(onChange).toHaveBeenCalledWith({ ...content, settings: { ...content.settings, parameters: { ...content.settings.parameters, duration: 10 } } });
});

it("reports stale and coupled settings without silently replacing them", () => {
  const incompatible = { ...content, settings: { ...content.settings, parameters: { duration: 7, resolution: "1080p", aspectRatio: "1:1" } } };
  expect(capabilityProblems(profile, incompatible)).toEqual(expect.arrayContaining(["Choose an available duration for this model.", "Shape must be 16:9 for this model.", "1080p requires a ten second clip."]));
  expect(incompatible.settings.parameters.duration).toBe(7);
  expect(derivedParameter({ policy: "derived", from: "input-aspect", role: "primary" }, { ...content, inputs: [{ state: "resolved", role: "primary", versionId: media("input").id }] }, [media("input")])).toBe("16:9");
});

it("keeps saved choices readable without guessing editable domains for an unresolved model", () => {
  const unresolved = { ...content, settings: { ...content.settings, profileId: "missing", parameters: { aspectRatio: "16:9", duration: 5, negativePrompt: "Adapter-only value" } } };
  const original = structuredClone(unresolved);
  const onChange = vi.fn(); const onProfile = vi.fn();
  render(<CapabilitySettings profiles={[profile]} content={unresolved} media={[]} disabled={false} onProfile={onProfile} onChange={onChange} />);
  const shape = screen.getByLabelText("Shape: 16:9");
  const duration = screen.getByLabelText("Duration: 5s");
  expect(shape.tagName).toBe("SPAN"); expect(duration.tagName).toBe("SPAN");
  expect(screen.queryByRole("button", { name: /^Shape:|^Duration:/ })).not.toBeInTheDocument();
  expect(screen.queryByText("Adapter-only value")).not.toBeInTheDocument();
  fireEvent.click(shape); fireEvent.click(duration);
  expect(onChange).not.toHaveBeenCalled(); expect(onProfile).not.toHaveBeenCalled();
  expect(unresolved).toEqual(original);
});

it("does not invent saved settings for a restored model that is no longer offered", () => {
  const initial = { ...content, settings: { ...content.settings, profileId: "missing", parameters: {} } };
  render(<CapabilitySettings profiles={[profile]} content={initial} media={[]} disabled={false} onProfile={vi.fn()} onChange={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Model: Choose model" })).toBeInTheDocument();
  expect(screen.queryByText("5s")).not.toBeInTheDocument();
  expect(screen.queryByText("16:9")).not.toBeInTheDocument();
});

it("keeps adapter serialization fields out of creation controls and puts the frame count under Advanced", async () => {
  const bare = CapabilityProfileSchema.parse({ ...bareProfile, parameters: { aspectRatio: profile.parameters.aspectRatio, durationSeconds: { policy: "derived", from: "frame-duration" }, numFrames: { policy: "editable", domain: { kind: "enum", values: [81, 121] }, defaultValue: 81 }, framesPerSecond: { policy: "fixed", value: 16 }, negativePrompt: { policy: "fixed", value: "Provider-only default" }, outputFormat: { policy: "fixed", value: "webp" }, outputQuality: { policy: "fixed", value: 80 } }, constraints: [], generatedAudio: "unsupported" });
  const framed = CapabilityProfileSchema.parse({ ...bare, presentation: shown(bare.parameters) });
  const framedContent = { ...content, settings: { ...content.settings, parameters: { aspectRatio: "16:9", numFrames: 81, framesPerSecond: 16, negativePrompt: "Provider-only default", outputFormat: "webp", outputQuality: 80 } } };
  const onChange = vi.fn();
  render(<CapabilitySettings profiles={[framed]} content={framedContent} media={[]} disabled={false} onProfile={vi.fn()} onChange={onChange} />);
  expect(screen.queryByText("Provider-only default")).not.toBeInTheDocument();
  expect(screen.queryByText("WebP")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Duration: ~5.1s")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
  fireEvent.click(await screen.findByRole("button", { name: /^Frames/ }));
  fireEvent.click(screen.getByRole("button", { name: "121" }));
  expect(onChange).toHaveBeenCalledWith({ ...framedContent, settings: { ...framedContent.settings, parameters: { ...framedContent.settings.parameters, numFrames: 121 } } });
});

it("keeps the viewer anonymous with one docked toolbar and explicit Use actions", async () => {
  const version = media("shown"); const onEdit = vi.fn(); const onReuseSetup = vi.fn();
  render(<MediaViewer version={version} access={access} onUseInput={vi.fn()} onReuseSetup={onReuseSetup} canReuseSetup onEdit={onEdit} />);
  expect(await screen.findByRole("img", { name: "shown" })).toHaveAttribute("src", "/media/version_shown.png");
  expect(screen.queryByText("shown")).not.toBeInTheDocument();
  expect(screen.getByRole("contentinfo", { name: "Media controls" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Toggle full screen" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Use" }));
  const edit = await screen.findByRole("button", { name: "Edit image" });
  expect(screen.getByRole("region", { name: "Media viewer" })).toContainElement(edit);
  fireEvent.click(edit);
  expect(onEdit).toHaveBeenCalledWith(version); expect(onReuseSetup).not.toHaveBeenCalled();
});

it("keeps an empty monitor quiet while retaining an actual service banner", () => {
  render(<MediaViewer version={undefined} access={access} onUseInput={vi.fn()} onReuseSetup={vi.fn()} canReuseSetup={false} banner={<p>You are offline</p>} />);
  expect(screen.getByText("You are offline")).toBeVisible();
  expect(screen.getByLabelText("Empty media preview")).toBeInTheDocument();
  expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  expect(screen.queryByRole("contentinfo", { name: "Media controls" })).not.toBeInTheDocument();
  expect(screen.queryByText("Make something your own.")).not.toBeInTheDocument();
  expect(access).not.toHaveBeenCalled();
});

it("never displays an old owner's resource after changing versions or denied access", async () => {
  let resolveOld: ((value: { url: string }) => void) | undefined;
  const scopedAccess = vi.fn((id: string): Promise<{ url: string }> => id === "version_old" ? new Promise(resolve => { resolveOld = resolve; }) : Promise.reject(new Error("Access denied")));
  const props = { access: scopedAccess, onUseInput: vi.fn(), onReuseSetup: vi.fn(), canReuseSetup: false };
  const { rerender } = render(<MediaViewer {...props} version={media("old")} />);
  rerender(<MediaViewer {...props} version={media("denied")} />);
  await screen.findByText("Access denied");
  await act(async () => { resolveOld?.({ url: "/private-old-owner.png" }); });
  expect(document.querySelector('img[src="/private-old-owner.png"]')).toBeNull();
  expect(screen.getByRole("button", { name: "Download original" })).toBeDisabled();
});

it("keeps the same clip element and playhead when expanding the mobile request preview", async () => {
  const version = MediaVersionSchema.parse({ ...media("clip"), kind: "video", metadata: { state: "verified", width: 1920, height: 1080, durationSeconds: 8, audio: "absent", probeVersion: "controlled" } });
  const onView = vi.fn();
  const props = { version, access, onUseInput: vi.fn(), onReuseSetup: vi.fn(), canReuseSetup: false, onView };
  const { container, rerender } = render(<MediaViewer {...props} mobilePreview />);
  await waitFor(() => expect(container.querySelector("video.vf-media-display")).not.toBeNull());
  const player = container.querySelector<HTMLVideoElement>("video.vf-media-display");
  if (!player) throw new Error("Clip element did not mount");
  player.currentTime = 2;
  fireEvent.timeUpdate(player);
  fireEvent.click(screen.getByRole("button", { name: "View clip" }));
  expect(onView).toHaveBeenCalledOnce();
  rerender(<MediaViewer {...props} mobilePreview={false} />);
  expect(container.querySelector("video.vf-media-display")).toBe(player);
  expect(player.currentTime).toBe(2);
  expect(access).toHaveBeenCalledTimes(1);
});

it("applies the shared area tint only to a mask belonging to the version on screen", async () => {
  const version = media("masked");
  const props = { version, access, onUseInput: vi.fn(), onReuseSetup: vi.fn(), canReuseSetup: false };
  const { rerender } = render(<MediaViewer {...props} areaMask={{ versionId: "version_other", dataUri: "data:image/png;base64,other" }} />);
  expect(screen.queryByRole("img", { name: "Selected picture area" })).not.toBeInTheDocument();
  rerender(<MediaViewer {...props} areaMask={{ versionId: version.id, dataUri: "data:image/png;base64,current" }} />);
  expect(await screen.findByRole("img", { name: "Selected picture area" })).toHaveAttribute("src", "data:image/png;base64,current");
});

it("keeps failed slot retry direct without presenting technical success/repair rows", async () => {
  const request = AcceptedRequestSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "request_current", ownerId: "owner", projectId: "project_current", conversationId: "conversation_current", submissionId: "submission_current", executionDraftId: "draft_current", executionDraftRevision: 1, acceptanceSequence: 1, snapshotHash: "a".repeat(64), snapshot: content, materializedContext: { projectInstructions: "", entries: [] }, slots: [{ id: "slot_failed", ordinal: 1, outcome: "failed", delivery: "none", error: { code: "PROVIDER_FAILED", message: "The model could not finish this clip." }, usage: { mode: "free", reserved: 0, settled: 0 } }], acceptedAt: timestamp });
  const onRetry = vi.fn();
  render(<ConversationHistory requests={[request]} media={[]} selected={undefined} pending={[]} access={access} onView={vi.fn()} onRecover={vi.fn()} onRetry={onRetry} />);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(onRetry).toHaveBeenCalledWith(request, "slot_failed");
  expect(screen.queryByText(/repair|saved results|generate|review/i)).not.toBeInTheDocument();
});

it("renders durable text answers without applying them until the deliberate action", () => {
  const request = AcceptedRequestSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "request_text", ownerId: "owner", projectId: "project_current", conversationId: "conversation_current", submissionId: "submission_text", executionDraftId: "draft_text", executionDraftRevision: 1, acceptanceSequence: 1, snapshotHash: "a".repeat(64), snapshot: { ...content, action: "improve-words" }, materializedContext: { projectInstructions: "", entries: [] }, slots: [{ id: "slot_text", ordinal: 1, outcome: "completed", delivery: "ready", text: "Keep the camera low.\nFollow the runner.", usage: { mode: "free", reserved: 0, settled: 0 } }], acceptedAt: timestamp });
  const onApplyText = vi.fn();
  render(<ConversationHistory requests={[request]} media={[]} selected={undefined} pending={[]} access={access} onView={vi.fn()} onRecover={vi.fn()} onApplyText={onApplyText} />);
  expect(screen.getByText(/Follow the runner/)).toBeInTheDocument();
  expect(onApplyText).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Use these words" }));
  expect(onApplyText).toHaveBeenCalledWith(request, "Keep the camera low.\nFollow the runner.");
});
