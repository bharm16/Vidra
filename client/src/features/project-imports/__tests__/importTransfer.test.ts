import { afterEach, expect, it, vi } from "vitest";
import { transferImport } from "../api/importTransfer";
vi.mock("@/repositories/index", () => ({ getAuthRepository: () => ({ getCurrentUser: () => ({ uid: "owner" }) }) }));
afterEach(() => vi.unstubAllGlobals());
it("continues at the acknowledged position when only part of a chunk was retained", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, status: 308, headers: { get: () => "bytes=0-262143" } }).mockResolvedValueOnce({ ok: false, status: 308, headers: { get: () => "bytes=0-8650751" } }).mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers() });
  vi.stubGlobal("fetch", fetcher);
  const file = new Blob([new Uint8Array(9 * 1024 * 1024)], { type: "image/png" });
  await transferImport("owner", "https://upload.test/session", file, 0, new AbortController().signal, vi.fn());
  expect(fetcher.mock.calls[1]?.[1].headers["Content-Range"]).toBe(`bytes 262144-8650751/${file.size}`);
});

it("refuses an acknowledgement that makes no progress", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 308, headers: new Headers() })));
  await expect(transferImport("owner", "https://upload.test/session", new Blob(["file"]), 0, new AbortController().signal, vi.fn())).rejects.toThrow("position");
});

it("reconciles an unexposed acknowledgement through the owned import session", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, status: 308, headers: new Headers() }).mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers() });
  vi.stubGlobal("fetch", fetcher); const reconcileOffset = vi.fn(async () => 3);
  await transferImport("owner", "https://upload.test/session", new Blob(["file"]), 0, new AbortController().signal, vi.fn(), { reconcileOffset });
  expect(reconcileOffset).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[1]?.[1].headers["Content-Range"]).toBe("bytes 3-3/4");
});
