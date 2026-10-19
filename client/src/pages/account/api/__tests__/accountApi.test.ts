import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadAccountUsage } from "../accountApi";
const current = vi.hoisted(() => vi.fn());
const raw = vi.hoisted(() => vi.fn());
vi.mock("@repositories/index", () => ({ getAuthRepository: () => ({ getCurrentUser: current }) }));
vi.mock("@/services/ApiClient", () => ({ apiClient: { rawRequest: raw } }));
const valid = { success: true, data: { resetAt: "2026-10-18T00:00:00.000Z", allowances: [{ kind: "sketch", state: "available" }], requests: [] } };
beforeEach(() => { vi.resetAllMocks(); current.mockReturnValue({ uid: "creator" }); raw.mockResolvedValue({ ok: true, json: async () => valid }); });
describe("Account usage boundary", () => {
  it("refuses an absent or mismatched owner before sending a request", async () => {
    current.mockReturnValue(null);
    await expect(loadAccountUsage("creator")).rejects.toThrow("Sign in");
    current.mockReturnValue({ uid: "other" });
    await expect(loadAccountUsage("creator")).rejects.toThrow("Sign in");
    expect(raw).not.toHaveBeenCalled();
  });
  it("rejects stale user data when the account changes during body reading", async () => {
    raw.mockResolvedValue({ ok: true, json: async () => { current.mockReturnValue({ uid: "other" }); return valid; } });
    await expect(loadAccountUsage("creator")).rejects.toThrow("account changed");
  });
  it("validates responses instead of inventing usage from malformed data", async () => {
    raw.mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { remaining: 10 } }) });
    await expect(loadAccountUsage("creator")).rejects.toThrow();
  });
  it("passes abort ownership and returns only validated server facts", async () => {
    const controller = new AbortController();
    expect(await loadAccountUsage("creator", controller.signal)).toEqual(valid.data);
    expect(raw).toHaveBeenCalledWith("/account/usage", { method: "GET", signal: controller.signal });
  });
});
