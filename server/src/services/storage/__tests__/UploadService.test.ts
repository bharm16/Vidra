import type { Storage } from "@google-cloud/storage";
import { Readable, Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { controlledNetwork } from "@services/owned-media/__tests__/controlledNetwork";
import type { PublicNetworkDependencies } from "@services/owned-media/PublicNetworkTransport";
import { UploadService } from "../services/UploadService";

function buildService(network: PublicNetworkDependencies = controlledNetwork(() => ({}))) {
  let written = 0;
  const createWriteStream = vi.fn((_options: unknown): Writable => new Writable({
    write(chunk: Buffer, _encoding, callback): void { written += chunk.length; callback(); },
  }));
  const mockFile = {
    save: vi.fn(async () => undefined),
    exists: vi.fn(async () => [true]),
    getMetadata: vi.fn(async () => [{ size: String(written), contentType: "image/png", timeCreated: "2026-10-23T00:00:00.000Z" }]),
    delete: vi.fn(async (_options: unknown) => undefined),
    createWriteStream,
  };
  const file = vi.fn((_path: string) => mockFile);
  const storage = { bucket: () => ({ file }) } as unknown as Storage;
  return { service: new UploadService(storage, "test-bucket", network), mockFile, file, bytesWritten: () => written };
}

afterEach(() => vi.useRealTimers());

describe("UploadService", () => {
  it("uploads a bounded buffer and rejects confirming another owner's path", async () => {
    const { service, mockFile } = buildService();
    const buffer = Buffer.from("test");
    const result = await service.uploadFromBuffer(buffer, "user123", "preview-image", "image/webp", { model: "flux" });
    expect(result.storagePath).toContain("users/user123/previews/images/");
    expect(result.sizeBytes).toBe(buffer.length);
    expect(mockFile.save).toHaveBeenCalledOnce();
    await expect(service.confirmUpload("users/otheruser/file.mp4", "user123")).rejects.toMatchObject({ statusCode: 403 });
  });

  it.each(["application/pdf", "image/svg+xml", "image/png-extra"])("refuses %s outside the raster purpose before creating an object", async contentType => {
    const { service, file } = buildService(controlledNetwork(() => ({ headers: { "content-type": contentType } })));
    await expect(service.uploadFromUrl("https://cdn.example.test/input", "user123", "preview-image")).rejects.toThrow("content type");
    expect(file).not.toHaveBeenCalled();
  });

  it("does not create a destination for a private DNS answer or private redirect", async () => {
    const privateNetwork = controlledNetwork(() => ({}), [{ address: "10.0.0.1", family: 4 }]);
    const direct = buildService(privateNetwork);
    await expect(direct.service.uploadFromUrl("http://internal.example.test/input", "user123", "preview-image")).rejects.toThrow("public host");
    expect(privateNetwork.request).not.toHaveBeenCalled();
    expect(direct.file).not.toHaveBeenCalled();
    const redirects = controlledNetwork(() => ({ status: 302, headers: { location: "http://127.0.0.1/private" } }));
    const redirected = buildService(redirects);
    await expect(redirected.service.uploadFromUrl("https://cdn.example.test/input", "user123", "preview-image")).rejects.toThrow("sourceUrl");
    expect(redirects.request).toHaveBeenCalledOnce();
    expect(redirected.file).not.toHaveBeenCalled();
  });

  it.each([{}, { "content-length": "1" }])("stops actual oversized bytes and removes the partial object with headers %j", async extra => {
    const chunk = Buffer.alloc(1024 * 1024);
    const body = Readable.from((function* (): Generator<Buffer> { for (let index = 0; index < 100; index += 1) yield chunk; })(), { highWaterMark: 1 });
    const { service, mockFile, bytesWritten } = buildService(controlledNetwork(() => ({ headers: { "content-type": "image/png", ...extra }, body })));
    await expect(service.uploadFromUrl("https://cdn.example.test/input", "user123", "preview-image")).rejects.toThrow("maximum size");
    expect(bytesWritten()).toBeLessThanOrEqual(10 * 1024 * 1024);
    expect(mockFile.delete).toHaveBeenCalledWith({ ignoreNotFound: true });
    expect(mockFile.getMetadata).not.toHaveBeenCalled();
    expect(body.destroyed).toBe(true);
  });

  it("streams generation media beyond the image limit, retaining create-only writes and the final source URL", async () => {
    let firstWrite!: () => void;
    const writing = new Promise<void>(resolve => { firstWrite = resolve; });
    const chunk = Buffer.alloc(1024 * 1024);
    const body = Readable.from((async function* (): AsyncGenerator<Buffer> {
      yield chunk;
      await writing;
      for (let index = 1; index < 12; index += 1) yield chunk;
    })(), { highWaterMark: 1 });
    const network = controlledNetwork(url => url.pathname === "/input" ? { status: 302, headers: { location: "/final?signed=fixture" } } : { headers: { "content-type": "video/mp4" }, body });
    const { service, mockFile } = buildService(network);
    let received = 0;
    mockFile.createWriteStream.mockImplementationOnce(() => new Writable({ write(bytes: Buffer, _encoding, callback): void { received += bytes.length; firstWrite(); callback(); } }));
    mockFile.getMetadata.mockImplementationOnce(async () => [{ size: String(received), contentType: "video/mp4", timeCreated: "2026-10-23T00:00:00.000Z" }]);
    const result = await service.uploadFromUrl("https://cdn.example.test/input", "user123", "generation", { userId: "forged", sourceUrl: "forged" });
    expect(result.storagePath).toContain("users/user123/generations/");
    expect(result.sizeBytes).toBe(12 * 1024 * 1024);
    expect(mockFile.createWriteStream).toHaveBeenCalledWith(expect.objectContaining({ preconditionOpts: { ifGenerationMatch: 0 }, metadata: expect.objectContaining({ metadata: expect.objectContaining({ userId: "user123", sourceUrl: "https://cdn.example.test/final?signed=fixture" }) }) }));
    expect(mockFile.delete).not.toHaveBeenCalled();
  });

  it("aborts a failed destination and cleans its object, preserving a precondition collision", async () => {
    for (const code of [500, 412]) {
      const body = Readable.from([Buffer.from("picture")]);
      const { service, mockFile } = buildService(controlledNetwork(() => ({ body })));
      mockFile.createWriteStream.mockImplementationOnce(() => new Writable({ write(_chunk, _encoding, callback): void { callback(Object.assign(new Error("Storage failed"), { code })); } }));
      await expect(service.uploadFromUrl("https://cdn.example.test/input", "user123", "preview-image")).rejects.toThrow("Storage failed");
      expect(body.destroyed).toBe(true);
      expect(mockFile.delete).toHaveBeenCalledTimes(code === 412 ? 0 : 1);
    }
  });

  it("keeps the upload deadline active when the destination stalls after the source ends", async () => {
    vi.useFakeTimers();
    const { service, mockFile } = buildService(controlledNetwork(() => ({ body: Readable.from([Buffer.from("picture")]) })));
    mockFile.createWriteStream.mockImplementationOnce(() => new Writable({ write(): void {} }));
    const rejected = expect(service.uploadFromUrl("https://cdn.example.test/input", "user123", "preview-image")).rejects.toThrow(/abort/i);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);
    await rejected;
    expect(mockFile.delete).toHaveBeenCalledOnce();
  });

  it("aborts a failed upstream stream and surfaces cleanup failure instead of hiding it", async () => {
    const body = Readable.from((async function* (): AsyncGenerator<Buffer> {
      yield Buffer.from("partial picture");
      throw new Error("Remote connection lost");
    })());
    const { service, mockFile } = buildService(controlledNetwork(() => ({ body })));
    mockFile.delete.mockRejectedValueOnce(new Error("Cleanup unavailable"));
    const error = await service.uploadFromUrl("https://cdn.example.test/input", "user123", "preview-image").catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(AggregateError);
    if (!(error instanceof AggregateError)) throw new Error("Expected both operation and cleanup failures");
    expect(error.errors.map((failure: Error) => failure.message)).toEqual(["Remote connection lost", "Cleanup unavailable"]);
    expect(body.destroyed).toBe(true);
  });
});
