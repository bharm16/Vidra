import { describe, expect, it, vi } from "vitest";
import {
  AuthRetryTransport,
  shouldTriggerAuthRetry,
  type HttpTransport,
} from "../AuthRetryTransport";

function response(status: number): Response {
  return new Response(null, { status });
}

describe("shouldTriggerAuthRetry", () => {
  it("triggers on 401 for a logged-out user", () => {
    expect(shouldTriggerAuthRetry(response(401), false)).toBe(true);
  });

  it("does not trigger on 401 when already authenticated (re-login won't help)", () => {
    expect(shouldTriggerAuthRetry(response(401), false)).toBe(true);
    expect(shouldTriggerAuthRetry(response(401), true)).toBe(false);
  });

  it("does not trigger on non-401 statuses", () => {
    expect(shouldTriggerAuthRetry(response(200), false)).toBe(false);
    expect(shouldTriggerAuthRetry(response(403), false)).toBe(false);
    expect(shouldTriggerAuthRetry(response(500), false)).toBe(false);
  });
});

describe("AuthRetryTransport", () => {
  it("passes non-401 responses straight through without opening the gate", async () => {
    const ok = response(200);
    const inner: HttpTransport = { send: vi.fn().mockResolvedValue(ok) };
    const requestAuth = vi.fn();

    const transport = new AuthRetryTransport({
      transport: inner,
      authGate: { requestAuth },
      isAuthenticated: () => false,
      buildAuthHeaders: async () => ({}),
    });

    const result = await transport.send("/api/thing", { method: "GET" });

    expect(result).toBe(ok);
    expect(requestAuth).not.toHaveBeenCalled();
    expect(inner.send).toHaveBeenCalledTimes(1);
  });

  it("on a logged-out 401: opens the gate, then retries once with fresh auth headers after sign-in", async () => {
    const unauthorized = response(401);
    const retried = response(200);
    const send = vi
      .fn()
      .mockResolvedValueOnce(unauthorized)
      .mockResolvedValueOnce(retried);
    const requestAuth = vi.fn().mockResolvedValue("authenticated");

    const transport = new AuthRetryTransport({
      transport: { send },
      authGate: { requestAuth },
      isAuthenticated: () => false,
      buildAuthHeaders: async () => ({ "X-Firebase-Token": "fresh-token" }),
    });

    const result = await transport.send("/api/thing", {
      method: "GET",
      headers: { "X-Existing": "keep" },
    });

    expect(requestAuth).toHaveBeenCalledWith({ reason: "http-401" });
    expect(result).toBe(retried);
    expect(send).toHaveBeenCalledTimes(2);

    // The retry carries the freshly-built token alongside the original header.
    const retryInit = send.mock.calls[1]?.[1] as RequestInit;
    const retryHeaders = new Headers(retryInit.headers);
    expect(retryHeaders.get("X-Firebase-Token")).toBe("fresh-token");
    expect(retryHeaders.get("X-Existing")).toBe("keep");
  });

  it("returns the original 401 when the user cancels the dialog (no retry)", async () => {
    const unauthorized = response(401);
    const send = vi.fn().mockResolvedValue(unauthorized);
    const requestAuth = vi.fn().mockResolvedValue("cancelled");
    const buildAuthHeaders = vi.fn().mockResolvedValue({});

    const transport = new AuthRetryTransport({
      transport: { send },
      authGate: { requestAuth },
      isAuthenticated: () => false,
      buildAuthHeaders,
    });

    const result = await transport.send("/api/thing", { method: "GET" });

    expect(result).toBe(unauthorized);
    expect(send).toHaveBeenCalledTimes(1);
    expect(buildAuthHeaders).not.toHaveBeenCalled();
  });

  it("does not open the gate on a 401 for an already-authenticated user", async () => {
    const unauthorized = response(401);
    const send = vi.fn().mockResolvedValue(unauthorized);
    const requestAuth = vi.fn();

    const transport = new AuthRetryTransport({
      transport: { send },
      authGate: { requestAuth },
      isAuthenticated: () => true,
      buildAuthHeaders: async () => ({}),
    });

    const result = await transport.send("/api/thing", { method: "GET" });

    expect(result).toBe(unauthorized);
    expect(requestAuth).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("returns the retried response as-is even if it is itself a 401 (single retry only)", async () => {
    const firstUnauthorized = response(401);
    const secondUnauthorized = response(401);
    const send = vi
      .fn()
      .mockResolvedValueOnce(firstUnauthorized)
      .mockResolvedValueOnce(secondUnauthorized);
    const requestAuth = vi.fn().mockResolvedValue("authenticated");

    const transport = new AuthRetryTransport({
      transport: { send },
      authGate: { requestAuth },
      isAuthenticated: () => false,
      buildAuthHeaders: async () => ({}),
    });

    const result = await transport.send("/api/thing", { method: "GET" });

    expect(result).toBe(secondUnauthorized);
    expect(send).toHaveBeenCalledTimes(2);
    expect(requestAuth).toHaveBeenCalledTimes(1);
  });
});
