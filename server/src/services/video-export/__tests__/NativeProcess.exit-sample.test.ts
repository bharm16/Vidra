import { expect, it, vi } from "vitest";
import { runNative } from "../NativeProcess";

const sample = vi.hoisted(() => ({ state: "Z", calls: 0 }));
vi.mock("node:child_process", async importOriginal => {
  const native = await importOriginal<typeof import("node:child_process")>();
  return { ...native, execFile: (_command: string, _args: string[], _options: unknown, callback: (error: Error | null, result: string, diagnostics: string) => void): void => {
    if (sample.state === "transient") callback(null, sample.calls++ === 0 ? "R 0\n" : "R 16384\n", "");
    else if (sample.state !== "gone") callback(null, `${sample.state} 0\n`, "");
    else callback(Object.assign(new Error("No matching process"), { code: 1 }), "", "");
  } };
});

it.each(["Z", "gone", "transient"])("waits for normal closure when RSS sampling observes process exit (state=%s)", async state => {
  sample.state = state; sample.calls = 0;
  await expect(runNative(process.execPath, ["-e", "setTimeout(()=>process.stdout.write('finished'),400)"], { timeoutMs: 2000 })).resolves.toMatchObject({ stdout: "finished" });
});

it("fails closed if a running process repeatedly has no measurable RSS", async () => {
  sample.state = "R";
  await expect(runNative(process.execPath, ["-e", "setInterval(()=>{},1000)"], { timeoutMs: 2000 })).rejects.toThrow("memory monitoring is unavailable");
});
