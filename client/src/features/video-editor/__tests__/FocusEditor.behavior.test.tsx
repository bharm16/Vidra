import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import { VideoEditSchema, type EditCommand, type VideoEdit } from "@shared/schemas/workflow/video-edit.schemas";
import { applyEditCommand } from "@shared/video-edit/composition";
import { VideoEditor } from "../VideoEditor";

const api = vi.hoisted(() => ({ list: vi.fn(), exports: vi.fn(), get: vi.fn(), command: vi.fn(), preview: vi.fn(), revisions: vi.fn() }));
vi.mock("../api/videoEditorApi", () => ({ VideoEditorApi: class { list = api.list; exports = api.exports; get = api.get; command = api.command; preview = api.preview; revisions = api.revisions; } }));
const version = MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_focus", ownerId: "creator", projectId: "project_focus", kind: "image", label: "Stadium", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "verified", assetId: "asset_focus", storagePath: "users/creator/focus.png", generation: "1", sha256: "a".repeat(64), bytes: 100 }, metadata: { state: "verified", width: 1920, height: 1080, durationSeconds: 0, audio: "absent", probeVersion: "fixture/v1" }, association: "linked", createdAt: "2026-10-17T05:00:00.000Z" });
const edit = VideoEditSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "edit_focus", ownerId: "creator", projectId: "project_focus", name: "Video edit", revision: 2, composition: { normalizationVersion: "vidra-cfr30/v1", preset: "landscape", fps: 30, items: [{ id: "item_focus", versionId: version.id, kind: "picture", inFrame: 0, outFrame: 90, displayFrames: 90, fit: "fit", sourceAudio: { muted: true, gain: 1 } }], text: [] }, issues: [], createdAt: version.createdAt, updatedAt: version.createdAt });
const props = { ownerId: "creator", projectId: "project_focus", media: [version], resolveMediaAccess: async (): Promise<{ url: string }> => ({ url: "https://owned.example/focus.png" }), importController: { jobs: [], warning: undefined, choose: vi.fn(), retry: vi.fn(), cancel: vi.fn(), forgetRejected: vi.fn() }, onClose: vi.fn(), onMediaRefresh: async (): Promise<void> => undefined };
const originalScroll = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  api.list.mockResolvedValue([edit]); api.get.mockResolvedValue(edit); api.exports.mockResolvedValue([]);
  api.revisions.mockResolvedValue([VideoEditSchema.parse({ ...edit, revision: 1 }), edit]);
  api.command.mockImplementation(async (_id: string, _revision: number, _operation: string, command: EditCommand) => {
    if (command.kind === "restore") throw new Error("Restore is outside this fixture");
    return VideoEditSchema.parse({ ...edit, revision: edit.revision + 1, composition: applyEditCommand(edit.composition, command) });
  });
});
afterEach(() => { if (originalScroll) Object.defineProperty(Element.prototype, "scrollIntoView", originalScroll); else Reflect.deleteProperty(Element.prototype, "scrollIntoView"); });

it("focus navigation previews and applies the existing revisioned framing command, and Back uses the host callback", async () => {
  const view = render(<VideoEditor {...props} presentation="focus" />);
  const output = await screen.findByRole("button", { name: "Output settings" });
  expect(output).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(output);
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Video shape" }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name: "Fit Clip 1 to 9:16" }));
  expect(api.command).not.toHaveBeenCalled();
  fireEvent.click(output); // Closing the proposed format does not save it.
  expect(screen.queryByRole("combobox", { name: "Video shape" })).toBeNull();
  expect(api.command).not.toHaveBeenCalled();
  fireEvent.click(output);
  expect(screen.getByRole("combobox", { name: "Video shape" })).toHaveTextContent("16:9");
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Video shape" }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name: "Fit Clip 1 to 9:16" }));
  fireEvent.click(screen.getByRole("button", { name: "Apply framing" }));
  await waitFor(() => expect(api.command).toHaveBeenCalledTimes(1));
  expect(api.command.mock.calls[0]?.[3]).toEqual({ kind: "preset", preset: "portrait", fits: [{ itemId: "item_focus", fit: "fit" }] });
  await waitFor(() => expect(output).not.toBeDisabled());
  fireEvent.click(screen.getByRole("button", { name: "Back to clip" })); expect(props.onClose).toHaveBeenCalledTimes(1);
  view.rerender(<VideoEditor {...props} presentation="full" />);
  expect(screen.queryByRole("button", { name: "Output settings" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Back to clip" })).toBeNull();
  view.rerender(<VideoEditor {...props} presentation="embedded" />);
  expect(screen.queryByRole("button", { name: "Output settings" })).toBeNull();
});

it("focus output settings cannot edit a historical revision or interrupt a pending save", async () => {
  const view = render(<VideoEditor {...props} />);
  fireEvent.click(await screen.findByRole("button", { name: "History" }));
  fireEvent.click(await screen.findByRole("button", { name: /Edit 1/ }));
  view.rerender(<VideoEditor {...props} presentation="focus" />);
  const output = screen.getByRole("button", { name: "Output settings" }); expect(output).toBeDisabled();
  fireEvent.click(output); expect(screen.queryByRole("combobox", { name: "Video shape" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Close edit history" }));
  expect(output).not.toBeDisabled();
  let finish: ((saved: VideoEdit) => void) | undefined;
  api.command.mockImplementationOnce(() => new Promise<VideoEdit>(resolve => { finish = resolve; }));
  fireEvent.click(screen.getByRole("button", { name: /Edit Stadium/ }));
  const duration = screen.getByRole("spinbutton", { name: "Duration seconds" });
  fireEvent.change(duration, { target: { value: "5" } }); fireEvent.blur(duration);
  await waitFor(() => expect(api.command).toHaveBeenCalledTimes(1)); expect(output).toBeDisabled();
  fireEvent.click(output); expect(screen.queryByRole("combobox", { name: "Video shape" })).toBeNull();
  await act(async () => { finish?.(VideoEditSchema.parse({ ...edit, revision: 3 })); });
  expect(output).not.toBeDisabled();
});
