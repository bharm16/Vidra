import { useFirstFrameAdmission } from "../useFirstFrameAdmission";
import { usePromptOptimization } from "../usePromptOptimization";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KeyframeTile } from "@/features/generation-controls/types";
import type { PersistenceTarget } from "@/features/idea-box";
import { usePendingFirstFrame } from "../usePendingFirstFrame";

const wire = vi.hoisted(() => ({
  upload: vi.fn(),
  admit: vi.fn(),
  refresh: vi.fn(),
  key: vi.fn(),
}));
vi.mock("@/features/preview/api/previewApi", () => ({
  uploadPreviewImage: wire.upload,
  getMediaReferenceViewUrl: wire.refresh,
  createAdmissionKey: wire.key,
  validatePreviewImageFile: () => ({ valid: true }),
}));
vi.mock("../../../api/pendingReference", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  admitPendingReference: wire.admit,
}));

const file = new File(["image"], "reference.png", { type: "image/png" });
const uploaded = {
  success: true,
  data: {
    storagePath: "users/creator/previews/images/reference.png",
    imageUrl: "https://media.example/reference",
    viewUrl: "https://media.example/reference",
  },
};
const attached = {
  success: true,
  data: {
    imageUrl: "https://media.example/take",
    storagePath: "image-previews/creator/asset-1",
    assetId: "asset-1",
    generationId: "take-1",
    promptVersionId: "v1",
    attachment: {
      state: "attached",
      sessionId: "session-1",
      promptVersionId: "v1",
      generationId: "take-1",
    },
  },
};
const keyOf = (sessionId: string | null, creator = "creator"): string =>
  `vidra:pending-reference:v1:${creator}:${sessionId ?? "draft"}`;
interface Context {
  creatorId: string | undefined;
  sessionId: string | null;
  words: boolean;
}
function setup(
  initial: Context = { creatorId: "creator", sessionId: null, words: false },
) {
  const context = { ...initial };
  const target: PersistenceTarget = {};
  const setStartFrame = vi.fn<(tile: KeyframeTile) => void>();
  const onError = vi.fn();
  const resolvePersistenceTarget = vi.fn(() => target);
  const waitForVersionPersistence = vi.fn(
    async (_sessionId: string, _versionId: string): Promise<void> => {},
  );
  const hook = renderHook(() =>
    usePendingFirstFrame({
      creatorId: context.creatorId,
      activeSessionId: context.sessionId,
      getActiveSessionId: () => context.sessionId,
      hasAssociatedWords: () => context.words,
      resolvePersistenceTarget,
      waitForVersionPersistence,
      setStartFrame,
      onError,
    }),
  );
  return {
    ...hook,
    context,
    target,
    setStartFrame,
    onError,
    resolvePersistenceTarget,
    waitForVersionPersistence,
  };
}
function firstFrameFor(reference: ReturnType<typeof setup>) {
  return renderHook(() =>
    useFirstFrameAdmission({
      resolvePersistenceTarget: () => reference.target,
      getActiveSessionId: () => reference.context.sessionId,
      hasAssociatedWords: () => reference.context.words,
      beginReferenceSelection: () =>
        reference.result.current.beginReferenceSelection(),
      stagePendingReference: (selected, sessionId) =>
        reference.result.current.stageReference(selected, sessionId),
      setStartFrame: reference.setStartFrame,
      onError: reference.onError,
      onInvalidFile: reference.onError,
    }),
  );
}
function optimizationFor(reference: ReturnType<typeof setup>) {
  const optimize = vi.fn(async () => ({ optimized: "New words", score: 90 }));
  const saveToHistory = vi.fn(async () => ({
    uuid: "words-1",
    id: "session-1",
  }));
  const onOptimizationApplied = vi.fn();
  const hook = renderHook(() =>
    usePromptOptimization({
      promptOptimizer: {
        inputPrompt: "New words",
        genericOptimizedPrompt: null,
        improvementContext: null,
        qualityScore: null,
        optimize,
        compile: vi.fn(),
        setInputPrompt: vi.fn(),
      },
      promptHistory: {
        history: [],
        updateEntryVersions: vi.fn(),
        saveToHistory,
      },
      promptContext: null,
      selectedMode: "video",
      selectedModel: "sora-2",
      generationParams: {},
      currentPromptUuid: null,
      setCurrentPromptUuid: vi.fn(),
      setCurrentPromptDocId: vi.fn(),
      setDisplayedPromptSilently: vi.fn(),
      setShowResults: vi.fn(),
      applyInitialHighlightSnapshot: vi.fn(),
      resetEditStacks: vi.fn(),
      persistedSignatureRef: { current: null },
      skipLoadFromUrlRef: { current: false },
      navigate: vi.fn(),
      isReferenceUploading: () =>
        reference.result.current.isReferenceUploading(),
      onOptimizationApplied,
    }),
  );
  return { ...hook, optimize, saveToHistory, onOptimizationApplied };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

beforeEach(() => {
  localStorage.clear();
  wire.upload.mockReset().mockResolvedValue(uploaded);
  wire.admit.mockReset().mockResolvedValue(attached);
  wire.refresh.mockReset().mockResolvedValue({
    success: true,
    data: { viewUrl: "https://media.example/fresh" },
  });
  wire.key.mockReset().mockReturnValue("admission-1");
});
afterEach(() => vi.restoreAllMocks());

describe("reference before words (issue #119)", () => {
  it("uploads wordless input durably without arming or admitting it", async () => {
    const hook = setup();
    await act(async () => {
      await hook.result.current.stageReference(file, null);
    });
    expect(hook.result.current.pendingReference?.url).toBe(
      uploaded.data.viewUrl,
    );
    expect(JSON.parse(localStorage.getItem(keyOf(null))!)).toEqual({
      storagePath: uploaded.data.storagePath,
      sessionId: null,
    });
    expect(wire.upload).toHaveBeenCalledWith(
      file,
      { expectedCreatorId: "creator" },
      { source: "pending-first-frame" },
    );
    expect(wire.admit).not.toHaveBeenCalled();
    expect(hook.setStartFrame).not.toHaveBeenCalled();
    await act(async () => {
      await hook.result.current.admitReference();
    });
    expect(hook.resolvePersistenceTarget).not.toHaveBeenCalled();
    expect(hook.onError).toHaveBeenCalledWith(
      expect.stringContaining("associated words"),
    );
  });
  it("blocks expansion, keyboard optimization and reoptimize until a slow upload settles, then persists words without replacing the reference", async () => {
    const pending = deferred<typeof uploaded>();
    wire.upload.mockReturnValueOnce(pending.promise);
    const reference = setup();
    const optimize = vi.fn(async () => ({
      optimized: "A city at night",
      score: 90,
    }));
    const saveToHistory = vi.fn(async () => ({
      uuid: "words-1",
      id: "session-1",
    }));
    const navigate = vi.fn();
    const applied = vi.fn(() => reference.result.current.bindDraftToSession());
    const optimization = renderHook(() =>
      usePromptOptimization({
        promptOptimizer: {
          inputPrompt: "A city",
          genericOptimizedPrompt: null,
          improvementContext: null,
          qualityScore: null,
          optimize,
          compile: vi.fn(),
          setInputPrompt: vi.fn(),
        },
        promptHistory: {
          history: [],
          updateEntryVersions: vi.fn(),
          saveToHistory,
        },
        promptContext: null,
        selectedMode: "video",
        selectedModel: "sora-2",
        generationParams: {},
        currentPromptUuid: null,
        setCurrentPromptUuid: vi.fn(),
        setCurrentPromptDocId: (id) => {
          reference.context.sessionId = id;
        },
        setDisplayedPromptSilently: vi.fn(),
        setShowResults: vi.fn(),
        applyInitialHighlightSnapshot: vi.fn(),
        resetEditStacks: vi.fn(),
        persistedSignatureRef: { current: null },
        skipLoadFromUrlRef: { current: false },
        navigate,
        isReferenceUploading: () =>
          reference.result.current.isReferenceUploading(),
        onOptimizationApplied: () => {
          applied();
        },
      }),
    );
    let upload: Promise<void>;
    act(() => {
      upload = reference.result.current.stageReference(file, null);
    });
    expect(reference.result.current.pendingReference?.uploading).toBe(true);
    // These are the common entry points used by the button, keyboard shortcut
    // and reoptimization; none can start persistence while media is uploading.
    await act(async () => {
      await optimization.result.current.handleOptimize("A city");
      await optimization.result.current.handleReoptimize("Changed words", {
        forceGenericTarget: true,
      });
    });
    expect(optimize).not.toHaveBeenCalled();
    expect(saveToHistory).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(applied).not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve(uploaded);
      await upload!;
    });
    expect(reference.result.current.pendingReference?.uploading).toBe(false);
    expect(reference.context.sessionId).toBeNull();
    expect(wire.admit).not.toHaveBeenCalled();
    await act(async () => {
      await optimization.result.current.handleOptimize("A city");
    });
    expect(saveToHistory).toHaveBeenCalledTimes(1);
    expect(applied).toHaveReturnedWith(true); // workspace continuation skips replacement generation
    reference.rerender();
    await waitFor(() =>
      expect(reference.result.current.pendingReference).not.toBeNull(),
    );
    expect(
      JSON.parse(localStorage.getItem(keyOf("session-1"))!).storagePath,
    ).toBe(uploaded.data.storagePath);
    expect(reference.setStartFrame).not.toHaveBeenCalled();
    expect(wire.admit).not.toHaveBeenCalled();
  });
  it("guards slow file reads through uploadFirstFrame after a failed retained attempt", async () => {
    const reference = setup({
      creatorId: "creator",
      sessionId: "session-1",
      words: true,
    });
    Object.assign(reference.target, {
      sessionId: "session-1",
      promptVersionId: "v1",
    });
    const firstFrame = firstFrameFor(reference);
    wire.upload.mockRejectedValueOnce(new Error("Lost response"));
    await act(async () => {
      await firstFrame.result.current.uploadFirstFrame(file);
    });
    const originalAttempt = wire.upload.mock.calls[0]![2].admit;
    reference.context.words = false;
    const bytes = deferred<ArrayBuffer>();
    const different = new File(["different"], "different.png", {
      type: "image/png",
    });
    const read = vi.fn(() => bytes.promise);
    Object.defineProperty(different, "arrayBuffer", { value: read });
    let selection: Promise<void>;
    act(() => {
      selection = firstFrame.result.current.uploadFirstFrame(different);
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(reference.result.current.isReferenceUploading()).toBe(true);
    const optimization = optimizationFor(reference);
    await act(async () => {
      await optimization.result.current.handleOptimize("New words");
      await optimization.result.current.handleReoptimize("New words");
    });
    expect(optimization.optimize).not.toHaveBeenCalled();
    expect(optimization.saveToHistory).not.toHaveBeenCalled();
    expect(optimization.onOptimizationApplied).not.toHaveBeenCalled();
    await act(async () => {
      bytes.resolve(Uint8Array.from([1, 2, 3, 4]).buffer);
      await selection!;
    });
    expect(wire.upload).toHaveBeenCalledTimes(2);
    expect(wire.upload.mock.calls[1]![2]).toEqual({
      source: "pending-first-frame",
    });
    expect(reference.result.current.pendingReference?.uploading).toBe(false);
    expect(reference.setStartFrame).not.toHaveBeenCalled();
    // A retry of the original file still carries its own immutable acceptance,
    // despite blank current words and the intervening different selection.
    wire.upload.mockResolvedValueOnce(attached);
    await act(async () => {
      await firstFrame.result.current.uploadFirstFrame(file);
    });
    expect(wire.upload.mock.calls[2]![2].admit).toEqual(originalAttempt);
  });
  it.each(["session", "creator"])(
    "cancels a different slow-read selection after %s changes instead of retargeting it",
    async (change) => {
      const reference = setup({
        creatorId: "creator",
        sessionId: "session-1",
        words: true,
      });
      Object.assign(reference.target, {
        sessionId: "session-1",
        promptVersionId: "v1",
      });
      const firstFrame = firstFrameFor(reference);
      wire.upload.mockRejectedValueOnce(new Error("Lost response"));
      await act(async () => {
        await firstFrame.result.current.uploadFirstFrame(file);
      });
      reference.context.words = false;
      const bytes = deferred<ArrayBuffer>();
      const different = new File(["different"], "different.png", {
        type: "image/png",
      });
      Object.defineProperty(different, "arrayBuffer", {
        value: () => bytes.promise,
      });
      let selection: Promise<void>;
      act(() => {
        selection = firstFrame.result.current.uploadFirstFrame(different);
      });
      if (change === "session") reference.context.sessionId = "session-2";
      else reference.context.creatorId = "other";
      reference.rerender();
      await act(async () => {
        bytes.resolve(Uint8Array.from([1, 2, 3, 4]).buffer);
        await selection!;
      });
      expect(wire.upload).toHaveBeenCalledTimes(1);
      expect(reference.result.current.pendingReference).toBeNull();
      expect(reference.setStartFrame).not.toHaveBeenCalled();
    },
  );
  it("restores a reference after reload by owner-scoped durable handle and refreshes its URL", async () => {
    const hook = setup();
    await act(async () => {
      await hook.result.current.stageReference(file, null);
    });
    hook.unmount();
    const reloaded = setup();
    await waitFor(() =>
      expect(reloaded.result.current.pendingReference?.url).toBe(
        "https://media.example/fresh",
      ),
    );
    expect(wire.refresh).toHaveBeenCalledWith(
      uploaded.data.storagePath,
      "image",
    );
    expect(wire.admit).not.toHaveBeenCalled();
    expect(reloaded.setStartFrame).not.toHaveBeenCalled();
  });
  it("ordinary word persistence binds the originating draft, then explicit use admits it", async () => {
    const hook = setup();
    await act(async () => {
      await hook.result.current.stageReference(file, null);
    });
    // The workspace's identity getter changes synchronously at persistence,
    // before its next render, exactly as the existing optimization callback.
    hook.context.sessionId = "session-1";
    hook.context.words = true;
    hook.target.sessionId = "session-1";
    hook.target.promptVersionId = "v1";
    act(() => expect(hook.result.current.bindDraftToSession()).toBe(true));
    hook.rerender();
    await waitFor(() =>
      expect(hook.result.current.pendingReference).not.toBeNull(),
    );
    expect(wire.admit).not.toHaveBeenCalled();
    await act(async () => {
      await hook.result.current.admitReference();
    });
    expect(wire.admit).toHaveBeenCalledWith({
      storagePath: uploaded.data.storagePath,
      sessionId: "session-1",
      attempt: {
        sessionId: "session-1",
        promptVersionId: "v1",
        admissionKey: "admission-1",
      },
    });
    expect(hook.setStartFrame).toHaveBeenCalledWith(
      expect.objectContaining({ generationId: "take-1" }),
    );
    expect(hook.result.current.pendingReference).toBeNull();
    expect(localStorage.getItem(keyOf(null))).toBeNull();
    expect(localStorage.getItem(keyOf("session-1"))).toBeNull();
  });
  it("keeps wordless input pending when ordinary words persistence has not resolved a session", async () => {
    const hook = setup();
    await act(async () => {
      await hook.result.current.stageReference(file, null);
    });
    act(() => expect(hook.result.current.bindDraftToSession()).toBe(true));
    expect(hook.result.current.pendingReference).not.toBeNull();
    expect(wire.admit).not.toHaveBeenCalled();
    expect(hook.setStartFrame).not.toHaveBeenCalled();
  });
  it("does not overwrite the newer pending reference with an older upload response", async () => {
    const hook = setup();
    const older = deferred<typeof uploaded>();
    wire.upload.mockReturnValueOnce(older.promise);
    let oldRun: Promise<void>;
    act(() => {
      oldRun = hook.result.current.stageReference(file, null);
    });
    const newer = {
      success: true,
      data: {
        ...uploaded.data,
        storagePath: "users/creator/previews/images/new.png",
        viewUrl: "https://media.example/new",
      },
    };
    wire.upload.mockResolvedValueOnce(newer);
    await act(async () => {
      await hook.result.current.stageReference(file, null);
    });
    await act(async () => {
      older.resolve(uploaded);
      await oldRun!;
    });
    expect(hook.result.current.pendingReference?.url).toBe(newer.data.viewUrl);
    expect(JSON.parse(localStorage.getItem(keyOf(null))!).storagePath).toBe(
      newer.data.storagePath,
    );
  });
  it("retains a failed attachment and replays the same acceptance before arming", async () => {
    const hook = setup({
      creatorId: "creator",
      sessionId: "session-1",
      words: true,
    });
    Object.assign(hook.target, {
      sessionId: "session-1",
      promptVersionId: "v1",
    });
    await act(async () => {
      await hook.result.current.stageReference(file, "session-1");
    });
    wire.admit.mockResolvedValueOnce({
      success: true,
      data: {
        ...attached.data,
        generationId: undefined,
        attachment: { ...attached.data.attachment, state: "failed" },
      },
    });
    await act(async () => {
      await hook.result.current.admitReference();
    });
    expect(hook.result.current.pendingReference).not.toBeNull();
    expect(hook.setStartFrame).not.toHaveBeenCalled();
    const first = wire.admit.mock.calls[0]![0];
    expect(hook.result.current.pendingReference?.attachmentFailed).toBe(true);
    hook.context.words = false;
    hook.target.promptVersionId = "v2";
    hook.rerender();
    await act(async () => {
      await hook.result.current.admitReference();
    });
    expect(wire.admit.mock.calls[1]![0]).toEqual(first);
    expect(hook.setStartFrame).toHaveBeenCalledWith(
      expect.objectContaining({ generationId: "take-1" }),
    );
  });
  it("waits for the selected words-version write before minting a new acceptance or dispatching it", async () => {
    const hook = setup({
      creatorId: "creator",
      sessionId: "session-1",
      words: true,
    });
    Object.assign(hook.target, {
      sessionId: "session-1",
      promptVersionId: "v1",
    });
    await act(async () => {
      await hook.result.current.stageReference(file, "session-1");
    });
    const ready = deferred<void>();
    hook.waitForVersionPersistence.mockReturnValueOnce(ready.promise);
    let admission: Promise<void>;
    act(() => {
      admission = hook.result.current.admitReference();
    });
    expect(hook.waitForVersionPersistence).toHaveBeenCalledWith(
      "session-1",
      "v1",
    );
    expect(wire.admit).not.toHaveBeenCalled();
    expect(wire.key).not.toHaveBeenCalled();
    hook.target.promptVersionId = "v2";
    hook.context.words = false;
    await act(async () => {
      ready.resolve();
      await admission!;
    });
    expect(wire.admit).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: {
          sessionId: "session-1",
          promptVersionId: "v1",
          admissionKey: "admission-1",
        },
      }),
    );
  });
  it("failed words persistence leaves fresh reference input pending without an admission attempt", async () => {
    const hook = setup({
      creatorId: "creator",
      sessionId: "session-1",
      words: true,
    });
    Object.assign(hook.target, {
      sessionId: "session-1",
      promptVersionId: "v1",
    });
    await act(async () => {
      await hook.result.current.stageReference(file, "session-1");
    });
    hook.waitForVersionPersistence.mockRejectedValueOnce(
      new Error("Words could not be saved"),
    );
    await act(async () => {
      await hook.result.current.admitReference();
    });
    expect(wire.admit).not.toHaveBeenCalled();
    expect(wire.key).not.toHaveBeenCalled();
    expect(hook.result.current.pendingReference?.attempted).toBe(false);
    expect(hook.onError).toHaveBeenCalledWith("Words could not be saved");
  });
  it.each(["session", "creator", "selection"])(
    "cancels a new association after %s changes while its words write is deferred",
    async (change) => {
      const hook = setup({
        creatorId: "creator",
        sessionId: "session-1",
        words: true,
      });
      Object.assign(hook.target, {
        sessionId: "session-1",
        promptVersionId: "v1",
      });
      await act(async () => {
        await hook.result.current.stageReference(file, "session-1");
      });
      const ready = deferred<void>();
      hook.waitForVersionPersistence.mockReturnValueOnce(ready.promise);
      let admission: Promise<void>;
      act(() => {
        admission = hook.result.current.admitReference();
      });
      if (change === "session") hook.context.sessionId = "session-2";
      else if (change === "creator") hook.context.creatorId = "other";
      else
        act(() => {
          const selection = hook.result.current.beginReferenceSelection();
          selection.finish();
        });
      hook.rerender();
      await act(async () => {
        ready.resolve();
        await admission!;
      });
      expect(wire.admit).not.toHaveBeenCalled();
      expect(wire.key).not.toHaveBeenCalled();
    },
  );
  it("missing version remains pending rather than taking an anonymous or new-session path", async () => {
    const hook = setup({
      creatorId: "creator",
      sessionId: "session-1",
      words: true,
    });
    hook.target.sessionId = "session-1";
    await act(async () => {
      await hook.result.current.stageReference(file, "session-1");
      await hook.result.current.admitReference();
    });
    expect(wire.admit).not.toHaveBeenCalled();
    expect(hook.result.current.pendingReference).not.toBeNull();
    expect(hook.setStartFrame).not.toHaveBeenCalled();
  });
  it("a failed use retains the immutable original destination and key across retry and reload", async () => {
    const hook = setup({
      creatorId: "creator",
      sessionId: "session-1",
      words: true,
    });
    Object.assign(hook.target, {
      sessionId: "session-1",
      promptVersionId: "v1",
    });
    await act(async () => {
      await hook.result.current.stageReference(file, "session-1");
    });
    wire.admit.mockRejectedValueOnce(new Error("Disconnected"));
    await act(async () => {
      await hook.result.current.admitReference();
    });
    const first = wire.admit.mock.calls[0]![0];
    hook.unmount();
    const reload = setup({
      creatorId: "creator",
      sessionId: "session-1",
      words: true,
    });
    Object.assign(reload.target, {
      sessionId: "session-1",
      promptVersionId: "v2",
    });
    await waitFor(() =>
      expect(reload.result.current.pendingReference).not.toBeNull(),
    );
    await act(async () => {
      await reload.result.current.admitReference();
    });
    expect(wire.admit.mock.calls[1]![0]).toEqual(first);
    expect(reload.resolvePersistenceTarget).not.toHaveBeenCalled();
    expect(reload.waitForVersionPersistence).not.toHaveBeenCalled();
  });
  it("navigation and account changes hide the reference; returning restores it without retargeting", async () => {
    const hook = setup({
      creatorId: "creator",
      sessionId: "session-1",
      words: true,
    });
    await act(async () => {
      await hook.result.current.stageReference(file, "session-1");
    });
    hook.context.sessionId = "session-2";
    hook.rerender();
    expect(hook.result.current.pendingReference).toBeNull();
    await act(async () => {
      await hook.result.current.admitReference();
    });
    expect(wire.admit).not.toHaveBeenCalled();
    hook.context.creatorId = "other";
    hook.context.sessionId = "session-1";
    hook.rerender();
    expect(hook.result.current.pendingReference).toBeNull();
    hook.context.creatorId = "creator";
    hook.rerender();
    await waitFor(() =>
      expect(hook.result.current.pendingReference).not.toBeNull(),
    );
    expect(hook.setStartFrame).not.toHaveBeenCalled();
  });
  it("a late promotion cannot arm a frame after navigation", async () => {
    const hook = setup({
      creatorId: "creator",
      sessionId: "session-1",
      words: true,
    });
    Object.assign(hook.target, {
      sessionId: "session-1",
      promptVersionId: "v1",
    });
    await act(async () => {
      await hook.result.current.stageReference(file, "session-1");
    });
    const pending = deferred<typeof attached>();
    wire.admit.mockReturnValueOnce(pending.promise);
    let run: Promise<void>;
    act(() => {
      run = hook.result.current.admitReference();
    });
    hook.context.sessionId = "session-2";
    hook.rerender();
    await act(async () => {
      pending.resolve(attached);
      await run!;
    });
    expect(hook.setStartFrame).not.toHaveBeenCalled();
    expect(localStorage.getItem(keyOf("session-1"))).not.toBeNull();
  });
  it("a late upload saves to its originating session without appearing in another creator's workspace", async () => {
    const hook = setup({
      creatorId: "creator",
      sessionId: "session-1",
      words: false,
    });
    const pending = deferred<typeof uploaded>();
    wire.upload.mockReturnValueOnce(pending.promise);
    let run: Promise<void>;
    act(() => {
      run = hook.result.current.stageReference(file, "session-1");
    });
    hook.context.creatorId = "other";
    hook.rerender();
    await act(async () => {
      pending.resolve(uploaded);
      await run!;
    });
    expect(hook.result.current.pendingReference).toBeNull();
    expect(localStorage.getItem(keyOf("session-1"))).not.toBeNull();
    expect(localStorage.getItem(keyOf("session-1", "other"))).toBeNull();
  });
  it("storage failure leaves the valid reference usable in memory", async () => {
    const hook = setup();
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    await act(async () => {
      await hook.result.current.stageReference(file, null);
    });
    expect(hook.result.current.pendingReference?.url).toBe(
      uploaded.data.viewUrl,
    );
    expect(hook.onError).toHaveBeenCalledWith(
      expect.stringContaining("recovery"),
    );
    hook.context.sessionId = "session-1";
    act(() => {
      hook.result.current.bindDraftToSession();
    });
    hook.rerender();
    await waitFor(() =>
      expect(hook.result.current.pendingReference).not.toBeNull(),
    );
  });
});
