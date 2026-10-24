import { expect, it, vi } from "vitest";
import { runNative } from "../NativeProcess";
vi.mock("node:child_process", async importOriginal => {
  const native = await importOriginal<typeof import("node:child_process")>();
  return { ...native, execFile: (_command: string, _args: string[], _options: unknown, callback: (error: Error) => void): void => callback(Object.assign(new Error("unsupported monitor options"), { code: 1 })) };
});
it("fails closed when the RSS monitor exits unsuccessfully", async () => {
  await expect(runNative(process.execPath, ["-e", "setInterval(()=>{},1000)"], { timeoutMs: 1200 })).rejects.toThrow("memory monitoring is unavailable");
});
