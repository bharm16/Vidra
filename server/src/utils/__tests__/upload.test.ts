import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { cleanupUploadFile, readUploadBuffer } from "../upload";

describe("upload utils", () => {
  it("reads upload buffer directly when provided", async () => {
    const file = {
      buffer: Buffer.from("hello"),
    } as Express.Multer.File;

    const data = await readUploadBuffer(file);
    expect(data.toString()).toBe("hello");
  });

  it("reads upload from file path and cleans up file", async () => {
    const tmpFile = path.join(os.tmpdir(), `upload-test-${Date.now()}.txt`);
    await fs.writeFile(tmpFile, "from-path", "utf8");

    const file = {
      path: tmpFile,
    } as Express.Multer.File;

    const data = await readUploadBuffer(file);
    expect(data.toString()).toBe("from-path");

    await cleanupUploadFile(file);
    await expect(fs.access(tmpFile)).rejects.toThrow();
  });

  it("throws when upload has neither buffer nor path", async () => {
    await expect(readUploadBuffer({} as Express.Multer.File)).rejects.toThrow(
      "Uploaded file has no buffer or path",
    );
  });
});
