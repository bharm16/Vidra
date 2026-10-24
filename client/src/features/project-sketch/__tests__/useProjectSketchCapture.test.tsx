import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import type { LiveOutput } from "@/features/realtime-sketch/hooks/generationReducer";
import type { SketchCheckpoint } from "../api/SketchCheckpointStore";
import { acceptProjectSketch } from "../api/projectSketchApi";
import { useProjectSketchCapture } from "../hooks/useProjectSketchCapture";

const store = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(async () => undefined) }));
vi.mock("../api/SketchCheckpointStore", () => ({ SketchCheckpointStore: class { read = store.read; save = store.save; } }));
vi.mock("../api/projectSketchApi", () => ({ acceptProjectSketch: vi.fn() }));
const settings = { prompt: "Current words differ", strength: .8, steps: 8, seed: 30 };
const frame: LiveOutput = { imageUrl: "data:image/png;base64,YQ==", sketchDataUri: "data:image/png;base64,Yg==", requestId: "17", at: Date.parse("2026-10-17T00:00:00.000Z"), inputs: { prompt: "Words that made the displayed picture", strength: .875, steps: 8, seed: 42 } };
beforeEach(() => { vi.clearAllMocks(); store.read.mockResolvedValue(undefined); store.save.mockResolvedValue(undefined); });
describe("exact displayed-output acceptance", () => {
  it("retains the latest drawing when closing before the debounce expires", async () => {
    const { result, unmount } = renderHook(() => useProjectSketchCapture({ ownerId: "owner", projectId: "project_one", settings, onAccepted: vi.fn() }));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    store.save.mockClear();
    act(() => result.current.checkpoint(frame.sketchDataUri)); unmount();
    await waitFor(() => expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ drawingDataUri: frame.sketchDataUri })));
  });

  it("refuses a safe close when the latest drawing cannot be retained", async () => {
    const { result } = renderHook(() => useProjectSketchCapture({ ownerId: "owner", projectId: "project_one", settings, onAccepted: vi.fn() }));
    await waitFor(() => expect(result.current.loaded).toBe(true)); store.save.mockRejectedValue(new Error("Device full"));
    await act(async () => { expect(await result.current.retainBeforeClose()).toBe(false); });
    expect(result.current.localError).toContain("could not be saved");
  });

  it("waits for edits that arrive during a slow retention write", async () => {
    const { result } = renderHook(() => useProjectSketchCapture({ ownerId: "owner", projectId: "project_one", settings, onAccepted: vi.fn() }));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    let first!: () => void; let second!: () => void; let finished = false;
    store.save.mockReset().mockResolvedValue(undefined).mockImplementationOnce(() => new Promise<undefined>(resolve => { first = () => resolve(undefined); })).mockImplementationOnce(() => new Promise<undefined>(resolve => { second = () => resolve(undefined); }));
    let closing: Promise<boolean> = Promise.resolve(false);
    act(() => { result.current.checkpoint(frame.sketchDataUri); closing = result.current.retainBeforeClose().then(retained => { finished = true; return retained; }); });
    act(() => result.current.checkpoint(frame.imageUrl));
    await act(async () => { first(); await Promise.resolve(); });
    expect(finished).toBe(false);
    expect(store.save).toHaveBeenLastCalledWith(expect.objectContaining({ drawingDataUri: frame.imageUrl }));
    await act(async () => { second(); expect(await closing).toBe(true); });
  });

  it("retries the original captured tuple after response loss and never changes it to the later frame or current settings", async () => {
    vi.mocked(acceptProjectSketch).mockRejectedValueOnce(new Error("response lost"));
    const accepted = vi.fn();
    const { result } = renderHook(() => useProjectSketchCapture({ ownerId: "owner", projectId: "project_one", settings, onAccepted: accepted }));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => result.current.save(frame));
    expect(result.current.saveError).toBe("response lost");
    const command = vi.mocked(acceptProjectSketch).mock.calls[0]?.[2];
    expect(command).toMatchObject({ outputDataUri: frame.imageUrl, drawingDataUri: frame.sketchDataUri, inputs: frame.inputs });
    const version = MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_saved", projectId: "project_one", ownerId: "owner", kind: "image", label: "Sketch picture", origin: { kind: "sketch-capture", captureId: command?.captureId }, sourceInputs: [], object: { identity: "unknown", assetId: "saved", storagePath: "users/owner/previews/images/saved.png" }, metadata: { state: "pending" }, association: "linked", createdAt: "2026-10-17T00:00:00.000Z" });
    vi.mocked(acceptProjectSketch).mockResolvedValueOnce(version);
    await act(async () => result.current.save({ ...frame, requestId: "18", imageUrl: "data:image/png;base64,Yw==" }));
    expect(vi.mocked(acceptProjectSketch).mock.calls[1]?.[2]).toEqual(command);
    expect(accepted).toHaveBeenCalledWith(version); expect(result.current.saved).toEqual(version);
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ pending: command }));
  });
  it("keeps one ID across a double press and re-press of the same displayed frame", async () => {
    vi.mocked(acceptProjectSketch).mockRejectedValue(new Error("response uncertain"));
    const { result } = renderHook(() => useProjectSketchCapture({ ownerId: "owner", projectId: "project_one", settings, onAccepted: vi.fn() }));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => { await Promise.all([result.current.save(frame), result.current.save(frame)]); });
    expect(acceptProjectSketch).toHaveBeenCalledTimes(1);
    await act(async () => result.current.save(frame));
    expect(vi.mocked(acceptProjectSketch).mock.calls[1]?.[2].captureId).toBe(vi.mocked(acceptProjectSketch).mock.calls[0]?.[2].captureId);
  });
  it("reopens a pending acceptance without starting preview or inventing a new identity", async () => {
    const pending = { captureId: "capture_recovered", displayedFrameId: "session:17", displayedAt: "2026-10-17T00:00:00.000Z", outputDataUri: frame.imageUrl, drawingDataUri: frame.sketchDataUri, inputs: frame.inputs };
    const checkpoint: SketchCheckpoint = { key: "owner:project_one", inputs: frame.inputs, drawingDataUri: frame.sketchDataUri, pending };
    store.read.mockResolvedValueOnce(checkpoint); vi.mocked(acceptProjectSketch).mockRejectedValue(new Error("controlled"));
    const { result } = renderHook(() => useProjectSketchCapture({ ownerId: "owner", projectId: "project_one", settings, onAccepted: vi.fn() }));
    await waitFor(() => expect(result.current.restore).toBeDefined());
    expect(acceptProjectSketch).not.toHaveBeenCalled();
    act(() => result.current.chooseRestore()); expect(result.current.recoveredSettings).toEqual(frame.inputs);
    await act(async () => result.current.save()); expect(vi.mocked(acceptProjectSketch).mock.calls[0]?.[2]).toEqual(pending);
  });
  it("does not dispatch an acceptance whose stable recovery identity could not be checkpointed", async () => {
    store.save.mockRejectedValueOnce(new Error("Device storage is full"));
    const { result } = renderHook(() => useProjectSketchCapture({ ownerId: "owner", projectId: "project_one", settings, onAccepted: vi.fn() }));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => result.current.save(frame));
    expect(acceptProjectSketch).not.toHaveBeenCalled(); expect(result.current.saveError).toBe("Device storage is full");
    expect(result.current.pending).toMatchObject({ outputDataUri: frame.imageUrl, inputs: frame.inputs });
  });
});
