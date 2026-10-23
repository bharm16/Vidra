import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupUploadFile, createDiskUpload, readUploadBuffer } from "../upload";
import { errorHandler } from "@middleware/errorHandler";
import { logger } from "@infrastructure/Logger";

let directory: string;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "vidra-multipart-test-"));
  vi.spyOn(logger, "error").mockImplementation(() => undefined);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(directory, { recursive: true, force: true });
});

function parserApp(fileSizeBytes = 1024, parsed = vi.fn()): express.Express {
  const app = express();
  app.post("/upload", createDiskUpload({ fileSizeBytes, directory }).single("file"), async (req, res) => {
    const bytes = req.file ? (await readUploadBuffer(req.file)).length : 0;
    parsed(req.body);
    await cleanupUploadFile(req.file);
    res.json({ parsed: true, fields: Object.keys(req.body ?? {}), bytes });
  });
  app.use(errorHandler);
  return app;
}

async function withServer(run: (port: number) => Promise<void>, app = parserApp()): Promise<void> {
  const server = http.createServer(app);
  await new Promise<void>(resolve => { server.listen(0, "127.0.0.1", resolve); });
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing loopback port");
    await run(address.port);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); });
  }
}

describe("disk upload multipart bounds", () => {
  it("rejects many individually legal text fields even when no file is sent", async () => {
    const upload = request(parserApp()).post("/upload");
    for (let index = 0; index < 100; index += 1) upload.field(`field${index}`, "x".repeat(1024));
    const response = await upload;
    expect(response.status).toBe(413);
    expect(response.body).not.toHaveProperty("parsed");
  });

  it("rejects oversized metadata before reaching the upload handler", async () => {
    const response = await request(parserApp()).post("/upload").field("metadata", "x".repeat(64 * 1024));
    expect(response.status).toBe(413);
    expect(response.body).not.toHaveProperty("parsed");
  });

  it("accepts all six maximum-sized text fields beside one boundary-sized file", async () => {
    const fields = ["source", "label", "metadata", "sessionId", "promptVersionId", "admissionKey"];
    const upload = request(parserApp()).post("/upload");
    for (const field of fields) upload.field(field, "x".repeat(64 * 1024 - 1));
    const response = await upload.attach("file", Buffer.alloc(1023), "frame.png");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ parsed: true, fields, bytes: 1023 });
    expect(await fs.readdir(directory)).toEqual([]);
  });

  it("cleans a completed disk file if later fields exceed the parser limit", async () => {
    const upload = request(parserApp()).post("/upload").attach("file", Buffer.alloc(100), "frame.png");
    for (let index = 0; index < 7; index += 1) upload.field(`field${index}`, "legal text");
    const response = await upload;
    expect(response.status).toBe(413);
    expect(response.headers.connection).toBe("close");
    expect(await fs.readdir(directory)).toEqual([]);
  });

  it("does not leave a file appended after rejected fields", async () => {
    const upload = request(parserApp()).post("/upload");
    for (let index = 0; index < 7; index += 1) upload.field(`field${index}`, "legal text");
    const response = await upload.attach("file", Buffer.alloc(100), "frame.png");
    expect(response.status).toBe(413);
    expect(await fs.readdir(directory)).toEqual([]);
  });

  it("cleans a partial file when the multipart form ends unexpectedly", async () => {
    const body = Buffer.concat([
      Buffer.from('--bounded\r\nContent-Disposition: form-data; name="file"; filename="frame.png"\r\nContent-Type: image/png\r\n\r\n'),
      Buffer.alloc(100),
    ]);
    const response = await request(parserApp()).post("/upload").set("Content-Type", "multipart/form-data; boundary=bounded").send(body);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid multipart upload.");
    expect(await fs.readdir(directory)).toEqual([]);
  });

  it.each(["long field name", "second file", "oversized file"])("rejects and cleans up a %s", async kind => {
    const upload = request(parserApp()).post("/upload").attach("file", Buffer.alloc(kind === "oversized file" ? 1025 : 100), "frame.png");
    if (kind === "long field name") upload.field("n".repeat(33), "value");
    else if (kind === "second file") upload.attach("file", Buffer.alloc(100), "second.png");
    const response = await upload;
    expect(response.status).toBe(413);
    expect(await fs.readdir(directory)).toEqual([]);
  });

  it("rejects an over-budget declared body before waiting for its bytes", async () => {
    await withServer(async port => {
      const client = http.request({ host: "127.0.0.1", port, path: "/upload", method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=bounded", "Content-Length": String(1024 + 7 * 64 * 1024 + 1) } });
      try {
        const status = new Promise<number | undefined>((resolve, reject) => {
          client.on("response", response => { response.resume(); resolve(response.statusCode); });
          client.on("error", reject);
        });
        client.flushHeaders();
        expect(await status).toBe(413);
      } finally { client.destroy(); }
    });
  });

  it("aborts an over-budget chunked preamble without waiting for the final boundary", async () => {
    await withServer(async port => {
      const client = http.request({ host: "127.0.0.1", port, path: "/upload", method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=bounded", "Transfer-Encoding": "chunked" } });
      try {
        const status = new Promise<number | undefined>((resolve, reject) => {
          client.on("response", response => { response.resume(); resolve(response.statusCode); });
          client.on("error", reject);
        });
        client.write(Buffer.alloc(470 * 1024, "x"));
        expect(await status).toBe(413);
      } finally { client.destroy(); }
    });
  });

  it("rejects the seventh field before the client finishes the body", async () => {
    await withServer(async port => {
      const client = http.request({ host: "127.0.0.1", port, path: "/upload", method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=bounded", "Transfer-Encoding": "chunked" } });
      try {
        const status = new Promise<number | undefined>((resolve, reject) => {
          client.on("response", response => { response.resume(); resolve(response.statusCode); });
          client.on("error", reject);
        });
        for (let index = 0; index < 7; index += 1) client.write(`--bounded\r\nContent-Disposition: form-data; name="field${index}"\r\n\r\nlegal value\r\n`);
        client.write("--bounded\r\n");
        expect(await status).toBe(413);
      } finally { client.destroy(); }
    });
  });

  it("removes an in-progress disk file when the client disconnects", async () => {
    const parsed = vi.fn();
    await withServer(async port => {
      const client = http.request({ host: "127.0.0.1", port, path: "/upload", method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=bounded", "Transfer-Encoding": "chunked" } });
      client.on("error", () => undefined);
      client.write('--bounded\r\nContent-Disposition: form-data; name="file"; filename="frame.png"\r\nContent-Type: image/png\r\n\r\n');
      client.write(Buffer.alloc(1024));
      await vi.waitFor(async () => { expect(await fs.readdir(directory)).toHaveLength(1); });
      client.destroy();
      await vi.waitFor(async () => { expect(await fs.readdir(directory)).toEqual([]); });
      expect(parsed).not.toHaveBeenCalled();
    }, parserApp(1024 * 1024, parsed));
  });
});
