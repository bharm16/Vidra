import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createImageUploadHandler } from "@routes/preview/handlers/imageUpload";
import { createDiskUpload } from "@utils/upload";
import { logger } from "@infrastructure/Logger";

type Services = Parameters<typeof createImageUploadHandler>[0];
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
let directory: string;
let filePath: string;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "vidra-upload-handler-test-"));
  filePath = path.join(directory, "frame.png");
  await fs.writeFile(filePath, PNG);
  vi.spyOn(logger, "error").mockImplementation(() => undefined);
});
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(directory, { recursive: true, force: true }); });

function harness(options: { authenticated?: boolean; mimetype?: string; services?: Services; multipart?: boolean; parsedPaths?: string[] } = {}): express.Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, {
      ...(options.authenticated === false ? {} : { user: { uid: "creator" } }),
      ...(options.multipart ? {} : { file: { path: filePath, mimetype: options.mimetype ?? "image/png", originalname: "frame.png" } }),
    });
    next();
  });
  if (options.multipart) app.use(createDiskUpload({ fileSizeBytes: 1024, directory }).single("file"));
  app.post("/upload", (req, _res, next) => { if (req.file) options.parsedPaths?.push(req.file.path); next(); }, createImageUploadHandler(options.services ?? {}));
  return app;
}

describe("image upload temporary-file ownership", () => {
  it.each([
    { name: "authentication rejection", options: { authenticated: false }, body: {}, status: 401 },
    { name: "unsupported declared MIME", options: { mimetype: "text/plain" }, body: {}, status: 400 },
    { name: "creator mismatch", options: {}, body: { source: "pending-first-frame", metadata: { expectedCreatorId: "other" } }, status: 409 },
    { name: "partial admission", options: {}, body: { sessionId: "session_one" }, status: 400 },
    { name: "missing admission services", options: {}, body: { sessionId: "session_one", promptVersionId: "v1", admissionKey: "admit_one" }, status: 503 },
    { name: "missing reference storage", options: {}, body: {}, status: 503 },
  ])("removes a real disk file after $name", async ({ options, body, status }) => {
    const response = await request(harness(options)).post("/upload").send(body);
    expect(response.status).toBe(status);
    await vi.waitFor(async () => { await expect(fs.access(filePath)).rejects.toThrow(); });
  });

  it.each([
    { name: "unsupported MIME", mimetype: "text/plain", body: {}, status: 400 },
    { name: "creator mismatch", mimetype: "image/png", body: { source: "pending-first-frame", metadata: JSON.stringify({ expectedCreatorId: "other" }) }, status: 409 },
    { name: "missing services", mimetype: "image/png", body: {}, status: 503 },
  ])("cleans a real parser-created file after $name", async ({ mimetype, body, status }) => {
    const parsedPaths: string[] = [];
    const upload = request(harness({ multipart: true, parsedPaths })).post("/upload");
    for (const [name, value] of Object.entries(body)) upload.field(name, value);
    const response = await upload.attach("file", PNG, { filename: "frame.png", contentType: mimetype });
    expect(response.status).toBe(status);
    expect(parsedPaths).toHaveLength(1);
    expect(parsedPaths[0]).not.toBe(filePath);
    await vi.waitFor(async () => { expect(await fs.readdir(directory)).toEqual(["frame.png"]); });
  });

  it.each(["success", "failure"] as const)("removes a real disk file after storage %s", async outcome => {
    const uploadBuffer = vi.fn(async () => {
      if (outcome === "failure") throw new Error("Controlled storage failure");
      return { viewUrl: "https://media.example.test/frame.png", storagePath: "owned/frame.png", expiresAt: "2026-10-23T00:00:00.000Z", sizeBytes: PNG.length, contentType: "image/png" };
    });
    const response = await request(harness({ services: { storageService: { uploadBuffer } as never } })).post("/upload").send({ source: "reference" });
    expect(response.status).toBe(outcome === "success" ? 201 : 500);
    expect(uploadBuffer).toHaveBeenCalledTimes(1);
    await vi.waitFor(async () => { await expect(fs.access(filePath)).rejects.toThrow(); });
  });

  it("cleans an acquired file on disconnect while storage is still pending", async () => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const uploadBuffer = vi.fn(async () => {
      await pending;
      return { viewUrl: "https://media.example.test/frame.png", storagePath: "owned/frame.png", expiresAt: "2026-10-23T00:00:00.000Z", sizeBytes: PNG.length, contentType: "image/png" };
    });
    const server = http.createServer(harness({ services: { storageService: { uploadBuffer } as never } }));
    await new Promise<void>(resolve => { server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing loopback port");
    const client = http.request({ host: "127.0.0.1", port: address.port, path: "/upload", method: "POST", headers: { "Content-Type": "application/json" } });
    client.on("error", () => undefined);
    try {
      client.end("{}");
      await vi.waitFor(() => { expect(uploadBuffer).toHaveBeenCalledTimes(1); });
      client.destroy();
      await vi.waitFor(async () => { await expect(fs.access(filePath)).rejects.toThrow(); });
    } finally {
      release();
      client.destroy();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); });
    }
  });
});
