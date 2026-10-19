import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { runNative } from "@services/video-export/NativeProcess";
import { hashLocalFile } from "@services/video-export/ExportStorage";
import { WorkflowError } from "@services/projects/WorkflowError";
import type { FrameOperation, StoredFrame, WorkflowManagementStorage } from "./types";

/** Accurate decoded-frame extraction from one pinned local source; no provider or remote FFmpeg input. */
export async function deriveNativeFrame(storage: WorkflowManagementStorage, operation: FrameOperation, source: MediaVersion): Promise<StoredFrame> {
  const directory = await mkdtemp(join(tmpdir(), "vidra-frame-"));
  const signal = AbortSignal.timeout(90000);
  try {
    const input = join(directory, "source"); const output = join(directory, "frame.png");
    await storage.downloadSource(operation.ownerId, source, input, signal);
    await runNative("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-threads", "1", "-protocol_whitelist", "file,pipe", "-i", input, "-ss", operation.timestampSeconds.toFixed(6), "-map", "0:v:0", "-frames:v", "1", "-an", "-sn", "-dn", "-c:v", "png", "-threads", "1", "-f", "image2", output], { signal, timeoutMs: 60000 });
    const picture = sharp(output, { limitInputPixels: 40_000_000, failOn: "warning" }); const metadata = await picture.metadata(); await picture.stats();
    if (!metadata.width || !metadata.height) throw new WorkflowError("input_unavailable", "This clip's frame could not be decoded. Choose an earlier frame.");
    const evidence = await hashLocalFile(output);
    return storage.storeFrame(operation, output, { ...evidence, width: metadata.width, height: metadata.height });
  } finally { await rm(directory, { recursive: true, force: true }); }
}
