import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import {
  VideoEditSchema,
  VideoExportSchema,
  type VideoExport,
} from "@shared/schemas/workflow/video-edit.schemas";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import { VideoEditor } from "../VideoEditor";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  exports: vi.fn(),
  get: vi.fn(),
  command: vi.fn(),
  preview: vi.fn(),
  revisions: vi.fn(),
  export: vi.fn(),
}));
vi.mock("../api/videoEditorApi", () => ({
  VideoEditorApi: class {
    list = api.list;
    exports = api.exports;
    get = api.get;
    command = api.command;
    preview = api.preview;
    revisions = api.revisions;
    export = api.export;
  },
}));
const version = MediaVersionSchema.parse({
  schemaVersion: "vidra-workflow/v2",
  id: "version_one",
  ownerId: "creator",
  projectId: "project_one",
  kind: "video",
  label: "Stadium v1",
  origin: { kind: "upload" },
  sourceInputs: [],
  object: {
    identity: "verified",
    assetId: "asset_one",
    storagePath: "users/creator/one.mp4",
    generation: "1",
    sha256: "a".repeat(64),
    bytes: 100,
  },
  metadata: {
    state: "verified",
    width: 1920,
    height: 1080,
    durationSeconds: 5,
    audio: "absent",
    probeVersion: "fixture/v1",
  },
  association: "linked",
  createdAt: "2026-10-17T05:00:00.000Z",
});
const edit = VideoEditSchema.parse({
  schemaVersion: "vidra-workflow/v2",
  id: "edit_one",
  ownerId: "creator",
  projectId: "project_one",
  name: "Video edit",
  revision: 1,
  composition: {
    normalizationVersion: "vidra-cfr30/v1",
    preset: "landscape",
    fps: 30,
    items: [
      {
        id: "item_one",
        versionId: "version_one",
        kind: "clip",
        inFrame: 0,
        outFrame: 90,
        displayFrames: 90,
        fit: "fit",
        sourceAudio: { muted: true, gain: 1 },
      },
    ],
    text: [],
  },
  issues: [],
  createdAt: version.createdAt,
  updatedAt: version.createdAt,
});
const props = {
  ownerId: "creator",
  projectId: "project_one",
  media: [version],
  resolveMediaAccess: async (): Promise<{ url: string }> => ({
    url: "https://owned.example/one.mp4",
  }),
  importController: {
    jobs: [],
    warning: undefined,
    choose: vi.fn(),
    retry: vi.fn(),
    cancel: vi.fn(),
    forgetRejected: vi.fn(),
  },
  onClose: vi.fn(),
  onMediaRefresh: async (): Promise<void> => undefined,
};
const job = (state: VideoExport["state"], extra: object = {}): VideoExport =>
  VideoExportSchema.parse({
    schemaVersion: "vidra-workflow/v2",
    id: "export_one",
    ownerId: edit.ownerId,
    projectId: edit.projectId,
    editId: edit.id,
    revision: 1,
    submissionId: "submission_one",
    executionDraftId: "draft_one",
    executionDraftRevision: 1,
    composition: edit.composition,
    compositionHash: "a".repeat(64),
    sources: [version],
    renderer: "native/v1",
    attemptId: "attempt_one",
    state,
    progress: 0.4,
    createdAt: edit.createdAt,
    updatedAt: edit.updatedAt,
    ...extra,
  });
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  api.list.mockResolvedValue([edit]);
  api.get.mockResolvedValue(edit);
  api.preview.mockRejectedValue(new Error("No preview in this fixture"));
});

async function openFailedExport(failed: VideoExport): Promise<HTMLElement> {
  api.exports.mockResolvedValue([job("rendering")]);
  api.export.mockResolvedValue(failed);
  render(<VideoEditor {...props} />);
  fireEvent.click(await screen.findByRole("button", { name: /^Exporting/ }));
  const panel = await screen.findByRole("region", { name: "Export panel" });
  await waitFor(() => expect(panel).toHaveAttribute("data-state", "failed"), {
    timeout: 4000,
  });
  return panel;
}

it("E09 names the unavailable clip, disables Export and opens Replace source", async () => {
  const panel = await openFailedExport(
    job("failed", {
      message: "Source version_one is unavailable.",
      failedItemId: "item_one",
      failedVersionId: "version_one",
    }),
  );
  expect(within(panel).getByText("Export failed")).toBeVisible();
  expect(within(panel).getByText("Stadium v1 is unavailable.")).toBeVisible();
  expect(
    within(panel).queryByText("Source version_one is unavailable."),
  ).toBeNull();
  expect(
    within(panel).queryByRole("button", { name: "Retry export" }),
  ).toBeNull();
  expect(screen.getByRole("button", { name: /^Export/ })).toBeDisabled();
  fireEvent.click(within(panel).getByRole("button", { name: "Replace clip" }));
  await waitFor(() =>
    expect(screen.queryByRole("region", { name: "Export panel" })).toBeNull(),
  );
  expect(screen.getByText("Replace source")).toBeVisible();
});

it("a failure that names no source keeps Retry export and an enabled Export", async () => {
  const panel = await openFailedExport(
    job("failed", { message: "The export could not complete this step." }),
  );
  expect(within(panel).getByText("Rendering failed")).toBeVisible();
  expect(
    within(panel).getByRole("button", { name: "Retry export" }),
  ).toBeEnabled();
  expect(
    within(panel).queryByRole("button", { name: "Replace clip" }),
  ).toBeNull();
  expect(screen.getByRole("button", { name: /^Export/ })).toBeEnabled();
});

it("an issue saved before versionId existed still names the clip and blocks Export", async () => {
  const legacy = VideoEditSchema.parse({
    ...edit,
    issues: [
      {
        elementId: "version_one",
        code: "source_unavailable",
        message:
          "This exact source version is unavailable or has not finished checking.",
      },
    ],
  });
  api.list.mockResolvedValue([legacy]);
  api.get.mockResolvedValue(legacy);
  api.exports.mockResolvedValue([]);
  render(<VideoEditor {...props} />);
  expect(await screen.findByText("Stadium v1 is unavailable")).toBeVisible();
  expect(screen.getByRole("button", { name: /^Export/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Replace clip" }));
  expect(screen.getByText("Replace source")).toBeVisible();
});
