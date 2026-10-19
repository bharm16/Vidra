import { afterEach, beforeEach, expect, it, vi } from "vitest";

const api = { ensureLibrary: vi.fn(), beginImport: vi.fn(), finishImport: vi.fn() };
vi.mock("@/features/project-workspace/api/workflowApi", () => ({ WorkflowApi: vi.fn(() => api) }));
const transferImport = vi.fn();
vi.mock("../api/importTransfer", () => ({
  importCommand: vi.fn(async (file: File) => ({ id: "import_1", filename: file.name, bytes: file.size, contentType: file.type, sha256: "a".repeat(64) })),
  transferImport: (...args: unknown[]) => transferImport(...args),
}));

import { sendPictureToLibrary } from "../api/sendPictureToLibrary";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "Content-Type": "image/png" } })));
  api.ensureLibrary.mockResolvedValue({ id: "project_library" });
  api.finishImport.mockResolvedValue({ id: "version_1" });
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("uploads the picture into the library and opens it as a saved import", async () => {
  api.beginImport.mockResolvedValue({ record: { state: "uploading" }, offset: 0, uploadUrl: "https://upload.test/grant" });
  const destination = await sendPictureToLibrary("owner_1", "https://cdn.test/live.png", "live-req", new AbortController().signal);
  expect(api.beginImport).toHaveBeenCalledWith("project_library", expect.objectContaining({ filename: "live-req.png", contentType: "image/png" }), expect.any(AbortSignal));
  expect(transferImport).toHaveBeenCalledWith("owner_1", "https://upload.test/grant", expect.any(File), 0, expect.any(AbortSignal), expect.any(Function), "image/png");
  expect(destination).toBe("/app?view=media&savedImport=version_1");
});

it("refuses a picture the library rejects without finishing the import", async () => {
  api.beginImport.mockResolvedValue({ record: { state: "rejected", reason: "This file isn't supported." }, offset: 0 });
  await expect(sendPictureToLibrary("owner_1", "https://cdn.test/x.png", "x", new AbortController().signal)).rejects.toThrow("This file isn't supported.");
  expect(api.finishImport).not.toHaveBeenCalled();
  expect(transferImport).not.toHaveBeenCalled();
});
