import http from "node:http";
import https from "node:https";

/**
 * The zero-network guarantee, enforced rather than asserted.
 *
 * Deleting provider credentials proves a *client* was never constructed; it
 * does not prove nothing left the process. This guard answers the actual
 * question by intercepting the two doors a Node process has — `fetch`
 * (undici: every LLM SDK, Replicate, and the sketch relay's upstream) and
 * `node:http` / `node:https` (everything built on the classic agent) — and
 * refusing every destination that is not loopback.
 *
 * Two destinations are allowed and no others. Loopback, because the
 * walkthrough drives the real app over its own TCP socket. And any host a
 * caller explicitly ROUTES to a deterministic adapter — that is how the object
 * store gets read the way GCS is read (over HTTPS, past the SSRF allowlist)
 * without a byte leaving the process. Everything else fails the call AND is
 * recorded, so a swallowed catch cannot hide it.
 */

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

export class OutboundCallBlockedError extends Error {
  constructor(readonly destination: string) {
    super(
      `Blocked outbound call to ${destination}. The cross-mode walkthrough runs ` +
        `offline: every boundary it touches has a deterministic adapter ` +
        `(docs/architecture/cross-mode-golden-path.md). A live call here means a ` +
        `seam was bypassed or a new boundary was added without one.`,
    );
    this.name = "OutboundCallBlockedError";
  }
}

/** A deterministic adapter standing in for one remote host. */
export type OutboundRoute = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

export interface OutboundGuardOptions {
  /** hostname → the adapter that answers for it, instead of the network. */
  routes?: Readonly<Record<string, OutboundRoute>>;
  /**
   * Observe instead of block: non-routed destinations reach the real network
   * AND are logged to `networkCalls`. This is the RECORDER's posture (issue
   * #139) — recording is the one mode whose point is live provider calls, so
   * the guard keeps routing the object store and keeps a full destination
   * log instead of refusing every egress. The default (blocking) is what the
   * offline walkthrough relies on and is unchanged.
   */
  allowEgress?: boolean;
}

export interface OutboundGuard {
  /** Every blocked destination, in call order. */
  readonly violations: readonly string[];
  /** Destinations that went to the real network, in call order. */
  readonly networkCalls: readonly string[];
  /** Fails with the destinations rather than a bare boolean. */
  assertNoOutboundCalls(): void;
  restore(): void;
}

type FetchFn = typeof globalThis.fetch;
type RequestFn = typeof http.request;
/** The one shape every `http.request` overload collapses to for the guard. */
type NodeRequestLike = (...args: unknown[]) => http.ClientRequest;

function hostOf(value: string): string | null {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function isLoopbackHost(host: string | null | undefined): boolean {
  if (!host) return false;
  // `host` may carry a port ("127.0.0.1:53421"); the bracketed IPv6 form keeps
  // its brackets, which is why both spellings are in the allow set.
  const withoutPort = host.startsWith("[")
    ? host.slice(0, host.indexOf("]") + 1)
    : (host.split(":")[0] ?? host);
  return LOOPBACK_HOSTS.has(withoutPort);
}

/** Destination of a classic `http.request(...)` call, in any of its arities. */
function nodeRequestDestination(args: unknown[]): string {
  const first = args[0];
  if (typeof first === "string") return first;
  if (first instanceof URL) return first.toString();
  if (first && typeof first === "object") {
    const options = first as {
      hostname?: string;
      host?: string;
      path?: string;
    };
    return `${options.hostname ?? options.host ?? "unknown"}${options.path ?? ""}`;
  }
  return "unknown";
}

function nodeRequestHost(args: unknown[]): string | null {
  const first = args[0];
  if (typeof first === "string") return hostOf(first);
  if (first instanceof URL) return first.hostname;
  if (first && typeof first === "object") {
    const options = first as { hostname?: string; host?: string };
    return options.hostname ?? options.host ?? null;
  }
  return null;
}

export function installOutboundGuard({
  routes = {},
  allowEgress = false,
}: OutboundGuardOptions = {}): OutboundGuard {
  const violations: string[] = [];
  const networkCalls: string[] = [];
  const originalFetch: FetchFn = globalThis.fetch;
  const originalHttpRequest = http.request;
  const originalHttpGet = http.get;
  const originalHttpsRequest = https.request;
  const originalHttpsGet = https.get;

  const block = (destination: string): never => {
    violations.push(destination);
    throw new OutboundCallBlockedError(destination);
  };

  const observe = (destination: string): void => {
    networkCalls.push(destination);
  };

  globalThis.fetch = (async (
    input: Parameters<FetchFn>[0],
    init?: Parameters<FetchFn>[1],
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const host = hostOf(url);
    const route = host ? routes[host] : undefined;
    if (route) return route(url, init);
    if (!isLoopbackHost(host)) {
      if (!allowEgress) block(url);
      observe(url);
    }
    return originalFetch(input, init);
  }) as FetchFn;

  // `http.request` and friends are overloaded four ways; the guard cares about
  // exactly one thing across all of them — the destination — so it inspects
  // the argument list and forwards it untouched.
  const guarded = (original: NodeRequestLike): NodeRequestLike =>
    function guardedRequest(...args: unknown[]): http.ClientRequest {
      const host = nodeRequestHost(args);
      if (!isLoopbackHost(host) && !(host && routes[host])) {
        if (!allowEgress) block(nodeRequestDestination(args));
        observe(nodeRequestDestination(args));
      }
      return original(...args);
    };

  http.request = guarded(originalHttpRequest as NodeRequestLike) as RequestFn;
  http.get = guarded(originalHttpGet as NodeRequestLike) as RequestFn;
  https.request = guarded(
    originalHttpsRequest as NodeRequestLike,
  ) as typeof https.request;
  https.get = guarded(originalHttpsGet as NodeRequestLike) as typeof https.get;

  return {
    violations,
    networkCalls,
    assertNoOutboundCalls(): void {
      if (violations.length > 0) {
        throw new OutboundCallBlockedError(violations.join(", "));
      }
    },
    restore(): void {
      globalThis.fetch = originalFetch;
      http.request = originalHttpRequest;
      http.get = originalHttpGet;
      https.request = originalHttpsRequest;
      https.get = originalHttpsGet;
    },
  };
}
