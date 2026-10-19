import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { ImportCommandSchema } from "@shared/schemas/workflow/import.schemas";
import { verifyImportFile } from "../ProjectMediaStorage";
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });
async function file(bytes: Buffer): Promise<string> { const directory = await mkdtemp(join(tmpdir(), "vidra-import-test-")); directories.push(directory); const path = join(directory, "misleading.png"); await writeFile(path, bytes); return path; }
function command(bytes: Buffer): ReturnType<typeof ImportCommandSchema.parse> { return ImportCommandSchema.parse({ id: "import_content", filename: "misleading.png", contentType: "image/png", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }); }
it("MEDIA-01 rejects familiar extensions with unsupported actual content", async () => { const bytes = Buffer.from("<html>This is not a picture</html>"); await expect(verifyImportFile(await file(bytes), command(bytes))).rejects.toMatchObject({ code: "invalid_settings" }); });
it("decodes verified picture geometry and rejects a fingerprint mismatch", async () => { const bytes = await sharp({ create: { width: 64, height: 36, channels: 3, background: "#123456" } }).png().toBuffer(); const path = await file(bytes); expect(await verifyImportFile(path, command(bytes))).toMatchObject({ sha256: command(bytes).sha256, bytes: bytes.length, metadata: { state: "verified", width: 64, height: 36, audio: "absent" } }); await expect(verifyImportFile(path, { ...command(bytes), sha256: "0".repeat(64) })).rejects.toMatchObject({ code: "invalid_settings" }); });
it("rejects truncated pictures even when their signature matches", async () => { const bytes = Buffer.from("89504e470d0a1a0a0000000d4948445200000040000000240802000000", "hex"); await expect(verifyImportFile(await file(bytes), command(bytes))).rejects.toMatchObject({ code: "invalid_settings" }); });

it("binds native upload grants to the declared size, browser origin and a new immutable object", async () => {
  const { GcsProjectMediaStorage } = await import("../ProjectMediaStorage");
  const createResumableUpload = vi.fn(async () => ["https://storage.googleapis.com/session"]);
  const bucket = { file: vi.fn(() => ({ createResumableUpload })) };
  const storage = new GcsProjectMediaStorage(bucket as unknown as import("@google-cloud/storage").Bucket);
  await expect(storage.start("users/creator/previews/images/test.png", "image/png", 1024, "https://vidra.app")).resolves.toContain("/session");
  expect(createResumableUpload).toHaveBeenCalledWith({ metadata: { contentType: "image/png", contentLength: 1024 }, origin: "https://vidra.app", preconditionOpts: { ifGenerationMatch: 0 } });
});
it("native cancellation acknowledges GCS 499 and refuses an unconfirmed cancellation", async () => {
  const { GcsProjectMediaStorage } = await import("../ProjectMediaStorage");
  const storage = new GcsProjectMediaStorage({} as import("@google-cloud/storage").Bucket);
  const fetch = vi.fn(async () => new Response(undefined, { status: 499 })); vi.stubGlobal("fetch", fetch);
  await expect(storage.cancelSession("https://storage.googleapis.com/session")).resolves.toBeUndefined();
  fetch.mockResolvedValueOnce(new Response(undefined, { status: 503 }));
  await expect(storage.cancelSession("https://storage.googleapis.com/session")).rejects.toMatchObject({ code: "capability_unavailable" }); vi.unstubAllGlobals();
});
it("rejects a truncated foreign container as unsupported rather than a retryable server failure", async () => { const bytes = Buffer.from("504b0304000000000000000000000000000000000000000000000000000000", "hex"); await expect(verifyImportFile(await file(bytes), command(bytes))).rejects.toMatchObject({ code: "invalid_settings" }); });
it("reads GCS 308 Resume Incomplete without following or rejecting its Location header", async () => {
 const { GcsProjectMediaStorage } = await import("../ProjectMediaStorage"); const storage = new GcsProjectMediaStorage({} as import("@google-cloud/storage").Bucket);
 const fetch = vi.fn(async () => new Response(undefined, { status: 308, headers: { Range: "bytes=0-8388607", Location: "https://storage.googleapis.com/session" } })); vi.stubGlobal("fetch", fetch);
 await expect(storage.offset("https://storage.googleapis.com/session", 9437184)).resolves.toBe(8388608); expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ redirect: "manual" })); vi.unstubAllGlobals();
});
