import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { VideoEditSchema, VideoExportSchema, type EditCommand, type VideoEdit } from "@shared/schemas/workflow/video-edit.schemas";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import { applyEditCommand } from "@shared/video-edit/composition";
import { VideoEditor } from "../VideoEditor";
import { MediaViewer } from "@/features/project-workspace/components/MediaViewer";

const api = vi.hoisted(() => ({ list: vi.fn(), exports: vi.fn(), get: vi.fn(), command: vi.fn(), preview: vi.fn(), revisions: vi.fn() }));
vi.mock("../api/videoEditorApi", () => ({ VideoEditorApi: class { list = api.list; exports = api.exports; get = api.get; command = api.command; preview = api.preview; revisions = api.revisions; } }));
const version = MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_one", ownerId: "creator", projectId: "project_one", kind: "image", label: "Stadium", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "verified", assetId: "asset_one", storagePath: "users/creator/one.png", generation: "1", sha256: "a".repeat(64), bytes: 100 }, metadata: { state: "verified", width: 1920, height: 1080, durationSeconds: 0, audio: "absent", probeVersion: "fixture/v1" }, association: "linked", createdAt: "2026-10-17T05:00:00.000Z" });
const edit = VideoEditSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "edit_one", ownerId: "creator", projectId: "project_one", name: "Video edit", revision: 1, composition: { normalizationVersion: "vidra-cfr30/v1", preset: "landscape", fps: 30, items: [{ id: "item_one", versionId: "version_one", kind: "picture", inFrame: 0, outFrame: 90, displayFrames: 90, fit: "fit", sourceAudio: { muted: true, gain: 1 } }], text: [{ id: "text_one", text: "Keep me attached", anchor: { kind: "item", itemId: "item_one" }, startFrame: 0, endFrame: 60, x: .08, y: .83, width: .84, height: .12, fontSize: 32, color: "#ffffff", align: "center" }] }, issues: [], createdAt: version.createdAt, updatedAt: version.createdAt });
const props = { ownerId: "creator", projectId: "project_one", media: [version], resolveMediaAccess: async (): Promise<{ url: string }> => ({ url: "https://owned.example/one.png" }), importController: { jobs: [], warning: undefined, choose: vi.fn(), retry: vi.fn(), cancel: vi.fn(), forgetRejected: vi.fn() }, onClose: vi.fn(), onMediaRefresh: async (): Promise<void> => undefined };
const inspected = MediaVersionSchema.parse({ ...version, id: "version_inspected", kind: "video", label: "Another clip", metadata: { state: "verified", width: 1920, height: 1080, durationSeconds: 3, audio: "absent", probeVersion: "controlled" } });
function renderInspection(timeline: ReactNode, timelineControl: ReactNode, exportControl?: ReactNode): ReactElement { return <MediaViewer version={inspected} access={props.resolveMediaAccess} onUseInput={vi.fn()} onReuseSetup={vi.fn()} canReuseSetup={false} timeline={timeline} timelineControl={timelineControl} inspectionActions={exportControl} onBackToEdit={vi.fn()} />; }
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); api.list.mockResolvedValue([edit]); api.exports.mockResolvedValue([]); api.get.mockResolvedValue(edit); let current = edit; api.command.mockImplementation(async (_id: string, _revision: number, _operation: string, command: EditCommand) => { if (command.kind === "restore") throw new Error("History not used in this fixture"); current = { ...current, revision: current.revision + 1, composition: applyEditCommand(current.composition, command) }; return current; }); });
afterEach(() => { vi.restoreAllMocks(); });

it("confirmed removal removes attached text in the same reversible change while retaining the source", async () => {
  render(<VideoEditor {...props} />); const item = await screen.findByRole("button", { name: /Edit Stadium/ }); fireEvent.contextMenu(item); fireEvent.click(screen.getByRole("menuitem", { name: "Remove clip" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove clip and attached elements" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: /Edit Stadium/ })).toBeNull());
  expect(api.command.mock.calls[0]?.[3]).toEqual({ kind: "remove", itemId: "item_one", removeAttachedElements: true });
  expect(screen.getByRole("button", { name: "Add Stadium" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Undo video edit" }));
  await screen.findByRole("button", { name: /Edit Stadium/ });
  expect(api.command.mock.calls[1]?.[3]).toMatchObject({ kind: "replace_composition", composition: { items: [{ versionId: "version_one" }], text: [{ text: "Keep me attached" }] } });
});
it("a rejected save keeps the current edit, blocks unsafe further changes, and exposes the same-operation retry", async () => {
  api.command.mockRejectedValueOnce(new Error("This edit changed elsewhere. Your copy is retained."));
  render(<VideoEditor {...props} />); fireEvent.click(await screen.findByRole("button", { name: /Edit Stadium/ }));
  const duration = screen.getByRole("spinbutton", { name: "Duration seconds" }); fireEvent.change(duration, { target: { value: "5" } }); fireEvent.blur(duration);
  await screen.findByRole("button", { name: "Retry saving edit" }); expect(screen.getByRole("button", { name: /Edit Stadium/ })).toBeVisible();
  expect(screen.getByRole("spinbutton", { name: "Duration seconds" })).toBeDisabled();
  expect(api.command).toHaveBeenCalledTimes(1);
});
it("embedded Add to video inserts the exact version once and media reload never inserts it again", async () => {
 const handled = vi.fn(); const view = render(<VideoEditor {...props} presentation="embedded" initialMediaVersionId="version_one" onInitialMediaHandled={handled} />);
 await waitFor(() => expect(handled).toHaveBeenCalledTimes(1));
 expect(screen.getByRole("main", { name: "Video editor" })).toHaveAttribute("data-presentation", "embedded");
 expect(api.command).toHaveBeenCalledTimes(1); expect(api.command.mock.calls[0]?.[3]).toMatchObject({ kind: "insert", item: { versionId: "version_one" } });
 view.rerender(<VideoEditor {...props} media={[{ ...version, label: "Renamed source" }]} presentation="embedded" initialMediaVersionId="version_one" onInitialMediaHandled={handled} />);
 await waitFor(() => expect(screen.getAllByRole("button", { name: /Edit Renamed source/ })).toHaveLength(2)); expect(api.command).toHaveBeenCalledTimes(1);
});
it("a lost insertion response recovers its exact item and operation after remount without duplicate insertion", async () => {
 let accepted = edit; let lost = true; const operations = new Set<string>();
 api.list.mockImplementation(async () => [accepted]);
 api.command.mockImplementation(async (_id: string, _revision: number, operationId: string, command: EditCommand) => { if (command.kind === "restore") throw new Error("Not a restore"); if (!operations.has(operationId)) { operations.add(operationId); accepted = { ...accepted, revision: accepted.revision + 1, composition: applyEditCommand(accepted.composition, command) }; } if (lost) { lost = false; throw new Error("Reply lost after acceptance"); } return accepted; });
 const handled = vi.fn(); const first = render(<VideoEditor {...props} initialMediaVersionId="version_one" onInitialMediaHandled={handled} />);
 await screen.findByRole("button", { name: "Retry saving edit" }, { timeout: 5000 }); expect(handled).not.toHaveBeenCalled(); const original = api.command.mock.calls[0]; first.unmount();
 const second = render(<VideoEditor {...props} initialMediaVersionId="version_one" onInitialMediaHandled={handled} />);
 await waitFor(() => expect(handled).toHaveBeenCalledTimes(1)); expect(api.command.mock.calls[1]).toEqual(original); expect(accepted.composition.items).toHaveLength(2); second.unmount();
 render(<VideoEditor {...props} initialMediaVersionId="version_one" onInitialMediaHandled={handled} />);
 await waitFor(() => expect(handled).toHaveBeenCalledTimes(2)); expect(api.command).toHaveBeenCalledTimes(2); expect(accepted.composition.items).toHaveLength(2);
});
it.each(["success", "failure"] as const)("a late Add to video %s cannot publish an error or handled callback into another edit", async outcome => {
 const other = VideoEditSchema.parse({ ...edit, id: "edit_other", name: "Other video edit", composition: { ...edit.composition, text: [] } });
 let accepted = edit; let finish: ((saved: VideoEdit) => void) | undefined; let fail: ((failure: Error) => void) | undefined;
 api.get.mockImplementation(async (id: string) => id === edit.id ? accepted : other);
 api.command.mockImplementationOnce((_id: string, _revision: number, _operationId: string, command: EditCommand) => {
  if (command.kind === "restore") throw new Error("Not a restore"); accepted = { ...edit, revision: 2, composition: applyEditCommand(edit.composition, command) };
  return new Promise<VideoEdit>((resolve, reject) => { finish = resolve; fail = reject; });
 });
 const handledA = vi.fn(); const handledB = vi.fn(); const selected = vi.fn();
 const view = render(<VideoEditor {...props} initialEditId={edit.id} initialMediaVersionId={version.id} onInitialMediaHandled={handledA} onEditSelected={selected} />);
 await waitFor(() => expect(api.command).toHaveBeenCalledTimes(1)); const original = api.command.mock.calls[0];
 const retained = localStorage.getItem("vidra.video-add.v1:creator:project_one");
 view.rerender(<VideoEditor {...props} initialEditId={other.id} onInitialMediaHandled={handledB} onEditSelected={selected} />);
 await waitFor(() => expect(selected).toHaveBeenLastCalledWith(other.id));
 await act(async () => { if (outcome === "success") finish?.(accepted); else fail?.(new Error("Old insertion response lost")); });
 expect(handledA).not.toHaveBeenCalled(); expect(handledB).not.toHaveBeenCalled(); expect(screen.queryByRole("button", { name: "Retry adding media" })).toBeNull(); expect(screen.queryByText(/This addition is kept/)).toBeNull(); expect(selected).toHaveBeenLastCalledWith(other.id);
 expect(localStorage.getItem("vidra.video-add.v1:creator:project_one")).toBe(retained);
 api.command.mockResolvedValueOnce(accepted);
 view.rerender(<VideoEditor {...props} initialEditId={edit.id} initialMediaVersionId={version.id} onInitialMediaHandled={handledA} onEditSelected={selected} />);
 fireEvent.click(await screen.findByRole("button", { name: "Retry saving edit" }));
 await waitFor(() => expect(handledA).toHaveBeenCalledTimes(1)); expect(handledB).not.toHaveBeenCalled(); expect(api.command.mock.calls[1]).toEqual(original); expect(accepted.composition.items).toHaveLength(2);
});
it("an edit-specific blocked addition does not suppress recovery after visiting another edit with the same version", async () => {
 const other = VideoEditSchema.parse({ ...edit, id: "edit_other", name: "Other video edit" });
 let accepted = edit; api.get.mockImplementation(async (id: string) => id === edit.id ? accepted : other);
 api.command.mockImplementationOnce(async (_id: string, _revision: number, _operationId: string, command: EditCommand) => {
  if (command.kind === "restore") throw new Error("Not a restore"); accepted = { ...edit, revision: 2, composition: applyEditCommand(edit.composition, command) }; throw new Error("Reply lost");
 });
 const handledA = vi.fn(); const handledB = vi.fn();
 const view = render(<VideoEditor {...props} initialEditId={edit.id} initialMediaVersionId={version.id} onInitialMediaHandled={handledA} />);
 await screen.findByRole("button", { name: "Retry saving edit" }, { timeout: 5000 }); const original = api.command.mock.calls[0];
 view.rerender(<VideoEditor {...props} initialEditId={other.id} initialMediaVersionId={version.id} onInitialMediaHandled={handledB} />);
 await screen.findByText("Finish saving the previous media addition before adding another version.");
 api.command.mockResolvedValueOnce(accepted);
 view.rerender(<VideoEditor {...props} initialEditId={edit.id} initialMediaVersionId={version.id} onInitialMediaHandled={handledA} />);
 fireEvent.click(await screen.findByRole("button", { name: "Retry saving edit" })); await waitFor(() => expect(handledA).toHaveBeenCalledTimes(1));
 expect(handledB).not.toHaveBeenCalled(); expect(api.command.mock.calls[1]).toEqual(original); expect(accepted.composition.items).toHaveLength(2);
});
it("unavailable Add to video waits for a deliberate retry instead of changing an edit on media reload", async () => {
 const handled = vi.fn(); const access = vi.fn(async (): Promise<{ url: string }> => { throw new Error("Access denied"); });
 const view = render(<VideoEditor {...props} resolveMediaAccess={access} initialMediaVersionId="version_one" onInitialMediaHandled={handled} />);
 await screen.findByRole("button", { name: "Retry adding media" }); expect(api.command).not.toHaveBeenCalled();
 access.mockResolvedValue({ url: "https://owned.example/one.png" });
 view.rerender(<VideoEditor {...props} media={[{ ...version }]} resolveMediaAccess={access} initialMediaVersionId="version_one" onInitialMediaHandled={handled} />);
 expect(api.command).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "Retry adding media" }));
 await waitFor(() => expect(handled).toHaveBeenCalledTimes(1)); expect(api.command).toHaveBeenCalledTimes(1);
});
it("inspection retains the actual edit timeline and its view preference with only the inspected clip transport", async () => {
 const view = render(<VideoEditor {...props} presentation="embedded" />); await screen.findByRole("button", { name: "Play video" });
 fireEvent.change(screen.getByRole("slider", { name: "Timeline playhead" }), { target: { value: "45" } });
 view.rerender(<VideoEditor {...props} presentation="embedded" renderInspection={renderInspection} />);
 await screen.findByRole("button", { name: "Play clip" }); expect(screen.getAllByLabelText("Video timeline")).toHaveLength(1); expect(screen.getByRole("slider", { name: "Timeline playhead" })).toHaveValue("45");
 expect(screen.queryByRole("button", { name: "Play video" })).toBeNull(); expect(screen.queryByLabelText("Video preview")).toBeNull(); expect(screen.getAllByRole("contentinfo", { name: "Media controls" })).toHaveLength(1); expect(api.command).not.toHaveBeenCalled();
 expect(screen.getByRole("button", { name: "Back to edit" })).toBeInTheDocument(); expect(screen.getByRole("button", { name: /^Export/ })).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Use" })).toBeNull();
 expect(screen.getByRole("button", { name: "Timeline" })).toHaveAttribute("aria-expanded", "true"); fireEvent.click(screen.getByRole("button", { name: "Timeline" })); expect(screen.queryByLabelText("Video timeline")).toBeNull();
 view.rerender(<VideoEditor {...props} presentation="embedded" />); await screen.findByRole("button", { name: "Play video" }); expect(screen.queryByLabelText("Video timeline")).toBeNull();
 expect(screen.getByRole("button", { name: "Timeline" })).toHaveAttribute("aria-expanded", "false"); fireEvent.click(screen.getByRole("button", { name: "Timeline" })); expect(screen.getByRole("slider", { name: "Timeline playhead" })).toHaveValue("45");
});
it("does not mistake an inspected viewer exiting full screen for the unmounted edit stage", async () => {
 const view = render(<VideoEditor {...props} presentation="embedded" />); await screen.findByRole("button", { name: "Play video" });
 view.rerender(<VideoEditor {...props} presentation="embedded" renderInspection={renderInspection} />); await screen.findByRole("button", { name: "Play clip" });
 const oldDescriptor = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
 Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
 try {
  fireEvent(document, new Event("fullscreenchange"));
  view.rerender(<VideoEditor {...props} presentation="embedded" />); await screen.findByRole("button", { name: "Play video" });
  expect(screen.queryByRole("button", { name: "Exit full screen" })).toBeNull(); expect(api.command).not.toHaveBeenCalled();
 } finally { if (oldDescriptor) Object.defineProperty(document, "fullscreenElement", oldDescriptor); else Reflect.deleteProperty(document, "fullscreenElement"); }
});
it("selecting an inspected timeline item deliberately returns to editing without mutating the arrangement", async () => {
 const returnToEdit = vi.fn(); const view = render(<VideoEditor {...props} presentation="embedded" renderInspection={renderInspection} onInspectionEdit={returnToEdit} />);
 fireEvent.click(await screen.findByRole("button", { name: /Edit Stadium/ })); expect(returnToEdit).toHaveBeenCalledTimes(1); expect(api.command).not.toHaveBeenCalled();
 view.rerender(<VideoEditor {...props} presentation="embedded" />); await screen.findByRole("spinbutton", { name: "Duration seconds" }); expect(screen.queryByRole("button", { name: "Play clip" })).toBeNull(); expect(screen.getByRole("button", { name: "Play video" })).toBeVisible();
});
it("entering inspection physically pauses and removes the editing media player", async () => {
 const clipEdit = VideoEditSchema.parse({ ...edit, composition: { ...edit.composition, items: edit.composition.items.map(item => ({ ...item, kind: "clip" })) } });
 const clipSource = MediaVersionSchema.parse({ ...version, kind: "video", metadata: { ...inspected.metadata } }); api.list.mockResolvedValue([clipEdit]); api.preview.mockResolvedValue({ url: "https://owned.example/normalized.mp4", frames: 90 });
 const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined); vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockReturnValue(false);
 const view = render(<VideoEditor {...props} media={[clipSource]} />); await waitFor(() => expect(view.container.querySelector(".ve-source-crop video")).not.toBeNull()); pause.mockClear();
 view.rerender(<VideoEditor {...props} media={[clipSource]} renderInspection={renderInspection} />); await screen.findByRole("button", { name: "Play clip" }); expect(pause).toHaveBeenCalled(); expect(view.container.querySelector(".ve-source-crop video")).toBeNull(); expect(screen.queryByRole("button", { name: "Pause video" })).toBeNull();
});

it("stages new caption words and discards cancellation without saving a placeholder", async () => {
  render(<VideoEditor {...props} />);
  await screen.findByRole("button", { name: /Edit Stadium/ });
  fireEvent.click(screen.getByRole("button", { name: "Captions" }));
  fireEvent.click(screen.getByRole("button", { name: "Add caption" }));
  expect(api.command).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("textbox", { name: "Caption text" }), { target: { value: "Only these words" } });
  fireEvent.click(screen.getByRole("button", { name: "Close add caption" }));
  expect(api.command).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Captions" }));
  fireEvent.click(screen.getByRole("button", { name: "Add caption" }));
  const words = screen.getByRole("textbox", { name: "Caption text" });
  fireEvent.change(words, { target: { value: "Save these words" } });
  fireEvent.click(screen.getByRole("button", { name: "Add caption" }));
  await waitFor(() => expect(api.command).toHaveBeenCalledTimes(1));
  expect(api.command.mock.calls[0]?.[3]).toMatchObject({ kind: "text", text: { text: "Save these words" } });
});

it("stages background audio separately and commits the requested start and gain without changing clip sound", async () => {
  const audio = MediaVersionSchema.parse({ ...version, id: "version_audio", kind: "audio", label: "Instrumental", metadata: { state: "verified", durationSeconds: 20, audio: "present", probeVersion: "controlled" } });
  render(<VideoEditor {...props} media={[version,audio]} />);
  await screen.findByRole("button", { name: /Edit Stadium/ });
  fireEvent.click(screen.getByRole("button", { name: "Add audio" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Background audio start" }), { target: { value: "0:01" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Background audio volume percent" }), { target: { value: "25" } });
  expect(api.command).not.toHaveBeenCalled();
  const addAudio = screen.getAllByRole("button", { name: "Add audio" }).at(-1); if (!addAudio) throw new Error("Missing staged Add audio action"); fireEvent.click(addAudio);
  await waitFor(() => expect(api.command).toHaveBeenCalledTimes(1));
  expect(api.command.mock.calls[0]?.[3]).toMatchObject({ kind: "background_audio", audio: { versionId: "version_audio", startFrame: 30, endFrame: 90, gain: .25 } });
  expect(screen.getByRole("button", { name: /Edit Stadium/ })).toBeVisible();
});

it("a rejected move never announces a successful move",async()=>{
 api.list.mockResolvedValue([{...edit,composition:{...edit.composition,items:[...edit.composition.items,{...edit.composition.items[0],id:"item_two"}]}}]);
 api.command.mockRejectedValueOnce(new Error("This edit changed elsewhere."));
 render(<VideoEditor {...props} />);
 const first = (await screen.findAllByRole("button",{name:/Edit Stadium/}))[0]; if(!first) throw new Error("Missing first item"); fireEvent.click(first);
 fireEvent.click(screen.getByRole("button",{name:"Move later"}));
 await screen.findByRole("button",{name:"Retry saving edit"});
 expect(screen.queryByText("Clip moved")).toBeNull();expect(screen.queryByRole("button",{name:"Undo move"})).toBeNull();
});

it("a confirmed move keeps the playhead at the same point within the moved clip",async()=>{
 const twoItems = VideoEditSchema.parse({...edit,composition:{...edit.composition,items:[...edit.composition.items,{...edit.composition.items[0],id:"item_two"}]}});
 api.list.mockResolvedValue([twoItems]);
 api.command.mockImplementationOnce(async (_id: string, _revision: number, _operation: string, command: EditCommand) => command.kind === "move" ? { ...twoItems, revision: 2, composition: applyEditCommand(twoItems.composition, command) } : twoItems);
 render(<VideoEditor {...props} />);
 const first = (await screen.findAllByRole("button",{name:/Edit Stadium/}))[0]; if(!first) throw new Error("Missing first item"); fireEvent.click(first);
 fireEvent.change(screen.getByRole("slider",{name:"Timeline playhead"}),{target:{value:"45"}});
 fireEvent.click(screen.getByRole("button",{name:"Move later"}));
 await screen.findByText("Clip moved");
 expect(api.command.mock.calls[0]?.[3]).toEqual({kind:"move",itemId:"item_one",index:1});
 expect(screen.getByRole("slider",{name:"Timeline playhead"})).toHaveValue("135");
});

it("muting the preview marks the transport and Clip sound glyphs as muted",async()=>{
 const view = render(<VideoEditor {...props} />);
 await screen.findByRole("button",{name:/Edit Stadium/});
 const trackGlyph = (): string | null | undefined => view.container.querySelector(".ve-track-icons > img:nth-child(3)")?.getAttribute("src");
 expect(trackGlyph()).toBe("/design-assets/fidelity-editor-track-volume.svg");
 fireEvent.click(screen.getByRole("button",{name:"Preview volume"}));
 fireEvent.click(await screen.findByRole("button",{name:"Mute preview"}));
 expect(screen.getByRole("button",{name:"Preview volume"})).toHaveAttribute("data-muted","true");
 expect(trackGlyph()).toBe("/design-assets/fidelity-editor-track-volume-muted.svg");
});

it("an earlier ready export offers Export latest in its action row",async()=>{
 const current = VideoEditSchema.parse({ ...edit, revision: 2 });
 const earlier = VideoExportSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "export_earlier", ownerId: edit.ownerId, projectId: edit.projectId, editId: edit.id, revision: 1, submissionId: "submission_earlier", executionDraftId: "draft_earlier", executionDraftRevision: 1, composition: edit.composition, compositionHash: "a".repeat(64), sources: [], renderer: "native/v1", attemptId: "attempt_earlier", state: "ready", progress: 1, stored: { storagePath: "users/creator/export.mp4", generation: "1", sha256: "b".repeat(64), bytes: 100, versionId: "version_export" }, createdAt: edit.createdAt, updatedAt: edit.updatedAt });
 api.list.mockResolvedValue([current]); api.get.mockResolvedValue(current); api.exports.mockResolvedValue([earlier]);
 render(<VideoEditor {...props} />);
 await screen.findByRole("button",{name:/Edit Stadium/});
 fireEvent.click(await screen.findByRole("button",{name:/^Export/}));
 const panel = await screen.findByRole("region",{name:"Export panel"});
 expect(within(panel).getByText("Edit 1 is ready")).toBeVisible();
 expect(within(panel).getByRole("button",{name:"Export latest"}).parentElement).toBe(within(panel).getByRole("button",{name:"Download"}).parentElement);
 expect(screen.queryByRole("button",{name:"Export current edit"})).toBeNull();
});

it("appends chosen media while retaining the visual selection and playhead",async()=>{
 const other=MediaVersionSchema.parse({...version,id:"version_two",label:"Desk"});
 render(<VideoEditor {...props} media={[version,other]} />);
 await screen.findByRole("button",{name:/Edit Stadium/});
 fireEvent.change(screen.getByRole("slider",{name:"Timeline playhead"}),{target:{value:"45"}});
 fireEvent.click(screen.getByRole("button",{name:"Add Desk"}));
 await screen.findByRole("button",{name:/Edit Desk/});
 expect(api.command.mock.calls[0]?.[3]).toMatchObject({kind:"insert",index:1,item:{versionId:"version_two"}});
 expect(screen.getByRole("slider",{name:"Timeline playhead"})).toHaveValue("45");
 expect(screen.getByRole("button",{name:/Edit Stadium/})).toHaveAttribute("aria-pressed","true");
 expect(screen.getByRole("button",{name:/Edit Desk/})).toHaveAttribute("aria-pressed","false");
 expect(screen.queryByRole("spinbutton",{name:"Duration seconds"})).toBeNull();
});

it("the open history panel adds a restored revision only after the server confirms it", async () => {
 const current = VideoEditSchema.parse({ ...edit, revision: 8 });
 const earlier = VideoEditSchema.parse({ ...edit, revision: 3, composition: { ...edit.composition, text: [] } });
 const restored = VideoEditSchema.parse({ ...current, revision: 9, composition: earlier.composition });
 api.list.mockResolvedValue([current]); api.revisions.mockResolvedValue([current, earlier]);
 let confirmRestore: ((saved: VideoEdit) => void) | undefined;
 api.command.mockImplementationOnce(() => new Promise<VideoEdit>(resolve => { confirmRestore = resolve; }));
 render(<VideoEditor {...props} />);
 await screen.findByRole("button", { name: /Edit Stadium/ });
 fireEvent.click(screen.getByRole("button", { name: "History" }));
 fireEvent.click(await screen.findByRole("button", { name: /^Edit 3/ }));
 expect(api.command).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button", { name: "Restore edit 3" }));
 expect(screen.queryByRole("button", { name: /^Edit 9/ })).toBeNull();
 expect(within(screen.getByRole("button", { name: /^Edit 8/ })).getByText("Current")).toBeVisible();
 await act(async () => { confirmRestore?.(restored); });
 const savedRow = await screen.findByRole("button", { name: /^Edit 9/ });
 expect(savedRow).toHaveAttribute("aria-pressed", "true");
 expect(within(savedRow).getByText("Restored edit 3")).toBeVisible();
 expect(within(savedRow).getByText("Current")).toBeVisible();
 expect(screen.getAllByRole("button", { name: /^Edit 8/ })).toHaveLength(1);
 expect(api.revisions).toHaveBeenCalledTimes(1);
 expect(api.command.mock.calls[0]?.[3]).toEqual({ kind: "restore", sourceRevision: 3 });
 fireEvent.click(screen.getByRole("button", { name: /^Edit 3/ }));
 expect(screen.getByRole("button", { name: /^Edit 3/ })).toHaveAttribute("aria-pressed", "true");
 expect(within(savedRow).getByText("Current")).toBeVisible();
 expect(api.command).toHaveBeenCalledTimes(1);
});

it("previewing an earlier edit keeps the playhead, clamped to that edit's length", async () => {
 const current = VideoEditSchema.parse({ ...edit, revision: 8 });
 const earlier = VideoEditSchema.parse({ ...edit, revision: 3, composition: { ...edit.composition, items: [{ ...edit.composition.items[0]!, outFrame: 30, displayFrames: 30 }], text: [] } });
 api.list.mockResolvedValue([current]); api.revisions.mockResolvedValue([current, earlier]);
 render(<VideoEditor {...props} />);
 await screen.findByRole("button", { name: /Edit Stadium/ });
 fireEvent.change(screen.getByRole("slider", { name: "Timeline playhead" }), { target: { value: "45" } });
 fireEvent.click(screen.getByRole("button", { name: "History" }));
 fireEvent.click(await screen.findByRole("button", { name: /^Edit 8/ }));
 expect(screen.getByRole("slider", { name: "Timeline playhead" })).toHaveValue("45");
 fireEvent.click(screen.getByRole("button", { name: /^Edit 3/ }));
 expect(screen.getByRole("slider", { name: "Timeline playhead" })).toHaveValue("30");
});

it("switching edits removes the old History preview and restore action while retaining the timeline view preference", async () => {
 const current = VideoEditSchema.parse({ ...edit, revision: 3 });
 const earlier = VideoEditSchema.parse({ ...edit, revision: 2, composition: { ...edit.composition, text: [{ ...edit.composition.text[0], text: "Earlier A caption" }] } });
 const other = VideoEditSchema.parse({ ...edit, id: "edit_other", revision: 4, composition: { ...edit.composition, text: [{ ...edit.composition.text[0], text: "Current B caption" }] } });
 api.get.mockImplementation(async (id: string) => id === edit.id ? current : other); api.revisions.mockResolvedValue([current, earlier]);
 const view = render(<VideoEditor {...props} initialEditId={edit.id} presentation="embedded" />);
 fireEvent.click(await screen.findByRole("button", { name: "Timeline" }));
 fireEvent.click(screen.getByRole("button", { name: "History" }));
 fireEvent.click(await screen.findByRole("button", { name: /^Edit 2/ }));
 expect(screen.getByRole("button", { name: "Restore edit 2" })).toBeVisible();
 expect(view.container.querySelector(".ve-caption-preview")).toHaveTextContent("Earlier A caption");
 view.rerender(<VideoEditor {...props} initialEditId={other.id} presentation="embedded" />);
 await waitFor(() => expect(view.container.querySelector(".ve-caption-preview")).toHaveTextContent("Current B caption"));
 expect(screen.queryByRole("button", { name: "Restore edit 2" })).toBeNull();
 expect(screen.queryByRole("complementary", { name: "Edit history" })).toBeNull();
 expect(screen.queryByLabelText("Video timeline")).toBeNull();
 expect(api.command).not.toHaveBeenCalled();
});

it.each(["new", "existing"] as const)("retains %s caption words for their own edit when switching without blurring", async kind => {
 const other = VideoEditSchema.parse({ ...edit, id: "edit_other", composition: { ...edit.composition, text: [{ ...edit.composition.text[0], text: "B caption" }] } });
 api.get.mockImplementation(async (id: string) => id === edit.id ? edit : other);
 const view = render(<VideoEditor {...props} initialEditId={edit.id} />);
 fireEvent.click(await screen.findByRole("button", { name: "Captions" }));
 fireEvent.click(within(screen.getByRole("region", { name: "Caption style" })).getByRole("button", { name: kind === "new" ? "Add caption" : "Keep me attached" }));
 fireEvent.change(screen.getByLabelText("Caption text"), { target: { value: "Unfinished words belonging to A" } });
 view.rerender(<VideoEditor {...props} initialEditId={other.id} />);
 await waitFor(() => expect(view.container.querySelector(".ve-caption-preview")).toHaveTextContent("B caption"));
 expect(screen.queryByLabelText("Caption text")).toBeNull(); expect(api.command).not.toHaveBeenCalled();
 view.rerender(<VideoEditor {...props} initialEditId={edit.id} />);
 fireEvent.click(await screen.findByRole("button", { name: "Captions" }));
 fireEvent.click(within(screen.getByRole("region", { name: "Caption style" })).getByRole("button", { name: kind === "new" ? "Add caption" : "Keep me attached" }));
 expect(screen.getByLabelText("Caption text")).toHaveValue("Unfinished words belonging to A");
 expect(api.command).not.toHaveBeenCalled();
});

it("drops an edit's open removal confirmation on selection change and preserves a panel during same-edit URL synchronization", async () => {
 const other = VideoEditSchema.parse({ ...edit, id: "edit_other", composition: { ...edit.composition, text: [] } });
 api.get.mockImplementation(async (id: string) => id === edit.id ? edit : other);
 const view = render(<VideoEditor {...props} />);
 fireEvent.contextMenu(await screen.findByRole("button", { name: /Edit Stadium/ }));
 fireEvent.click(screen.getByRole("menuitem", { name: "Remove clip" }));
 expect(screen.getByRole("dialog", { name: "Remove Stadium?" })).toBeVisible();
 view.rerender(<VideoEditor {...props} initialEditId={edit.id} />);
 expect(screen.getByRole("dialog", { name: "Remove Stadium?" })).toBeVisible();
 view.rerender(<VideoEditor {...props} initialEditId={other.id} />);
 await screen.findByRole("button", { name: /Edit Stadium/ });
 expect(screen.queryByRole("dialog", { name: "Remove Stadium?" })).toBeNull();
 expect(api.command).not.toHaveBeenCalled();
});

it("keeps current caption buffers and timing errors out of a read-only historical revision", async () => {
 const current = VideoEditSchema.parse({ ...edit, revision: 3, composition: { ...edit.composition, text: [{ ...edit.composition.text[0], endFrame: 120 }] }, issues: [{ elementId: "text_one", code: "text_timing", message: "Timing extends past this clip." }] });
 const earlier = VideoEditSchema.parse({ ...edit, revision: 2 });
 const other = VideoEditSchema.parse({ ...edit, id: "edit_other", composition: { ...edit.composition, text: [] } });
 api.get.mockImplementation(async (id: string) => id === edit.id ? current : other); api.revisions.mockResolvedValue([current, earlier]);
 const view = render(<VideoEditor {...props} initialEditId={edit.id} />);
 fireEvent.click(await screen.findByRole("button", { name: "Keep me attached" }));
 fireEvent.change(screen.getByLabelText("Caption text"), { target: { value: "Uncommitted current words" } });
 view.rerender(<VideoEditor {...props} initialEditId={other.id} />);
 await waitFor(() => expect(screen.queryByLabelText("Caption text")).toBeNull());
 view.rerender(<VideoEditor {...props} initialEditId={edit.id} />);
 fireEvent.click(await screen.findByRole("button", { name: "History" }));
 fireEvent.click(await screen.findByRole("button", { name: /^Edit 2/ }));
 fireEvent.click(screen.getByRole("button", { name: "Keep me attached" }));
 expect(screen.getByLabelText("Caption text")).toHaveValue("Keep me attached");
 expect(screen.getByLabelText("Caption text")).toBeDisabled();
 expect(screen.queryByRole("spinbutton", { name: "Start seconds" })).toBeNull();
 expect(screen.queryByRole("button", { name: "Fix timing" })).toBeNull();
 fireEvent.click(screen.getByRole("button", { name: "History" }));
 fireEvent.click(screen.getByRole("button", { name: /^Edit 3/ }));
 fireEvent.click(screen.getByRole("button", { name: "Keep me attached" }));
 expect(screen.getByLabelText("Caption text")).toHaveValue("Uncommitted current words");
 expect(screen.getByLabelText("Caption text")).toBeEnabled();
 expect(api.command).not.toHaveBeenCalled();
});

it("keeps unfinished caption words visible after a concurrent save and requires a deliberate text edit before saving", async () => {
 let current = edit;
 const other = VideoEditSchema.parse({ ...edit, id: "edit_other", composition: { ...edit.composition, text: [] } });
 api.get.mockImplementation(async (id: string) => id === edit.id ? current : other);
 api.command.mockImplementation(async (_id: string, revision: number, _operation: string, command: EditCommand) => { expect(revision).toBe(2); if (command.kind === "restore") throw new Error("Not a restore"); current = { ...current, revision: 3, composition: applyEditCommand(current.composition, command) }; return current; });
 const view = render(<VideoEditor {...props} initialEditId={edit.id} />);
 fireEvent.click(await screen.findByRole("button", { name: "Keep me attached" }));
 fireEvent.change(screen.getByLabelText("Caption text"), { target: { value: "Unfinished words on this device" } });
 view.rerender(<VideoEditor {...props} initialEditId={other.id} />);
 await waitFor(() => expect(screen.queryByLabelText("Caption text")).toBeNull());
 current = VideoEditSchema.parse({ ...edit, revision: 2, composition: { ...edit.composition, text: [{ ...edit.composition.text[0], text: "Words saved in the other tab" }] } });
 const remoteRevision = structuredClone(current);
 view.rerender(<VideoEditor {...props} initialEditId={edit.id} />);
 fireEvent.click(await screen.findByRole("button", { name: "Words saved in the other tab" }));
 expect(screen.getByLabelText("Caption text")).toHaveValue("Unfinished words on this device");
 expect(screen.getByRole("alert")).toHaveTextContent("Your unfinished words are kept here");
 expect(screen.getByRole("combobox", { name: "Caption weight" })).toBeDisabled();
 fireEvent.blur(screen.getByLabelText("Caption text"));
 expect(api.command).not.toHaveBeenCalled(); expect(current).toEqual(remoteRevision);
 fireEvent.change(screen.getByLabelText("Caption text"), { target: { value: "Unfinished words on this device, continued" } });
 expect(screen.queryByRole("alert")).toBeNull();
 fireEvent.blur(screen.getByLabelText("Caption text"));
 await waitFor(() => expect(api.command).toHaveBeenCalledTimes(1));
 expect(api.command.mock.calls[0]?.[3]).toMatchObject({ kind: "text", text: { text: "Unfinished words on this device, continued" } });
 expect(current.revision).toBe(3); expect(remoteRevision.composition.text[0]?.text).toBe("Words saved in the other tab");
});

it("does not open an old edit's Share after a deferred fullscreen exit resolves in another edit", async () => {
 const other = VideoEditSchema.parse({ ...edit, id: "edit_other", composition: { ...edit.composition, text: [] } });
 api.get.mockImplementation(async (id: string) => id === edit.id ? edit : other);
 const stored = VideoExportSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "export_ready", ownerId: edit.ownerId, projectId: edit.projectId, editId: edit.id, revision: edit.revision, submissionId: "submission_ready", executionDraftId: "draft_ready", executionDraftRevision: 1, composition: edit.composition, compositionHash: "a".repeat(64), sources: [], renderer: "native/v1", attemptId: "attempt_ready", state: "ready", progress: 1, stored: { storagePath: "users/creator/export.mp4", generation: "1", sha256: "b".repeat(64), bytes: 100, versionId: "version_export" }, createdAt: edit.createdAt, updatedAt: edit.updatedAt });
 api.exports.mockResolvedValue([stored]);
 const onShare = vi.fn(); const selected = vi.fn();
 const oldFullscreen = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
 const oldExit = Object.getOwnPropertyDescriptor(document, "exitFullscreen");
 let resolveExit: (() => void) | undefined;
 const exit = vi.fn(() => new Promise<void>(resolve => { resolveExit = resolve; }));
 try {
  const view = render(<VideoEditor {...props} initialEditId={edit.id} onEditSelected={selected} onShareExport={onShare} />);
  await screen.findByRole("button", { name: "Play video" });
  Object.defineProperty(document, "fullscreenElement", { configurable: true, value: view.container.querySelector(".ve-editor-stage") });
  Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
  fireEvent(document, new Event("fullscreenchange"));
  fireEvent.click(screen.getByRole("button", { name: "Use" }));
  fireEvent.click(screen.getByRole("button", { name: "Share" }));
  expect(exit).toHaveBeenCalledTimes(1);
  view.rerender(<VideoEditor {...props} initialEditId={other.id} onEditSelected={selected} onShareExport={onShare} />);
  await waitFor(() => expect(selected).toHaveBeenLastCalledWith(other.id));
  await act(async () => { resolveExit?.(); });
  expect(onShare).not.toHaveBeenCalled();
 } finally {
  if (oldFullscreen) Object.defineProperty(document, "fullscreenElement", oldFullscreen); else Reflect.deleteProperty(document, "fullscreenElement");
  if (oldExit) Object.defineProperty(document, "exitFullscreen", oldExit); else Reflect.deleteProperty(document, "exitFullscreen");
 }
});

it.each(["text_render_policy", "text_timing"])("caption style exposes timing repair only for a timing issue: %s", async code => {
 const issue = VideoEditSchema.parse({ ...edit, issues: [{ elementId: "text_one", code, message: "This caption needs attention." }] });
 api.list.mockResolvedValue([issue]);
 render(<VideoEditor {...props} />);
 fireEvent.click(await screen.findByRole("button", { name: "Keep me attached" }));
 expect(screen.getByRole("textbox", { name: "Caption text" })).toBeVisible();
 if (code === "text_timing") {
  expect(screen.getByRole("spinbutton", { name: "Start seconds" })).toBeVisible();
  expect(screen.getByRole("spinbutton", { name: "End seconds" })).toBeVisible();
 } else {
  expect(screen.queryByRole("spinbutton", { name: "Start seconds" })).toBeNull();
  expect(screen.queryByRole("spinbutton", { name: "End seconds" })).toBeNull();
 }
 expect(api.command).not.toHaveBeenCalled();
});

it("shows a fractional saved edit duration without rounding it down to whole seconds", async () => {
 const fractional = VideoEditSchema.parse({ ...edit, composition: { ...edit.composition, items: edit.composition.items.map(item => ({ ...item, outFrame: 153, displayFrames: 153 })) } });
 api.list.mockResolvedValue([fractional]);
 render(<VideoEditor {...props} presentation="focus" />);
 expect(await screen.findByText("0:00 / 0:05.1")).toBeVisible();
 expect(api.command).not.toHaveBeenCalled();
});

it("mobile timeline zoom uses detailed density and returns to fit without changing the saved edit", async () => {
 const descriptor = Object.getOwnPropertyDescriptor(window, "innerWidth");
 Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
 try {
  const fourSeconds = VideoEditSchema.parse({ ...edit, composition: { ...edit.composition, items: edit.composition.items.map(item => ({ ...item, outFrame: 120, displayFrames: 120 })) } });
  api.list.mockResolvedValue([fourSeconds]);
  render(<VideoEditor {...props} />);
  const clip = await screen.findByRole("button", { name: /Edit Stadium/ });
  const timeline = screen.getByLabelText("Video timeline");
  expect(timeline).not.toHaveAttribute("data-detailed-mobile");
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  expect(timeline).toHaveAttribute("data-detailed-mobile", "true");
  expect(clip).toHaveStyle({ width: "272px" });
  fireEvent.click(screen.getByRole("button", { name: "Fit all" }));
  expect(timeline).not.toHaveAttribute("data-detailed-mobile");
  expect(api.command).not.toHaveBeenCalled();
 } finally {
  if (descriptor) Object.defineProperty(window, "innerWidth", descriptor);
  else Reflect.deleteProperty(window, "innerWidth");
 }
});

it("a removed selection falls back to the retained item only after server confirmation", async () => {
 const other = MediaVersionSchema.parse({ ...version, id: "version_other", label: "Desk" });
 const twoItems = VideoEditSchema.parse({ ...edit, composition: { ...edit.composition, items: [...edit.composition.items, { ...edit.composition.items[0], id: "item_other", versionId: other.id }] } });
 const removed = VideoEditSchema.parse({ ...twoItems, revision: 2, composition: { ...twoItems.composition, items: twoItems.composition.items.slice(1), text: [] } });
 api.list.mockResolvedValue([twoItems]);
 let confirmRemoval: ((saved: VideoEdit) => void) | undefined;
 api.command.mockImplementationOnce(() => new Promise<VideoEdit>(resolve => { confirmRemoval = resolve; }));
 render(<VideoEditor {...props} media={[version, other]} />);
 const first = await screen.findByRole("button", { name: /Edit Stadium/ });
 const retained = screen.getByRole("button", { name: /Edit Desk/ });
 fireEvent.change(screen.getByRole("slider", { name: "Timeline playhead" }), { target: { value: "45" } });
 fireEvent.contextMenu(first); fireEvent.click(screen.getByRole("menuitem", { name: "Remove clip" }));
 fireEvent.click(screen.getByRole("button", { name: "Remove clip and attached elements" }));
 expect(first).toHaveAttribute("aria-pressed", "true");
 expect(retained).toHaveAttribute("aria-pressed", "false");
 await act(async () => { confirmRemoval?.(removed); });
 await waitFor(() => expect(screen.queryByRole("button", { name: /Edit Stadium/ })).toBeNull());
 expect(retained).toHaveAttribute("aria-pressed", "true");
 expect(screen.getByRole("button", { name: "Timing" })).toBeEnabled();
 expect(screen.getByRole("slider", { name: "Timeline playhead" })).toHaveValue("45");
 expect(api.command).toHaveBeenCalledTimes(1);
});
