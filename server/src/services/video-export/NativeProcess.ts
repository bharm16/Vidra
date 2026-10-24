import { execFile, spawn } from "node:child_process";

export class RenderCancelledError extends Error { constructor() { super("Export was cancelled after the native process closed."); this.name = "RenderCancelledError"; } }
export interface NativeProcessResult { stdout: string; stderr: string; }
/** Resolves cancellation only on close; no shell, fixed log bound and deadline. */
export function runNative(executable: string, args: readonly string[], options: { signal?: AbortSignal; timeoutMs: number; cwd?: string; onProgress?: (stdout: string) => void; maxRssBytes?: number }): Promise<NativeProcessResult> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(new RenderCancelledError()); return; }
    const child = spawn(executable, [...args], { shell: false, stdio: ["ignore", "pipe", "pipe"], ...(options.cwd ? { cwd: options.cwd } : {}) });
    let stdout = ""; let stderr = ""; let timedOut = false; let killTimer: NodeJS.Timeout | undefined; let spawnError: Error | undefined; let memoryExceeded = false; let closed = false; let checkingMemory = false; let memoryMonitoringUnavailable = false;
    const terminate = (): void => { child.kill("SIGTERM"); killTimer ??= setTimeout(() => { child.kill("SIGKILL"); }, 2000); killTimer.unref(); };
    const memory = setInterval(() => {
      if (closed || checkingMemory || !child.pid) return;
      checkingMemory = true;
      execFile("ps", ["-o", "rss=", "-p", String(child.pid)], { timeout: 1000, maxBuffer: 4096, shell: false }, (error, result) => {
        checkingMemory = false;
        if (closed || child.exitCode !== null || child.signalCode !== null) return;
        if (error) { memoryMonitoringUnavailable = true; terminate(); return; }
        const rss = Number(result.trim()) * 1024;
        if (!Number.isFinite(rss) || rss <= 0) { memoryMonitoringUnavailable = true; terminate(); return; }
        if (rss > Math.min(options.maxRssBytes ?? 256 * 1024 * 1024, 256 * 1024 * 1024)) { memoryExceeded = true; terminate(); }
      });
    }, 250);
    memory.unref();
    const deadline = setTimeout(() => { timedOut = true; terminate(); }, options.timeoutMs);
    const abort = (): void => terminate(); options.signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (data: Buffer) => { const chunk = data.toString(); stdout = (stdout + chunk).slice(-1024 * 1024); options.onProgress?.(chunk); });
    child.stderr.on("data", (data: Buffer) => { stderr = (stderr + data.toString()).slice(-64 * 1024); });
    child.on("error", error => { spawnError = error; });
    child.on("close", code => { closed = true; clearInterval(memory); clearTimeout(deadline); if (killTimer) clearTimeout(killTimer); options.signal?.removeEventListener("abort", abort); if (options.signal?.aborted) reject(new RenderCancelledError()); else if (spawnError) reject(spawnError); else if (memoryMonitoringUnavailable) reject(new Error("Native export memory monitoring is unavailable.")); else if (memoryExceeded) reject(new Error("The bounded native export exceeded its memory limit.")); else if (timedOut) reject(new Error("The bounded native export exceeded its execution deadline.")); else if (code !== 0) reject(new Error(`Native media processing failed (${code}): ${stderr.slice(-2000)}`)); else resolve({ stdout, stderr }); });
  });
}
