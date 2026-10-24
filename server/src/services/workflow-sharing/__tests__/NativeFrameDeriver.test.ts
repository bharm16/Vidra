import { it, expect, vi } from "vitest";
import { writeFile, readFile, stat } from "node:fs/promises";
import sharp from "sharp";
import { deriveNativeFrame } from "@services/workflow-sharing/NativeFrameDeriver";
// Real temp-directory/PNG/hash/storage lifetime; substitute only native decoding.
vi.mock("@services/video-export/NativeProcess", () => ({ runNative: vi.fn(async (_executable, args: string[]) => { await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toFile(args.at(-1)!); return { stdout: "", stderr: "" }; }) }));
it("retains a decoded frame until its storage operation settles", async () => {
  let storedPath = "";
  const storage = { downloadSource: vi.fn(async (_owner, _source, target) => { await writeFile(target, "controlled source"); }), storeFrame: vi.fn(async (_operation, path) => { storedPath = path; await new Promise(resolve => setTimeout(resolve, 35)); await readFile(path); return { object: { identity: "verified" as const, assetId: "frame", storagePath: "frame.png", generation: "1", sha256: "a".repeat(64), bytes: 10 }, metadata: { state: "verified" as const, width: 2, height: 2, durationSeconds: 0, audio: "absent" as const, probeVersion: "test" } }; }) };
  await expect(deriveNativeFrame(storage as never, { ownerId: "owner", timestampSeconds: 0 } as never, {} as never)).resolves.toMatchObject({ object: { assetId: "frame" } });
  expect(storage.storeFrame).toHaveBeenCalledTimes(1); await expect(stat(storedPath)).rejects.toMatchObject({ code: "ENOENT" });

});
