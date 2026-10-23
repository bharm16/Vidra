import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Request, RequestHandler } from "express";
import multer, { type Options as MulterOptions } from "multer";

const DEFAULT_TMP_DIR = os.tmpdir();
// source, label, metadata and the sessionId/promptVersionId/admissionKey trio.
// Count and value limits together bound accumulated text to less than 384 KiB.
const MAX_FIELDS = 6;
const MAX_FIELD_BYTES = 64 * 1024;
const MAX_FIELD_NAME_BYTES = 32;
const MAX_ENVELOPE_BYTES = MAX_FIELDS * MAX_FIELD_BYTES + 64 * 1024;

interface UploadState {
  controller: AbortController;
  paths: Set<string>;
  writes: Set<Promise<void>>;
}

function uploadLimitError(message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode: 413 });
}

function publicUploadError(error: unknown): unknown {
  if (error instanceof multer.MulterError) {
    return Object.assign(new Error(error.message), {
      statusCode: error.code === "LIMIT_UNEXPECTED_FILE" ? 400 : 413,
    });
  }
  if (
    error instanceof Error &&
    [
      "Unexpected end of form",
      "Malformed part header",
      "Multipart: Boundary not found",
    ].includes(error.message)
  ) {
    return Object.assign(new Error("Invalid multipart upload."), {
      statusCode: 400,
    });
  }
  return error;
}

export function createDiskUpload(options: {
  fileSizeBytes: number;
  fileFilter?: MulterOptions["fileFilter"];
  directory?: string;
}): Pick<multer.Multer, "single"> {
  const directory = options.directory ?? DEFAULT_TMP_DIR;
  const states = new WeakMap<Request, UploadState>();
  const storage: multer.StorageEngine = {
    _handleFile(req, file, cb): void {
      const state = states.get(req);
      if (!state || state.controller.signal.aborted) {
        return cb(new Error("Upload was cancelled."));
      }
      const filename = `vidra-upload-${crypto.randomUUID()}`;
      const filePath = path.join(directory, filename);
      state.paths.add(filePath);
      const output = createWriteStream(filePath, { flags: "wx", mode: 0o600 });
      // Multer's stock disk writer does not cancel a partial write when the
      // request disconnects. This request owns both streams until handoff.
      const write = pipeline(file.stream, output, {
        signal: state.controller.signal,
      }).then(
        () => {
          cb(null, {
            destination: directory,
            filename,
            path: filePath,
            size: output.bytesWritten,
          });
        },
        async (error: unknown) => {
          await cleanupUploadFile({ path: filePath });
          state.paths.delete(filePath);
          cb(error);
        },
      );
      state.writes.add(write);
      void write.finally(() => {
        state.writes.delete(write);
      });
    },
    _removeFile(req, file, cb): void {
      void cleanupUploadFile(file).then(() => {
        states.get(req)?.paths.delete(file.path);
        cb(null);
      });
    },
  };
  const upload = multer({
    storage,
    limits: {
      fileSize: options.fileSizeBytes,
      files: 1,
      fields: MAX_FIELDS,
      fieldSize: MAX_FIELD_BYTES,
      fieldNameSize: MAX_FIELD_NAME_BYTES,
      // Busboy emits partsLimit on reaching this count, not on exceeding it.
      parts: MAX_FIELDS + 2,
    },
    ...(options.fileFilter ? { fileFilter: options.fileFilter } : {}),
  });

  return {
    single(fieldName: string): RequestHandler {
      const parse = upload.single(fieldName);
      return (req, res, next): void => {
        const state: UploadState = {
          controller: new AbortController(),
          paths: new Set(),
          writes: new Set(),
        };
        states.set(req, state);
        const maxRequestBytes = options.fileSizeBytes + MAX_ENVELOPE_BYTES;
        let receivedBytes = 0;
        let settled = false;
        const disconnect = (): void => {
          if (!res.writableFinished) finish(new Error("Upload disconnected."));
        };
        const countBytes = (chunk: Buffer): void => {
          receivedBytes += chunk.length;
          if (receivedBytes > maxRequestBytes) {
            finish(uploadLimitError("Multipart upload is too large."));
          }
        };
        const finish = (error?: unknown): void => {
          if (settled) return;
          settled = true;
          req.off("data", countBytes);
          req.off("aborted", disconnect);
          res.off("close", disconnect);
          if (!error) {
            states.delete(req);
            next();
            return;
          }
          // Stop parsing immediately, including chunked bodies and preambles.
          req.unpipe();
          req.pause();
          state.controller.abort();
          void Promise.allSettled([...state.writes]).then(async () => {
            await Promise.all(
              [...state.paths].map(filePath =>
                cleanupUploadFile({ path: filePath }),
              ),
            );
            states.delete(req);
            req.body = Object.create(null);
            if (req.aborted || res.destroyed) return;
            res.setHeader("Connection", "close");
            res.once("finish", () => {
              req.destroy();
            });
            next(publicUploadError(error));
          });
        };
        req.once("aborted", disconnect);
        res.once("close", disconnect);
        const declaredBytes = Number(req.headers["content-length"]);
        if (declaredBytes > maxRequestBytes) {
          finish(uploadLimitError("Multipart upload is too large."));
          return;
        }
        req.on("data", countBytes);
        try {
          parse(req, res, finish);
        } catch (error) {
          finish(error);
        }
      };
    },
  };
}

export async function readUploadBuffer(
  file: Express.Multer.File,
): Promise<Buffer> {
  if (file.buffer) {
    return file.buffer;
  }
  if (file.path) {
    return await fs.readFile(file.path);
  }
  throw new Error("Uploaded file has no buffer or path");
}

export async function cleanupUploadFile(
  file?: Pick<Express.Multer.File, "path"> | null,
): Promise<void> {
  if (!file?.path) return;
  try {
    await fs.unlink(file.path);
  } catch {
    // Ignore cleanup errors (file may already be removed).
  }
}
