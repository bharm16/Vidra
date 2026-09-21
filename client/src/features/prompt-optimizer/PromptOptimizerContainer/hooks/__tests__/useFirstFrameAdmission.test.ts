import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KeyframeTile } from "@/features/generation-controls/types";
import type { PersistenceTarget } from "@/features/idea-box";
import { useFirstFrameAdmission } from "../useFirstFrameAdmission";

/**
 * Issue #86 / ADR-0022 decision 1 — the client half of first-frame admission.
 *
 * Two things must be true on this side, and both were false before:
 *
 *  - Inside a session, the upload names its destination (session,
 *    words-version, admission key) and the ARMED frame carries the take
 *    identity the server assigned. That identity is what `useGenerationActions`
 *    threads as `sourceGenerationId`, so a clip animated from an uploaded frame
 *    names it as its ancestor instead of hanging from a guess.
 *  - Outside a session nothing is admitted. An upload with no destination is a
 *    reference image, and that path is untouched.
 *
 * Issue #129 adds the attempt discipline on top: one immutable attempt — file
 * fingerprint, destination session, words-version, key — built before the
 * request, so retries replay the SAME acceptance, and late responses are
 * judged against the session the creator is actually looking at.
 *
 * Seam: the feature's `api/` module, which is the client's wire boundary — the
 * jsdom exception CLAUDE.md names. Nothing internal is mocked.
 */

interface UploadOptions {
  source?: string;
  admit?: {
    sessionId: string;
    promptVersionId: string;
    admissionKey: string;
  };
}

const uploadPreviewImage =
  vi.fn<
    (
      file: File,
      metadata: Record<string, unknown>,
      options: UploadOptions,
    ) => Promise<unknown>
  >();
const validatePreviewImageFile =
  vi.fn<(file: File) => { valid: true } | { valid: false; error: string }>();
const createAdmissionKey = vi.fn<() => string>();
const retryPictureAttachment = vi.fn<(attachment: unknown) => Promise<void>>();

// The factory is hoisted above these declarations, so it must reach them at
// CALL time rather than closing over them at definition time.
vi.mock("@/features/preview/api/previewApi", () => ({
  uploadPreviewImage: (
    file: File,
    metadata: Record<string, unknown>,
    options: UploadOptions,
  ) => uploadPreviewImage(file, metadata, options),
  validatePreviewImageFile: (file: File) => validatePreviewImageFile(file),
  createAdmissionKey: () => createAdmissionKey(),
}));

// The other wire boundary this hook now reaches: the shared attachment-retry
// contract (ADR-0022 decision 6, issue #133).
vi.mock("@/features/generations/api/takeAttachment", () => ({
  retryPictureAttachment: (attachment: unknown) =>
    retryPictureAttachment(attachment),
}));

const FILE = new File(["bytes"], "frame.png", { type: "image/png" });

/** The admission key the Nth call to the api module carried. */
const admissionKeyOfCall = (index: number): string | undefined =>
  uploadPreviewImage.mock.calls[index]?.[2]?.admit?.admissionKey;

/** The destination session the Nth call to the api module named. */
const admittedSessionOfCall = (index: number): string | undefined =>
  uploadPreviewImage.mock.calls[index]?.[2]?.admit?.sessionId;

const admittedResponse = {
  success: true as const,
  data: {
    imageUrl: "https://storage.example.com/asset-1",
    viewUrl: "https://storage.example.com/asset-1",
    storagePath: "image-previews/user-1/asset-1",
    assetId: "asset-1",
    generationId: "gen-upload-1",
    promptVersionId: "v1",
    attachment: {
      state: "attached",
      generationId: "gen-upload-1",
      sessionId: "session-1",
      promptVersionId: "v1",
    },
  },
};

interface SetupParams {
  target: PersistenceTarget;
  activeSessionId?: string | null;
}

function setup({ target, activeSessionId = "session-1" }: SetupParams) {
  const setStartFrame = vi.fn<(tile: KeyframeTile) => void>();
  const uploadOutsideSession = vi.fn(async () => ({
    url: "https://storage.example.com/legacy.png",
    storagePath: "generations/user-1/legacy.png",
  }));
  const onError = vi.fn();
  const onInvalidFile = vi.fn();
  const resolvePersistenceTarget = vi.fn(() => target);
  const getActiveSessionId = vi.fn(() => activeSessionId);

  const hook = renderHook(
    (params: {
      resolvePersistenceTarget: () => PersistenceTarget;
      getActiveSessionId: () => string | null;
    }) =>
      useFirstFrameAdmission({
        resolvePersistenceTarget: params.resolvePersistenceTarget,
        getActiveSessionId: params.getActiveSessionId,
        setStartFrame,
        uploadOutsideSession,
        onError,
        onInvalidFile,
      }),
    {
      initialProps: {
        resolvePersistenceTarget,
        getActiveSessionId,
      },
    },
  );

  const rerenderWith = (next: {
    target?: PersistenceTarget;
    activeSessionId?: string | null;
  }): void => {
    hook.rerender({
      resolvePersistenceTarget:
        next.target === undefined
          ? resolvePersistenceTarget
          : vi.fn(() => next.target),
      getActiveSessionId:
        next.activeSessionId === undefined
          ? getActiveSessionId
          : vi.fn(() => next.activeSessionId),
    });
  };

  return {
    hook: { ...hook, rerenderWith },
    rerenderWith,
    setStartFrame,
    uploadOutsideSession,
    onError,
    onInvalidFile,
    resolvePersistenceTarget,
  };
}

  // ADR-0022 decision 6 / issue #133 — a made-but-not-saved upload. The server
// returns 2xx with `attachment.state === "failed"`: the picture is durable,
  // its session row is owed. The old hook cleared its key and armed the frame as
  // if nothing were wrong; now it surfaces the take so the frame stage can say
  // so, with a retry, and it never arms an identity for a node that is not there.
  /**
 * ADR-0022 decision 6 / issue #133 — a made-but-not-saved upload. The server
 * returns 2xx with `attachment.state === "failed"`: the picture is durable, its
 * session row is owed — and both describes below need that response.
 */
const failedUploadResponse = {
    success: true as const,
    data: {
      imageUrl: "https://storage.example.com/asset-1",
      viewUrl: "https://storage.example.com/asset-1",
      assetId: "asset-1",
      attachment: {
        state: "failed" as const,
        generationId: "gen-upload-1",
        sessionId: "session-1",
        promptVersionId: "v1",
        reason: "firestore unavailable",
        record: { id: "gen-upload-1", mediaType: "image", status: "completed" },
      },
    },
  };

describe("useFirstFrameAdmission (issue #86)", () => {
  beforeEach(() => {
    // `mockReset`, not `mockClear`: a `…Once` queue left unconsumed by one test
    // otherwise answers the next one's first call.
    uploadPreviewImage.mockReset();
    validatePreviewImageFile.mockReset();
    createAdmissionKey.mockReset();
    retryPictureAttachment.mockReset();
    retryPictureAttachment.mockResolvedValue(undefined);
    validatePreviewImageFile.mockReturnValue({ valid: true } as const);
    let keySeq = 0;
    createAdmissionKey.mockImplementation(() => {
      keySeq += 1;
      return `admission-key-${keySeq}`;
    });
  });

  it("admits the upload into the resolved session and words-version", async () => {
    uploadPreviewImage.mockResolvedValue(admittedResponse);
    const { hook, uploadOutsideSession } = setup({
      target: { sessionId: "session-1", promptVersionId: "v1" },
    });

    await act(async () => {
      await hook.result.current.uploadFirstFrame(FILE);
    });

    expect(uploadOutsideSession).not.toHaveBeenCalled();
    expect(uploadPreviewImage).toHaveBeenCalledTimes(1);
    const [file, metadata, options] = uploadPreviewImage.mock.calls[0]!;
    expect(file).toBe(FILE);
    expect(metadata).toEqual({});
    expect(options.admit).toEqual({
      sessionId: "session-1",
      promptVersionId: "v1",
      admissionKey: "admission-key-1",
    });
  });

  it("arms the frame with the server-assigned take identity, so a clip can name it as ancestor", async () => {
    uploadPreviewImage.mockResolvedValue(admittedResponse);
    const { hook, setStartFrame } = setup({
      target: { sessionId: "session-1", promptVersionId: "v1" },
    });

    await act(async () => {
      await hook.result.current.uploadFirstFrame(FILE);
    });

    expect(setStartFrame).toHaveBeenCalledTimes(1);
    expect(setStartFrame.mock.calls[0]![0]).toMatchObject({
      url: "https://storage.example.com/asset-1",
      source: "upload",
      storagePath: "image-previews/user-1/asset-1",
      assetId: "asset-1",
      // The whole point: this is what rides through as sourceGenerationId.
      generationId: "gen-upload-1",
    });
  });

  it("surfaces made-but-not-saved and does not present the take as attached", async () => {
    uploadPreviewImage.mockResolvedValue(failedUploadResponse);
    const { hook, setStartFrame } = setup({
      target: { sessionId: "session-1", promptVersionId: "v1" },
    });

    await act(async () => {
      await hook.result.current.uploadFirstFrame(FILE);
    });

    // The picture is on screen; the session does not have it. Naming it as a
    // clip's ancestor would persist an edge to a take that is not there.
    expect(setStartFrame.mock.calls[0]![0]).not.toHaveProperty("generationId");
    // The made-but-not-saved take is exposed so the frame stage can offer a
    // retry — not silently swallowed as the old hook did.
    expect(hook.result.current.unattachedTake).toMatchObject({
      state: "failed",
      generationId: "gen-upload-1",
    });
  });

  it("retry re-attaches the SAME take and clears the made-but-not-saved state", async () => {
    uploadPreviewImage.mockResolvedValue(failedUploadResponse);
    const { hook } = setup({
      target: { sessionId: "session-1", promptVersionId: "v1" },
    });

    await act(async () => {
      await hook.result.current.uploadFirstFrame(FILE);
    });
    expect(hook.result.current.unattachedTake).not.toBeNull();

    await act(async () => {
      await hook.result.current.retryAttachment();
    });

    // The retry re-sends the SAME take's record — never a re-upload.
    expect(retryPictureAttachment).toHaveBeenCalledTimes(1);
    expect(retryPictureAttachment.mock.calls[0]![0]).toMatchObject({
      generationId: "gen-upload-1",
      record: { id: "gen-upload-1" },
    });
    // Settled — the made-but-not-saved surface goes away.
    expect(hook.result.current.unattachedTake).toBeNull();
  });

  it("keeps the admission key after a failed attachment, so re-picking re-admits the same take", async () => {
    uploadPreviewImage.mockResolvedValue(failedUploadResponse);
    const { hook } = setup({
      target: { sessionId: "session-1", promptVersionId: "v1" },
    });

    await act(async () => {
      await hook.result.current.uploadFirstFrame(FILE);
    });
    await act(async () => {
      await hook.result.current.uploadFirstFrame(FILE);
    });

    // A failed attachment is not a settled admission: the second attempt on the
    // same file reuses the retained key rather than minting a fresh one.
    expect(admissionKeyOfCall(1)).toBe("admission-key-1");
  });

  it("reuses the admission key after a failure, so a retry re-admits the same take", async () => {
    uploadPreviewImage
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(admittedResponse);
    const { hook, onError } = setup({
      target: { sessionId: "session-1", promptVersionId: "v1" },
    });

    await act(async () => {
      await hook.result.current.uploadFirstFrame(FILE);
    });
    expect(onError).toHaveBeenCalledWith("network");

    await act(async () => {
      await hook.result.current.uploadFirstFrame(FILE);
    });

    expect(admissionKeyOfCall(1)).toBe("admission-key-1");
  });

  it("mints a fresh key for a DIFFERENT file after a failure, so a new selection is a new acceptance", async () => {
    uploadPreviewImage
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(admittedResponse);
    const { hook, onError } = setup({
      target: { sessionId: "session-1", promptVersionId: "v1" },
    });

    await act(async () => {
      await hook.result.current.uploadFirstFrame(FILE);
    });
    expect(onError).toHaveBeenCalledWith("network");

    // The creator picks a DIFFERENT file and retries. It must not reuse the
    // key retained for the first file — the server (issue #114) fingerprints
    // the bytes and would reject the reused key as a conflict. A new selection
    // is a new acceptance.
    const OTHER = new File(["a-different-picture"], "other.png", {
      type: "image/png",
    });
    await act(async () => {
      await hook.result.current.uploadFirstFrame(OTHER);
    });

    expect(admissionKeyOfCall(0)).toBe("admission-key-1");
    expect(admissionKeyOfCall(1)).toBe("admission-key-2");
  });

  it("mints a fresh key for the next upload once an admission settles", async () => {
    uploadPreviewImage.mockResolvedValue(admittedResponse);
    const { hook } = setup({
      target: { sessionId: "session-1", promptVersionId: "v1" },
    });

    await act(async () => {
      await hook.result.current.uploadFirstFrame(FILE);
    });
    await act(async () => {
      await hook.result.current.uploadFirstFrame(FILE);
    });

    // A second, deliberate upload is a second admission — not a replay of the
    // first one.
    expect(admissionKeyOfCall(1)).toBe("admission-key-2");
  });

  it("falls back to the plain upload when no session or words-version resolves", async () => {
    const { hook, setStartFrame, uploadOutsideSession } = setup({ target: {} });

    await act(async () => {
      await hook.result.current.uploadFirstFrame(FILE);
    });

    expect(uploadPreviewImage).not.toHaveBeenCalled();
    expect(uploadOutsideSession).toHaveBeenCalledWith(FILE);
    // Armed, but anonymous: there is no session for it to be a take in.
    expect(setStartFrame.mock.calls[0]![0]).toMatchObject({
      url: "https://storage.example.com/legacy.png",
      source: "upload",
    });
    expect(setStartFrame.mock.calls[0]![0]).not.toHaveProperty("generationId");
  });

  it("does not admit a session-bound upload whose file is rejected", async () => {
    validatePreviewImageFile.mockReturnValue({
      valid: false,
      error: "Only PNG, JPEG, and WebP files are supported.",
    } as never);
    const { hook, onInvalidFile } = setup({
      target: { sessionId: "session-1", promptVersionId: "v1" },
    });

    await act(async () => {
      await hook.result.current.uploadFirstFrame(FILE);
    });

    expect(onInvalidFile).toHaveBeenCalledWith(
      "Only PNG, JPEG, and WebP files are supported.",
    );
    expect(uploadPreviewImage).not.toHaveBeenCalled();
  });
});

/**
 * Issue #129 — the attempt discipline. The attempt is one immutable object
 * (file fingerprint, destination session, words-version, key); responses are
 * judged against the session the creator is looking at when they land, never
 * applied to whatever the workspace has become.
 */
describe("useFirstFrameAdmission (issue #129)", () => {
  /** A deferred the test settles by hand, so responses can land late. */
  function deferredResponse(): {
    promise: Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  } {
    let resolve!: (value: unknown) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<unknown>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    // A reject() that lands before the hook's own await has subscribed would
    // be reported as an unhandled rejection; this side observer keeps the
    // deferred silent while the hook still receives the rejection through its
    // own await.
    promise.catch(() => {});
    return { promise, resolve, reject };
  }

  beforeEach(() => {
    uploadPreviewImage.mockReset();
    validatePreviewImageFile.mockReset();
    createAdmissionKey.mockReset();
    retryPictureAttachment.mockReset();
    retryPictureAttachment.mockResolvedValue(undefined);
    validatePreviewImageFile.mockReturnValue({ valid: true } as const);
    let keySeq = 0;
    createAdmissionKey.mockImplementation(() => {
      keySeq += 1;
      return `admission-key-${keySeq}`;
    });
  });

  afterEach(() => {
    // The unreadable-file test below stubs a global; never let it leak.
    vi.unstubAllGlobals();
  });

  it("does not apply a response that lands after the creator switched sessions", async () => {
    const deferred = deferredResponse();
    uploadPreviewImage.mockReturnValue(deferred.promise);
    const { hook, setStartFrame, rerenderWith } = setup({
      target: { sessionId: "session-1", promptVersionId: "v1" },
    });

    let pending!: Promise<void>;
    // The request goes out under session-1…
    await act(async () => {
      pending = hook.result.current.uploadFirstFrame(FILE);
    });
    // …the navigation to session-2 commits…
    act(() => {
      rerenderWith({ activeSessionId: "session-2" });
    });
    // …and THEN the response lands.
    await act(async () => {
      deferred.resolve(admittedResponse);
      await pending;
    });

    // The take was admitted into session-1, but the creator is looking at
    // session-2: the frame must not appear here.
    expect(setStartFrame).not.toHaveBeenCalled();
    expect(hook.result.current.unattachedTake).toBeNull();
  });

  it("reconciles the stashed response when the creator returns to the attempt's session", async () => {
    const deferred = deferredResponse();
    uploadPreviewImage.mockReturnValue(deferred.promise);
    const { hook, setStartFrame, rerenderWith } = setup({
      target: { sessionId: "session-1", promptVersionId: "v1" },
    });

    let pending!: Promise<void>;
    await act(async () => {
      pending = hook.result.current.uploadFirstFrame(FILE);
    });
    act(() => {
      rerenderWith({ activeSessionId: "session-2" });
    });
    await act(async () => {
      deferred.resolve(admittedResponse);
      await pending;
    });

    // Not applied to session-2…
    expect(setStartFrame).not.toHaveBeenCalled();

    // …but applied the moment the creator is back where it was admitted.
    act(() => {
      rerenderWith({ activeSessionId: "session-1" });
    });

    expect(setStartFrame).toHaveBeenCalledTimes(1);
    expect(setStartFrame.mock.calls[0]![0]).toMatchObject({
      url: "https://storage.example.com/asset-1",
      generationId: "gen-upload-1",
    });
  });

  it("reconciles a made-but-not-saved take on return, surfacing the retry", async () => {
    const deferred = deferredResponse();
    uploadPreviewImage.mockReturnValue(deferred.promise);
    const { hook, rerenderWith } = setup({
      target: { sessionId: "session-1", promptVersionId: "v1" },
    });

    let pending!: Promise<void>;
    await act(async () => {
      pending = hook.result.current.uploadFirstFrame(FILE);
    });
    act(() => {
      rerenderWith({ activeSessionId: "session-2" });
    });
    await act(async () => {
      deferred.resolve(failedUploadResponse);
      await pending;
    });
    // The failed attachment is session-1's debt; session-2 shows nothing.
    expect(hook.result.current.unattachedTake).toBeNull();

    act(() => {
      rerenderWith({ activeSessionId: "session-1" });
    });

    expect(hook.result.current.unattachedTake).toMatchObject({
      state: "failed",
      generationId: "gen-upload-1",
    });
  });

  it("never retargets a retained attempt: a retry of the same file goes to the session it started under", async () => {
    uploadPreviewImage
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(admittedResponse);
    const { hook, onError, rerenderWith } = setup({
      target: { sessionId: "session-1", promptVersionId: "v1" },
    });

    await act(async () => {
      await hook.result.current.uploadFirstFrame(FILE);
    });
    expect(onError).toHaveBeenCalledWith("network");

    // The creator has moved to session-2 and picks the SAME file. The retained
    // attempt is not re-resolved: sending its key to a new destination would
    // only earn the server's conflict (issue #114), and a response would land
    // in a session the file never pointed at.
    act(() => {
      rerenderWith({
        target: { sessionId: "session-2", promptVersionId: "v2" },
        activeSessionId: "session-2",
      });
    });
    await act(async () => {
      await hook.result.current.uploadFirstFrame(FILE);
    });

    expect(admissionKeyOfCall(1)).toBe("admission-key-1");
    expect(admittedSessionOfCall(1)).toBe("session-1");
  });

  it("produces a new attempt for a different file that metadata cannot tell apart", async () => {
    // Same name, same size, same timestamp: the old metadata signature saw one
    // file here and would replay the retained key. The bytes are the fingerprint
    // now (issue #129) — the same fact the server hashes into its acceptance
    // identity (issue #114). The hash is pure JS on purpose: a CI run (Node 20)
    // caught subtle.digest rejecting jsdom's cross-realm ArrayBuffer, which
    // silently downgraded every fingerprint to metadata.
    const TWIN_A = new File(["aaaaaaaaaa"], "twin.png", {
      type: "image/png",
      lastModified: 12345,
    });
    const TWIN_B = new File(["bbbbbbbbbb"], "twin.png", {
      type: "image/png",
      lastModified: 12345,
    });
    uploadPreviewImage
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(admittedResponse);
    const { hook, onError } = setup({
      target: { sessionId: "session-1", promptVersionId: "v1" },
    });

    await act(async () => {
      await hook.result.current.uploadFirstFrame(TWIN_A);
    });
    expect(onError).toHaveBeenCalledWith("network");

    await act(async () => {
      await hook.result.current.uploadFirstFrame(TWIN_B);
    });

    // A new attempt, not a replay of the failed one.
    expect(admissionKeyOfCall(0)).toBe("admission-key-1");
    expect(admissionKeyOfCall(1)).toBe("admission-key-2");
  });

  it("still retries the same file when its bytes cannot be read, on the metadata fallback", async () => {
    // The documented last resort: a file that cannot be read at all falls back
    // to the metadata signature, so a retry of the SAME file is still
    // recognised. A metadata-identical DIFFERENT file could then reuse the
    // retained key — which the server refuses as a #114 conflict rather than
    // replaying or duplicating anything.
    class BrokenFileReader {
      onerror: ((event: unknown) => void) | null = null;
      onload: ((event: unknown) => void) | null = null;
      result: ArrayBuffer | null = null;
      error: Error | null = null;
      readAsArrayBuffer(): void {
        this.error = new Error("unreadable");
        this.onerror?.(this.error);
      }
    }
    vi.stubGlobal("FileReader", BrokenFileReader);

    const UNREADABLE = new File(["aaaa"], "unreadable.png", {
      type: "image/png",
      lastModified: 12345,
    });
    uploadPreviewImage
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(admittedResponse);
    const { hook, onError } = setup({
      target: { sessionId: "session-1", promptVersionId: "v1" },
    });

    await act(async () => {
      await hook.result.current.uploadFirstFrame(UNREADABLE);
    });
    expect(onError).toHaveBeenCalledWith("network");

    // Re-picking the SAME (unreadable) file is still a retry, not a new
    // acceptance: the fallback fingerprint is stable within an environment.
    await act(async () => {
      await hook.result.current.uploadFirstFrame(UNREADABLE);
    });

    expect(admissionKeyOfCall(0)).toBe("admission-key-1");
    expect(admissionKeyOfCall(1)).toBe("admission-key-1");
  });

  it("drops a late failure after a session switch instead of toasting into the new session", async () => {
    const deferred = deferredResponse();
    uploadPreviewImage.mockReturnValue(deferred.promise);
    const { hook, onError, rerenderWith } = setup({
      target: { sessionId: "session-1", promptVersionId: "v1" },
    });

    let pending!: Promise<void>;
    await act(async () => {
      pending = hook.result.current.uploadFirstFrame(FILE);
    });
    act(() => {
      rerenderWith({ activeSessionId: "session-2" });
    });
    await act(async () => {
      deferred.reject(new Error("network"));
      await pending;
    });

    expect(onError).not.toHaveBeenCalled();
  });

  it("drops a superseded response once a newer upload has started", async () => {
    const first = deferredResponse();
    uploadPreviewImage
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({
        ...admittedResponse,
        data: {
          ...admittedResponse.data,
          imageUrl: "https://storage.example.com/asset-2",
          viewUrl: "https://storage.example.com/asset-2",
          generationId: "gen-upload-2",
        },
      });
    const { hook, setStartFrame } = setup({
      target: { sessionId: "session-1", promptVersionId: "v1" },
    });

    await act(async () => {
      void hook.result.current.uploadFirstFrame(FILE);
      // Let the first request actually fire before the second upload starts.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    // A second, different file is a new attempt; it owns the frame surface.
    const OTHER = new File(["a-different-picture"], "other.png", {
      type: "image/png",
    });
    await act(async () => {
      await hook.result.current.uploadFirstFrame(OTHER);
    });

    // The newer attempt settled on time and armed the frame.
    expect(setStartFrame).toHaveBeenCalledTimes(1);
    expect(setStartFrame.mock.calls[0]![0]).toMatchObject({
      url: "https://storage.example.com/asset-2",
      generationId: "gen-upload-2",
    });

    // The first response lands late: it belongs to a superseded attempt, and
    // must not overwrite the frame the newer one armed.
    await act(async () => {
      first.resolve(admittedResponse);
    });

    expect(setStartFrame).toHaveBeenCalledTimes(1);
    expect(admissionKeyOfCall(0)).toBe("admission-key-1");
    expect(admissionKeyOfCall(1)).toBe("admission-key-2");
  });
});
