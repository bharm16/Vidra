/** Deterministic network/storage doubles. Application services, Firestore and FFmpeg remain real. */
import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import sharp from "sharp";
import type { NativeWorkflowExecutorDeps } from "@services/creation-requests/execution/NativeWorkflowExecutor";
import type { WorkflowOutputStorage } from "@services/creation-requests/execution/types";
import type { ProjectMediaStorage } from "@services/project-media/ProjectMediaStorage";
import { verifyImportFile } from "@services/project-media/ProjectMediaStorage";
import type { ProjectSketchStorage } from "@services/project-sketch/ProjectSketchStorage";
import type { ExportStorage } from "@services/video-export/ExportStorage";
import { parseByteRange, type WorkflowManagementStorage, type StoredFrame } from "@services/workflow-sharing/types";
import { ImportCommandSchema } from "@shared/schemas/workflow/import.schemas";
import { WorkflowError } from "@services/projects/WorkflowError";
import type { OwnedObjectSchema } from "@shared/schemas/workflow/media.schemas";
import type { z } from "zod";

interface BrowserObject { buffer: Buffer; contentType: string; generation: string; sha256: string; }
interface UploadSession { path: string; contentType: string; bytes: number; received: Buffer; cancelled: boolean; }
type VerifiedObject = Extract<z.infer<typeof OwnedObjectSchema>, { identity: "verified" }>;
const hash = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

export class BrowserBoundaries {
  readonly objects = new Map<string, BrowserObject>();
  readonly providerCalls: Array<{ kind: "image" | "video" | "text"; ownerId?: string }> = [];
  private readonly uploads = new Map<string, UploadSession>();
  private readonly videoAssets = new Map<string, string>();
  private readonly frames = new Map<string, StoredFrame>();
  private generation = 0;
  private picture!: Buffer;
  private clip!: Buffer;
  constructor(readonly origin: string) {}
  async initialize(): Promise<void> {
    this.picture = await sharp(await readFile("client/public/design-assets/public-media-stadium.png")).resize(320, 180).webp({ quality: 80 }).toBuffer();
    this.clip = await readFile("tests/e2e/cross-mode/clip.mp4");
  }
  put(path: string, bytes: Buffer, contentType: string): BrowserObject {
    const prior = this.objects.get(path);
    if (prior) { if (prior.sha256 !== hash(bytes) || prior.contentType !== contentType) throw new Error("Fixture storage does not overwrite immutable bytes"); return prior; }
    const object = { buffer: Buffer.from(bytes), contentType, generation: String(++this.generation), sha256: hash(bytes) };
    this.objects.set(path, object); return object;
  }
  private owned(ownerId: string, path: string, generation?: string): BrowserObject {
    if (!path.startsWith(`users/${ownerId}/`) || path.includes("..")) throw new WorkflowError("access_denied", "This file is unavailable.");
    const object = this.objects.get(path);
    if (!object || (generation !== undefined && object.generation !== generation)) throw new WorkflowError("input_unavailable", "This exact file is unavailable.");
    return object;
  }
  private handle(path: string): VerifiedObject {
    const object = this.objects.get(path); if (!object) throw new Error("Fixture object missing");
    return { identity: "verified", assetId: path.split("/").at(-1) ?? path, storagePath: path, generation: object.generation, sha256: object.sha256, bytes: object.buffer.length };
  }
  access = async (ownerId: string, path: string, generation?: string): Promise<{ url: string; expiresAt: string }> => { this.owned(ownerId, path, generation); return { url: `${this.origin}/__test/media?path=${encodeURIComponent(path)}${generation ? `&generation=${encodeURIComponent(generation)}` : ""}`, expiresAt: new Date(Date.now() + 60_000).toISOString() }; };
  private inspect = async (path: string, command: z.infer<typeof ImportCommandSchema>): Promise<Awaited<ReturnType<ProjectMediaStorage["inspect"]>>> => {
    const object = this.objects.get(path); if (!object) throw new WorkflowError("input_unavailable", "The uploaded bytes are unavailable.");
    const directory = await mkdtemp(join(tmpdir(), "vidra-browser-inspect-"));
    try { const target = join(directory, "source"); await writeFile(target, object.buffer); return { ...await verifyImportFile(target, command), generation: object.generation }; }
    finally { await rm(directory, { recursive: true, force: true }); }
  };
  mediaStorage: ProjectMediaStorage = {
    start: async (path, contentType, bytes) => { const token = randomUUID(); this.uploads.set(token, { path, contentType, bytes, received: Buffer.alloc(0), cancelled: false }); return `${this.origin}/__test/upload/${token}`; },
    exists: async path => this.objects.has(path),
    cancelSession: async url => { const session = this.uploads.get(new URL(url).pathname.split("/").at(-1) ?? ""); if (session) session.cancelled = true; },
    offset: async url => { const session = this.uploads.get(new URL(url).pathname.split("/").at(-1) ?? ""); return session && !session.cancelled ? session.received.length : undefined; },
    inspect: (path, command) => this.inspect(path, command),
    copy: async (source, target, generation) => { const object = this.objects.get(source); if (!object || (generation !== undefined && object.generation !== generation)) throw new WorkflowError("input_unavailable", "Source bytes unavailable."); return this.put(target, object.buffer, object.contentType).generation; },
  };
  outputStorage: WorkflowOutputStorage = { materialize: async (attempt, output) => {
    if (output.kind === "text") throw new Error("Text has no media bytes");
    const source = output.kind === "video" ? this.videoAssets.get(output.assetId) : output.storagePath;
    if (!source) throw new Error("Controlled provider bytes missing");
    const object = this.owned(attempt.ownerId, source);
    const path = `users/${attempt.ownerId}/previews/${output.kind === "image" ? "images" : "videos"}/workflow-${attempt.slotId}.${output.kind === "image" ? "webp" : "mp4"}`;
    this.put(path, object.buffer, object.contentType);
    const verified = await this.inspect(path, ImportCommandSchema.parse({ id: `import_${attempt.slotId.slice(5)}`, filename: output.kind === "image" ? "Picture.webp" : "Clip.mp4", contentType: object.contentType, bytes: object.buffer.length, sha256: object.sha256 }));
    return { object: this.handle(path), metadata: verified.metadata };
  } };
  nativeDependencies(inputAccess: NativeWorkflowExecutorDeps["inputAccess"]): NativeWorkflowExecutorDeps {
    return {
      images: { generatePreview: async (_words, options) => { const ownerId = options?.userId ?? "missing-owner"; this.providerCalls.push({ kind: "image", ownerId }); const path = `users/${ownerId}/previews/images/provider-${randomUUID()}.webp`; this.put(path, this.picture, "image/webp"); return { imageUrl: (await this.access(ownerId, path)).url, storagePath: path, metadata: { model: "controlled-flux-fixture", duration: 0, aspectRatio: "16:9", generatedAt: new Date().toISOString() } }; } },
      videos: { generateVideo: async () => { this.providerCalls.push({ kind: "video" }); const assetId = randomUUID(); return { assetId, videoUrl: `${this.origin}/__test/provider-video/${assetId}`, contentType: "video/mp4" }; }, getModelAvailability: model => ({ id: model ?? "unavailable", available: model === "wan-video/wan-2.2-t2v-fast" }) },
      ai: { resolveExecution: () => ({ client: "openai", provider: "openai", model: "controlled-browser-text", viaFallback: false }), getAvailableClients: () => ["openai"], execute: async (_operation, options) => { this.providerCalls.push({ kind: "text" }); return { text: `Controlled advice: ${options.userMessage ?? "Use warmer lighting."}`, metadata: {}, executedBy: { client: "openai", provider: "openai", model: "controlled-browser-text", viaFallback: false } }; } },
      imageProviders: new Set(["replicate-flux-schnell", "replicate-flux-kontext-fast"]), inputAccess,
    };
  }
  /** Native video adapter results lack an owner; the captured attempt supplies it. */
  bindVideoAsset(ownerId: string, assetId: string): void { const path = `users/${ownerId}/previews/videos/provider-${assetId}.mp4`; this.put(path, this.clip, "video/mp4"); this.videoAssets.set(assetId, path); }
  sketchPreview = async (): Promise<Response> => Response.json({ images: [{ url: `data:image/webp;base64,${this.picture.toString("base64")}`, width: 320, height: 180 }], seed: 42 });
  exportStorage: ExportStorage = {
    download: async (owner, source, target, signal) => { signal.throwIfAborted(); if (source.object.identity !== "verified") throw new Error("Unknown source bytes"); const object = this.owned(owner, source.object.storagePath, source.object.generation); if (object.sha256 !== source.object.sha256 || object.buffer.length !== source.object.bytes) throw new Error("Exact source evidence changed"); await writeFile(target, object.buffer, { flag: "wx", mode: 0o600 }); },
    remove: async (path, generation) => { if (!/^users\/[^/]+\/video-previews\//.test(path)) throw new Error("Only derived editor previews can be retired."); const existing = this.objects.get(path); if (existing?.generation === generation) this.objects.delete(path); },
    inspect: async path => { const object = this.objects.get(path); return object ? { storagePath: path, generation: object.generation, sha256: object.sha256, bytes: object.buffer.length } : undefined; },
    store: async (path, localPath, evidence) => { const bytes = await readFile(localPath); if (hash(bytes) !== evidence.sha256 || bytes.length !== evidence.bytes) throw new Error("Rendered evidence mismatch"); const object = this.put(path, bytes, "video/mp4"); return { storagePath: path, generation: object.generation, sha256: object.sha256, bytes: bytes.length }; },
    access: (owner, path, generation) => this.access(owner, path, generation),
  };
  sketchStorage: ProjectSketchStorage = { put: async (path, picture) => { this.put(path, picture.bytes, picture.mime); return this.handle(path); } };
  managementStorage: WorkflowManagementStorage = {
    content: async (share, range) => { if (share.object.identity !== "verified") throw new Error("Unknown share bytes"); const object = this.owned(share.ownerId, share.object.storagePath, share.object.generation); const selected = parseByteRange(range, object.buffer.length); return { stream: Readable.from([selected ? object.buffer.subarray(selected.start, selected.end + 1) : object.buffer]), contentType: object.contentType, bytes: object.buffer.length, ...(selected ? { range: selected } : {}) }; },
    downloadAccess: async (owner, version) => { if (version.object.identity !== "verified") throw new Error("Unknown media"); return this.access(owner, version.object.storagePath, version.object.generation); },
    downloadSource: (owner, source, target, signal) => this.exportStorage.download(owner, source, target, signal),
    existingFrame: async operation => this.frames.get(operation.id),
    storeFrame: async (operation, localPath, evidence) => { const bytes = await readFile(localPath); if (hash(bytes) !== evidence.sha256 || bytes.length !== evidence.bytes) throw new Error("Frame evidence mismatch"); const path = `users/${operation.ownerId}/previews/images/${operation.id}.png`; this.put(path, bytes, "image/png"); const stored: StoredFrame = { object: this.handle(path), metadata: { state: "verified", width: evidence.width, height: evidence.height, durationSeconds: 0, audio: "absent", probeVersion: "native-frame-browser" } }; this.frames.set(operation.id, stored); return stored; },
  };
  async middleware(req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> {
    const url = new URL(req.url ?? "/", this.origin);
    if (url.pathname === "/__test/media") {
      const path = url.searchParams.get("path") ?? ""; const object = this.objects.get(path); const generation = url.searchParams.get("generation");
      if (!object || (generation !== null && object.generation !== generation)) { res.statusCode = 404; res.end(); return; }
      const selected = parseByteRange(typeof req.headers.range === "string" ? req.headers.range : undefined, object.buffer.length);
      res.statusCode = selected ? 206 : 200; res.setHeader("content-type", object.contentType); res.setHeader("accept-ranges", "bytes"); res.setHeader("cache-control", "no-store"); if (selected) res.setHeader("content-range", `bytes ${selected.start}-${selected.end}/${object.buffer.length}`); const bytes = selected ? object.buffer.subarray(selected.start, selected.end + 1) : object.buffer; res.setHeader("content-length", bytes.length); res.end(bytes); return;
    }
    if (!url.pathname.startsWith("/__test/upload/")) { next(); return; }
    const session = this.uploads.get(url.pathname.split("/").at(-1) ?? "");
    if (!session || session.cancelled) { res.statusCode = 410; res.end(); return; }
    if (req.method === "DELETE") { session.cancelled = true; res.statusCode = 204; res.end(); return; }
    if (req.method !== "PUT") { res.statusCode = 405; res.end(); return; }
    const range = req.headers["content-range"];
    if (typeof range === "string" && range.startsWith("bytes */")) { res.statusCode = session.received.length === session.bytes ? 200 : 308; if (session.received.length) res.setHeader("range", `bytes=0-${session.received.length - 1}`); res.end(); return; }
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); const data = Buffer.concat(chunks);
    const start = typeof range === "string" ? Number(/^bytes (\d+)-/.exec(range)?.[1] ?? 0) : 0;
    if (start !== session.received.length || start + data.length > session.bytes) { res.statusCode = 409; res.end(); return; }
    session.received = Buffer.concat([session.received, data]);
    if (session.received.length === session.bytes) { this.put(session.path, session.received, session.contentType); res.statusCode = 200; }
    else { res.statusCode = 308; res.setHeader("range", `bytes=0-${session.received.length - 1}`); }
    res.end();
  }
}
