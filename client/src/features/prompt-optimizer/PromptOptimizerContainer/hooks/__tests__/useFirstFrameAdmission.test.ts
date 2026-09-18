import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
 *    threads as `sourceGenerationId`, so a clip animated from an uploaded
 *    frame names it as its ancestor instead of hanging from a guess.
 *  - Outside a session nothing is admitted. An upload with no destination is a
 *    reference image, and that path is untouched.
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

const FILE = new File(["bytes"], "frame.png", { type: "image/png" });

/** The admission key the Nth call to the api module carried. */
const admissionKeyOfCall = (index: number): string | undefined =>
  uploadPreviewImage.mock.calls[index]?.[2]?.admit?.admissionKey;

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

function setup(target: PersistenceTarget) {
  const setStartFrame = vi.fn<(tile: KeyframeTile) => void>();
  const uploadOutsideSession = vi.fn(async () => ({
    url: "https://storage.example.com/legacy.png",
    storagePath: "generations/user-1/legacy.png",
  }));
  const onError = vi.fn();
  const onInvalidFile = vi.fn();

  const hook = renderHook(() =>
    useFirstFrameAdmission({
      resolvePersistenceTarget: () => target,
      setStartFrame,
      uploadOutsideSession,
      onError,
      onInvalidFile,
    }),
  );

  return { hook, setStartFrame, uploadOutsideSession, onError, onInvalidFile };
}

describe("useFirstFrameAdmission (issue #86)", () => {
  beforeEach(() => {
    // `mockReset`, not `mockClear`: a `…Once` queue left unconsumed by one test
    // otherwise answers the next one's first call.
    uploadPreviewImage.mockReset();
    validatePreviewImageFile.mockReset();
    createAdmissionKey.mockReset();
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
      sessionId: "session-1",
      promptVersionId: "v1",
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
      sessionId: "session-1",
      promptVersionId: "v1",
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

  it("arms the frame without an identity when the take was made but not saved", async () => {
    uploadPreviewImage.mockResolvedValue({
      success: true,
      data: {
        imageUrl: "https://storage.example.com/asset-1",
        viewUrl: "https://storage.example.com/asset-1",
        assetId: "asset-1",
        attachment: {
          state: "failed",
          generationId: "gen-upload-1",
          sessionId: "session-1",
          promptVersionId: "v1",
          reason: "firestore unavailable",
        },
      },
    });
    const { hook, setStartFrame } = setup({
      sessionId: "session-1",
      promptVersionId: "v1",
    });

    await act(async () => {
      await hook.result.current.uploadFirstFrame(FILE);
    });

    // The picture is on screen; the session does not have it. Naming it as a
    // clip's ancestor would persist an edge to a take that is not there.
    expect(setStartFrame.mock.calls[0]![0]).not.toHaveProperty("generationId");
  });

  it("reuses the admission key after a failure, so a retry re-admits the same take", async () => {
    uploadPreviewImage
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(admittedResponse);
    const { hook, onError } = setup({
      sessionId: "session-1",
      promptVersionId: "v1",
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

  it("mints a fresh key for the next upload once an admission settles", async () => {
    uploadPreviewImage.mockResolvedValue(admittedResponse);
    const { hook } = setup({ sessionId: "session-1", promptVersionId: "v1" });

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
    const { hook, setStartFrame, uploadOutsideSession } = setup({});

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
      sessionId: "session-1",
      promptVersionId: "v1",
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
