import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { MediaVersionSchema, type MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { ProjectAreaMaskSchema, type ProjectAreaMask } from "@shared/schemas/workflow/sketch.schemas";
import type { MediaVersionIndex } from "@services/media-history/MediaVersionIndex";
import type { ProjectStore } from "@services/projects/ProjectStore";
import { ProjectSketchService } from "../ProjectSketchService";
import type { ProjectSketchStorage } from "../ProjectSketchStorage";
import { verifyAreaMask } from "../areaMask";

const source = (width = 40, height = 30): MediaVersion => MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_source", ownerId: "owner", projectId: "project_one", kind: "image", label: "Desk", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "unknown", assetId: "source", storagePath: "users/owner/source.png" }, metadata: { state: "verified", width, height, durationSeconds: 0, audio: "absent", probeVersion: "test" }, association: "linked", createdAt: "2026-10-23T00:00:00.000Z" });
async function png(width: number, height: number, painted: boolean, alpha = true): Promise<string> {
  const base = sharp({ create: { width, height, channels: alpha ? 4 : 3, background: alpha ? { r: 0, g: 0, b: 0, alpha: 0 } : "white" } });
  const dot = await sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 184, g: 160, b: 255, alpha: 1 } } }).png().toBuffer();
  const bytes = await (painted ? base.composite([{ input: dot, left: 2, top: 2 }]) : base).png().toBuffer();
  return `data:image/png;base64,${bytes.toString("base64")}`;
}
const command = async (overrides: Partial<{ width: number; height: number; dataUri: string }> = {}): Promise<ProjectAreaMask> => ProjectAreaMaskSchema.parse({ versionId: "version_source", width: 40, height: 30, transform: "identity", dataUri: await png(40, 30, true), ...overrides });

describe("painted area verification", () => {
  it("accepts a painted PNG at the exact source geometry", async () => {
    expect(await verifyAreaMask(await command(), source())).toMatchObject({ width: 40, height: 30, mime: "image/png" });
  });

  it("rejects an area whose geometry does not match its picture, never resizing it onto other pixels", async () => {
    // Declared at another size than the stored picture.
    await expect(verifyAreaMask(await command({ width: 80, height: 60, dataUri: await png(80, 60, true) }), source())).rejects.toMatchObject({ code: "invalid_settings", message: expect.stringMatching(/different picture or size/) });
    // Declared at the picture's size, but the bytes are another size.
    await expect(verifyAreaMask(await command({ dataUri: await png(41, 30, true) }), source())).rejects.toMatchObject({ code: "invalid_settings" });
    // The picture was replaced by a version of another size.
    await expect(verifyAreaMask(await command(), source(41, 30))).rejects.toMatchObject({ code: "invalid_settings" });
  });

  it("rejects a mask that would become a whole-picture edit, and a missing picture", async () => {
    await expect(verifyAreaMask(await command({ dataUri: await png(40, 30, false) }), source())).rejects.toMatchObject({ code: "invalid_settings", message: "Paint an area on the picture first." });
    await expect(verifyAreaMask(await command({ dataUri: await png(40, 30, false, false) }), source())).rejects.toMatchObject({ code: "invalid_settings" });
    await expect(verifyAreaMask(await command(), undefined)).rejects.toMatchObject({ code: "input_unavailable" });
    await expect(verifyAreaMask(await command(), MediaVersionSchema.parse({ ...source(), association: "recovery" }))).rejects.toMatchObject({ code: "input_unavailable" });
  });
});

describe("ProjectSketchService.acceptAreaMask", () => {
  const setup = (picture: MediaVersion | undefined) => {
    const project = { id: "project_one", ownerId: "owner", status: "active", origin: { kind: "new" } };
    const publishInTransaction = vi.fn(async (_transaction: Transaction, _project: unknown, candidate: Record<string, unknown>) => MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", association: "linked", ...candidate }));
    const media = { get: vi.fn(async () => picture), publishInTransaction } as unknown as Pick<MediaVersionIndex, "get" | "publishInTransaction">;
    const put = vi.fn(async (path: string, verified: { sha256: string; bytes: Buffer }) => ({ identity: "verified" as const, assetId: path.split("/").at(-1) ?? "", storagePath: path, generation: "1", sha256: verified.sha256, bytes: verified.bytes.length }));
    const projects = { get: vi.fn(), readOwned: vi.fn(async () => project) } as unknown as Pick<ProjectStore, "get" | "readOwned">;
    const database = { runTransaction: async (run: (transaction: Transaction) => Promise<unknown>) => run({} as Transaction), collection: vi.fn() } as unknown as Pick<Firestore, "collection" | "runTransaction">;
    return { service: new ProjectSketchService(database, projects, { put } as unknown as ProjectSketchStorage, media), put, publishInTransaction, media };
  };

  it("stores the area as a hidden media version tied to its exact picture", async () => {
    const { service, put } = setup(source());
    const version = await service.acceptAreaMask("owner", "project_one", await command());
    expect(version).toMatchObject({ kind: "image", hidden: true, origin: { kind: "area-mask", versionId: "version_source" }, sourceInputs: [], metadata: { width: 40, height: 30 } });
    expect(version.id).toMatch(/^version_mask_[a-f0-9]{40}$/);
    expect(put).toHaveBeenCalledWith(expect.stringMatching(/^users\/owner\/previews\/images\/project_one-mask-[a-f0-9]{64}\.png$/), expect.anything(), expect.any(String));
    // The same area on the same picture is the same version.
    expect((await service.acceptAreaMask("owner", "project_one", await command())).id).toBe(version.id);
  });

  it("stores nothing for an area drawn at another size", async () => {
    const { service, put, publishInTransaction } = setup(source(64, 48));
    await expect(service.acceptAreaMask("owner", "project_one", await command())).rejects.toMatchObject({ code: "invalid_settings" });
    expect(put).not.toHaveBeenCalled(); expect(publishInTransaction).not.toHaveBeenCalled();
  });

  it("reads the picture as the caller, so another account's picture is unavailable", async () => {
    const { service, media, put } = setup(undefined);
    await expect(service.acceptAreaMask("stranger", "project_one", await command())).rejects.toMatchObject({ code: "input_unavailable" });
    expect(media.get).toHaveBeenCalledWith("stranger", "project_one", "version_source");
    expect(put).not.toHaveBeenCalled();
  });
});
