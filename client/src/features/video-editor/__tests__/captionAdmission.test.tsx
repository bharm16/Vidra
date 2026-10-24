import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useInitialCaptions } from "../hooks/useInitialCaptions";
import type { VideoEditorController } from "../hooks/useVideoEditor";
import { VideoCompositionSchema, VideoEditSchema, type VideoComposition } from "@shared/schemas/workflow/video-edit.schemas";
import { emptyVideoComposition } from "@shared/video-edit/composition";

const populated = VideoCompositionSchema.parse({ ...emptyVideoComposition(), items: [{ id: "item_one", versionId: "version_one", kind: "clip", inFrame: 0, outFrame: 150, displayFrames: 150, fit: "fit", sourceAudio: { muted: false, gain: 1 } }] });
const captions = { requestId: "request_one", text: "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello\n" };
function controller(composition: VideoComposition, command: VideoEditorController["command"] = vi.fn(async () => true), id = "edit_one"): VideoEditorController {
  return { edit: VideoEditSchema.parse({ schemaVersion: "vidra-workflow/v2", id, ownerId: "creator", projectId: "project_one", name: "Edit", revision: 1, composition, issues: [], createdAt: "2026-10-24T00:00:00Z", updatedAt: "2026-10-24T00:00:00Z" }), loading: false, busy: false, command } as VideoEditorController;
}
afterEach(cleanup);
it("waits for media and then places the same caption request once", async () => {
  const command = vi.fn(async () => true); const onHandled = vi.fn();
  const hook = renderHook(({ current }) => useInitialCaptions({ captions, controller: current, onHandled }), { initialProps: { current: controller(emptyVideoComposition(), command) } });
  expect(hook.result.current.error).toContain("Add a picture or clip");
  hook.rerender({ current: controller(populated, command) });
  await act(async () => {});
  expect(command).toHaveBeenCalledWith(expect.objectContaining({ kind: "replace_composition", composition: expect.objectContaining({ text: [expect.objectContaining({ text: "Hello" })] }) }), expect.anything());
  expect(onHandled).toHaveBeenCalledTimes(1);
});

it("ignores a late completion after the caption request changes", async () => {
  let finish: (value: boolean) => void = () => undefined;
  const oldCommand = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
  const newCommand = vi.fn(() => new Promise<boolean>(() => {}));
  const oldHandled = vi.fn(); const newHandled = vi.fn();
  const hook = renderHook(({ request, current, handled }) => useInitialCaptions({ captions: request, controller: current, onHandled: handled }), { initialProps: { request: captions, current: controller(populated, oldCommand), handled: oldHandled } });
  hook.rerender({ request: { ...captions, requestId: "request_two" }, current: controller(populated, newCommand, "edit_two"), handled: newHandled });
  await act(async () => { finish(true); });
  expect(oldHandled).not.toHaveBeenCalled(); expect(newHandled).not.toHaveBeenCalled();
});
it("retries the retained command identity and acknowledges an already placed result", async () => {
  const command = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true); const handled = vi.fn();
  const current = controller(populated, command);
  const hook = renderHook(() => useInitialCaptions({ captions, controller: current, onHandled: handled }));
  await act(async () => {});
  expect(hook.result.current.error).toContain("kept");
  await act(async () => { hook.result.current.retry(); });
  expect(command).toHaveBeenCalledTimes(2);
  expect(command.mock.calls[1]).toEqual(command.mock.calls[0]);
  expect(handled).toHaveBeenCalledTimes(1);
});
it("does not acknowledge an in-flight command after unmounting", async () => {
  let finish: (value: boolean) => void = () => undefined;
  const handled = vi.fn(); const command = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
  const hook = renderHook(() => useInitialCaptions({ captions, controller: controller(populated, command), onHandled: handled }));
  hook.unmount(); await act(async () => { finish(true); }); expect(handled).not.toHaveBeenCalled();
});
