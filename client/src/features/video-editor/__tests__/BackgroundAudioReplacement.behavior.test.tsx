import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import { VideoEditSchema, type EditCommand, type VideoEdit } from "@shared/schemas/workflow/video-edit.schemas";
import { applyEditCommand } from "@shared/video-edit/composition";
import { VideoEditor } from "../VideoEditor";

const api = vi.hoisted(() => ({ list: vi.fn(), exports: vi.fn(), get: vi.fn(), command: vi.fn(), preview: vi.fn(), revisions: vi.fn() }));
vi.mock("../api/videoEditorApi", () => ({ VideoEditorApi: class { list = api.list; exports = api.exports; get = api.get; command = api.command; preview = api.preview; revisions = api.revisions; } }));
const timestamp = "2026-10-18T05:00:00.000Z";
const visual = MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_clip", ownerId: "creator", projectId: "project_music", kind: "video", label: "Stadium", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "verified", assetId: "asset_clip", storagePath: "users/creator/clip.mp4", generation: "1", sha256: "a".repeat(64), bytes: 100 }, metadata: { state: "verified", width: 1920, height: 1080, durationSeconds: 3, audio: "present", probeVersion: "controlled" }, association: "linked", createdAt: timestamp });
const oldAudio = MediaVersionSchema.parse({ ...visual, id: "version_old_audio", kind: "audio", label: "Current Music", metadata: { state: "verified", durationSeconds: 20, audio: "present", probeVersion: "controlled" } });
const newAudio = MediaVersionSchema.parse({ ...oldAudio, id: "version_new_audio", label: "Another Music", metadata: { state: "verified", durationSeconds: 2, audio: "present", probeVersion: "controlled" } });
const saved = VideoEditSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "edit_music", ownerId: "creator", projectId: "project_music", name: "Video edit", revision: 5, composition: { normalizationVersion: "vidra-cfr30/v1", preset: "landscape", fps: 30, items: [{ id: "item_one", versionId: visual.id, kind: "clip", inFrame: 0, outFrame: 90, displayFrames: 90, fit: "fit", sourceAudio: { muted: false, gain: .6 } }], text: [], backgroundAudio: { id: "music_track", versionId: oldAudio.id, sourceInFrame: 60, startFrame: 47, endFrame: 80, gain: .4 } }, issues: [], createdAt: timestamp, updatedAt: timestamp });
const props = { ownerId: "creator", projectId: "project_music", initialEditId: saved.id, media: [visual,newAudio,oldAudio], resolveMediaAccess: async (): Promise<{ url: string }> => ({ url: "https://owned.example/music" }), importController: { jobs: [], warning: undefined, choose: vi.fn(), retry: vi.fn(), cancel: vi.fn(), forgetRejected: vi.fn() }, onClose: vi.fn(), onMediaRefresh: async (): Promise<void> => undefined };
let current: VideoEdit;
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); current = structuredClone(saved);
  api.list.mockImplementation(async () => [current]); api.get.mockImplementation(async () => current); api.exports.mockResolvedValue([]); api.revisions.mockResolvedValue([]);
  api.preview.mockResolvedValue({ url: "https://owned.example/clip.mp4", frames: 90, width: 1920, height: 1080, framesPerSecond: 30, audio: "present" });
  api.command.mockImplementation(async (_id: string, revision: number, _operation: string, command: EditCommand) => { if (command.kind === "restore") throw new Error("No restore in this fixture"); expect(revision).toBe(current.revision); current = VideoEditSchema.parse({ ...current, revision: current.revision + 1, composition: applyEditCommand(current.composition, command) }); return current; });
});
afterEach(() => { vi.restoreAllMocks(); });

async function openPicker(): Promise<HTMLElement> {
  const add = await screen.findByRole("button", { name: "Add audio" }); expect(add).toBeEnabled(); fireEvent.click(add); return screen.getByRole("complementary", { name: "Background audio" });
}

it("opens occupied Music with its saved choice and settings, while selection and cancellation write nothing", async () => {
  render(<VideoEditor {...props} />);
  const picker = await openPicker();
  expect(within(picker).getByRole("button", { name: /Current Music/ })).toHaveAttribute("aria-pressed", "true");
  expect(within(picker).getByRole("button", { name: /Another Music/ })).toHaveAttribute("aria-pressed", "false");
  expect(within(picker).getByRole("textbox", { name: "Background audio start" })).toHaveValue("0:01.57");
  expect(within(picker).getByRole("textbox", { name: "Background audio volume percent" })).toHaveValue("40");
  fireEvent.click(within(picker).getByRole("button", { name: /Another Music/ }));
  fireEvent.change(within(picker).getByRole("textbox", { name: "Background audio start" }), { target: { value: "0:00.5" } });
  fireEvent.change(within(picker).getByRole("textbox", { name: "Background audio volume percent" }), { target: { value: "25" } });
  expect(api.command).not.toHaveBeenCalled(); fireEvent.click(within(picker).getByRole("button", { name: "Cancel" }));
  expect(current).toEqual(saved); expect(api.command).not.toHaveBeenCalled();
  const reopened = await openPicker(); expect(within(reopened).getByRole("button", { name: /Current Music/ })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(within(reopened).getByRole("button", { name: "Close background audio" })); expect(api.command).not.toHaveBeenCalled();
});

it("replaces the single Music field in one guarded command, leaves clip sound intact, and Undo restores its exact old interval", async () => {
  let finish: (() => void) | undefined;
  api.command.mockImplementationOnce(async (_id: string, revision: number, _operation: string, command: EditCommand) => {
    if (command.kind !== "background_audio") throw new Error("Expected one Music replacement"); expect(revision).toBe(5);
    const accepted = VideoEditSchema.parse({ ...current, revision: 6, composition: applyEditCommand(current.composition, command) });
    await new Promise<void>(resolve => { finish = resolve; }); current = accepted; return current;
  });
  render(<VideoEditor {...props} />); const picker = await openPicker();
  fireEvent.click(within(picker).getByRole("button", { name: /Another Music/ }));
  fireEvent.change(within(picker).getByRole("textbox", { name: "Background audio start" }), { target: { value: "0:00.5" } });
  fireEvent.change(within(picker).getByRole("textbox", { name: "Background audio volume percent" }), { target: { value: "25" } });
  fireEvent.click(within(picker).getByRole("button", { name: "Add audio" }));
  await waitFor(() => expect(api.command).toHaveBeenCalledTimes(1)); expect(screen.getByRole("button", { name: "Add audio" })).toBeDisabled();
  await act(async () => { finish?.(); }); await waitFor(() => expect(screen.getByRole("button", { name: "Add audio" })).toBeEnabled());
  expect(api.command.mock.calls[0]?.[3]).toEqual({ kind: "background_audio", audio: { id: "music_track", versionId: newAudio.id, sourceInFrame: 0, startFrame: 15, endFrame: 75, gain: .25 } });
  expect(current.composition.backgroundAudio).toEqual({ id: "music_track", versionId: newAudio.id, sourceInFrame: 0, startFrame: 15, endFrame: 75, gain: .25 });
  expect(current.composition.items).toEqual(saved.composition.items); expect(saved.composition.backgroundAudio?.versionId).toBe(oldAudio.id);
  fireEvent.click(screen.getByRole("button", { name: "Undo video edit" }));
  await waitFor(() => expect(current.composition.backgroundAudio).toEqual(saved.composition.backgroundAudio)); expect(api.command).toHaveBeenCalledTimes(2);
  expect(api.command.mock.calls[1]?.[3]).toMatchObject({ kind: "replace_composition", composition: { backgroundAudio: saved.composition.backgroundAudio } });
});

it("keeps a retained source offset and precise frame interval when applying the current file's visible settings", async () => {
  render(<VideoEditor {...props} />); const picker = await openPicker();
  fireEvent.change(within(picker).getByRole("textbox", { name: "Background audio volume percent" }), { target: { value: "25" } });
  fireEvent.click(within(picker).getByRole("button", { name: "Add audio" }));
  await waitFor(() => expect(api.command).toHaveBeenCalledTimes(1)); expect(current.composition.backgroundAudio).toEqual({ ...saved.composition.backgroundAudio, gain: .25 });
});

it("keeps a historical Music revision read-only", async () => {
  const older = VideoEditSchema.parse({ ...saved, revision: 4 }); api.revisions.mockResolvedValue([older]);
  render(<VideoEditor {...props} />); await screen.findByRole("button", { name: "Add audio" }); fireEvent.click(screen.getByRole("button", { name: "History" }));
  fireEvent.click(await within(screen.getByRole("complementary", { name: "Edit history" })).findByRole("button", { name: /Edit 4/ })); expect(screen.getByRole("button", { name: "Add audio" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Add audio" })); expect(screen.queryByRole("complementary", { name: "Background audio" })).toBeNull(); expect(api.command).not.toHaveBeenCalled();
});

it("does not substitute the first available file when saved Music is missing from current choices", async () => {
  render(<VideoEditor {...props} media={[visual,newAudio]} />); const picker = await openPicker();
  expect(within(picker).getByRole("button", { name: /Another Music/ })).toHaveAttribute("aria-pressed", "false"); expect(within(picker).getByRole("button", { name: "Add audio" })).toBeDisabled();
  fireEvent.click(within(picker).getByRole("button", { name: /Another Music/ })); expect(within(picker).getByRole("button", { name: "Add audio" })).toBeEnabled(); expect(api.command).not.toHaveBeenCalled();
});

it("can inspect the explicitly retained hidden Music without offering unrelated hidden files", async () => {
  const hiddenOther = MediaVersionSchema.parse({ ...newAudio, id: "version_hidden_audio", label: "Other hidden Music", hidden: true });
  render(<VideoEditor {...props} media={[visual,newAudio,{ ...oldAudio, hidden: true },hiddenOther]} />); const picker = await openPicker();
  expect(within(picker).getByRole("button", { name: /Current Music/ })).toHaveAttribute("aria-pressed", "true");
  expect(within(picker).queryByRole("button", { name: /Other hidden Music/ })).toBeNull(); expect(api.command).not.toHaveBeenCalled();
});

it.each(["video", "export"] as const)("initializes the retained %s soundtrack without offering unrelated clips", async kind => {
  const soundtrack = kind === "video" ? visual : MediaVersionSchema.parse({ ...visual, id: "version_copied_export", kind: "export", label: "Copied export", origin: { kind: "export", exportId: "export_copied", editId: saved.id, revision: 4 } });
  const unrelated = MediaVersionSchema.parse({ ...visual, id: "version_unrelated_clip", label: "Unrelated clip" });
  current = VideoEditSchema.parse({ ...saved, composition: { ...saved.composition, backgroundAudio: { ...saved.composition.backgroundAudio, versionId: soundtrack.id, sourceInFrame: 15 } } });
  render(<VideoEditor {...props} media={[visual,newAudio,oldAudio,...(kind === "export" ? [soundtrack] : []),unrelated]} />); const picker = await openPicker();
  expect(within(picker).getByRole("button", { name: new RegExp(soundtrack.label) })).toHaveAttribute("aria-pressed", "true");
  expect(within(picker).queryByRole("button", { name: /Unrelated clip/ })).toBeNull(); expect(api.command).not.toHaveBeenCalled();
});
