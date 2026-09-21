import http from "node:http";
import https from "node:https";
import { afterEach, describe, expect, it } from "vitest";
import {
  installOutboundGuard,
  OutboundCallBlockedError,
  type OutboundGuard,
} from "./helpers/cross-mode/outboundGuard";

/**
 * The guard's own test.
 *
 * The cross-mode walkthrough's offline claim rests entirely on this guard, and
 * a guard that silently passes everything would certify exactly the bug it
 * exists to catch. So it is tested the same way anything load-bearing is: by
 * making the thing it forbids actually happen.
 */

describe("Cross-mode outbound guard (integration)", () => {
  let guard: OutboundGuard | null = null;

  afterEach(() => {
    guard?.restore();
    guard = null;
  });

  it("fails a fetch to a host that is not loopback, and records it", async () => {
    guard = installOutboundGuard();

    await expect(
      fetch("https://api.openai.com/v1/chat/completions", { method: "POST" }),
    ).rejects.toBeInstanceOf(OutboundCallBlockedError);

    expect(guard.violations).toEqual([
      "https://api.openai.com/v1/chat/completions",
    ]);
    expect(() => guard?.assertNoOutboundCalls()).toThrow(
      OutboundCallBlockedError,
    );
  });

  it("fails a classic node:https request too", () => {
    guard = installOutboundGuard();

    expect(() =>
      https.request({ hostname: "replicate.com", path: "/v1/predictions" }),
    ).toThrow(OutboundCallBlockedError);
    expect(() => http.get("http://storage.googleapis.com/bucket")).toThrow(
      OutboundCallBlockedError,
    );
    expect(guard.violations).toHaveLength(2);
  });

  it("lets loopback through, so the walkthrough can drive its own server", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve()),
    );
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("expected a TCP address");
    }

    guard = installOutboundGuard();
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/`);
      expect(await response.json()).toEqual({ ok: true });
      expect(guard.violations).toEqual([]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("routes a named host to its deterministic adapter instead of the network", async () => {
    guard = installOutboundGuard({
      routes: {
        "objects.example.invalid": () =>
          Promise.resolve(
            new Response("stored bytes", {
              status: 200,
              headers: { "content-type": "text/plain" },
            }),
          ),
      },
    });

    const response = await fetch("https://objects.example.invalid/some/object");
    expect(await response.text()).toBe("stored bytes");
    // A routed host is served, not excused: everything else still fails.
    expect(guard.violations).toEqual([]);
    await expect(
      fetch("https://objects.other.invalid/x"),
    ).rejects.toBeInstanceOf(OutboundCallBlockedError);
  });

  it("puts the real doors back when it is restored", () => {
    const fetchBefore = globalThis.fetch;
    const requestBefore = http.request;
    const httpsBefore = https.request;

    const installed = installOutboundGuard();
    expect(globalThis.fetch).not.toBe(fetchBefore);
    expect(http.request).not.toBe(requestBefore);
    expect(https.request).not.toBe(httpsBefore);

    installed.restore();
    expect(globalThis.fetch).toBe(fetchBefore);
    expect(http.request).toBe(requestBefore);
    expect(httpsBefore).toBe(https.request);
  });

  it("with allowEgress, forwards a non-loopback call instead of blocking it, and logs the destination", async () => {
    // The recorder's posture (issue #139): recording is the one mode whose
    // point is live provider calls, so the guard observes rather than refuses.
    // The destination is a guaranteed-NXDOMAIN host — the assertion is about
    // WHICH error surfaces: any DNS/connection failure proves the call was
    // forwarded to the real network stack, where blocking would have thrown
    // OutboundCallBlockedError synchronously from the guard itself.
    guard = installOutboundGuard({ allowEgress: true });

    const destination = "https://egress-probe.invalid/v1/models";
    const failure = await fetch(destination).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).not.toBeNull();
    expect(failure).not.toBeInstanceOf(OutboundCallBlockedError);
    expect(guard.networkCalls).toEqual([destination]);
    expect(guard.violations).toEqual([]);
  });

  it("with allowEgress, still routes a named host instead of the network", async () => {
    guard = installOutboundGuard({
      allowEgress: true,
      routes: {
        "objects.example.invalid": () =>
          Promise.resolve(
            new Response("stored bytes", {
              status: 200,
              headers: { "content-type": "text/plain" },
            }),
          ),
      },
    });

    const response = await fetch("https://objects.example.invalid/some/object");
    expect(await response.text()).toBe("stored bytes");
    expect(guard.networkCalls).toEqual([]);
  });
});
