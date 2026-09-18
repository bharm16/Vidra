import type { Request, RequestHandler, Response } from "express";
import { logger } from "@infrastructure/Logger";
import { sha256Hex } from "@utils/hash";

const DEFAULT_COALESCING_WINDOW_MS = 100;
const DEFAULT_MAX_PENDING = 1000;
const DEFAULT_HOUSEKEEP_INTERVAL_MS = 5000;

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "content-length",
]);

export interface RequestCoalescingOptions {
  keyScope: string;
  windowMs?: number;
}

type CoalescedResponseKind = "json" | "send" | "end";

type CoalescedResponse = {
  kind: CoalescedResponseKind;
  statusCode: number;
  headers: Record<string, string | string[]>;
  body?: unknown;
};

type PendingEntry = {
  promise: Promise<CoalescedResponse>;
  completedAt: number | null;
  expiresAt: number | null;
};

type RequestWithPrincipal = Request & {
  user?: { uid?: string };
  auth?: { uid?: string };
  userId?: string;
  uid?: string;
};

function hashFingerprint(input: string): string {
  return sha256Hex(input, 32);
}

function parseMaybeJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  const appearsJson =
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"));

  if (!appearsJson) {
    return trimmed;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function stableStringify(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): string {
  if (value === null) {
    return "null";
  }

  const valueType = typeof value;
  if (valueType === "string") {
    return JSON.stringify(value);
  }

  if (valueType === "number" || valueType === "boolean") {
    return JSON.stringify(value);
  }

  if (valueType === "bigint") {
    return JSON.stringify((value as bigint).toString());
  }

  if (valueType === "undefined") {
    return '""';
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item, seen)).join(",")}]`;
  }

  if (Buffer.isBuffer(value)) {
    return stableStringify(parseMaybeJson(value.toString("utf8")), seen);
  }

  if (valueType === "object") {
    const objectValue = value as Record<string, unknown>;
    if (seen.has(objectValue)) {
      return '"[Circular]"';
    }

    seen.add(objectValue);
    const keys = Object.keys(objectValue).sort();
    const entries = keys.map(
      (key) =>
        `${JSON.stringify(key)}:${stableStringify(objectValue[key], seen)}`,
    );
    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(String(value));
}

/**
 * Fast-path canonicalization for parsed JSON objects with a `prompt` field.
 * Avoids the expensive deep-traversal of stableStringify for the common case
 * (optimization requests) by hashing only the differentiating fields.
 */
function tryFastCanonicalizeBody(body: unknown): string | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  const obj = body as Record<string, unknown>;

  // Optimization-request fast path.
  if (typeof obj.prompt === "string") {
    const mode = typeof obj.mode === "string" ? obj.mode : "";
    const targetModel =
      typeof obj.targetModel === "string" ? obj.targetModel : "";
    const skipCache = obj.skipCache === true ? "1" : "0";
    return `fast:${obj.prompt}|${mode}|${targetModel}|${skipCache}`;
  }

  // Span-labeling fast path. Span-labeling requests use `text` instead of
  // `prompt`, so without this branch they fall through to the deep
  // stableStringify with WeakSet recursion guard on every concurrent request.
  if (typeof obj.text === "string") {
    const templateVersion =
      typeof obj.templateVersion === "string" ? obj.templateVersion : "";
    // Policy is a small object with a couple of bool/string fields; a tiny
    // sorted-keys serialization is cheaper than the recursive traversal.
    let policySig = "";
    if (obj.policy && typeof obj.policy === "object") {
      const p = obj.policy as Record<string, unknown>;
      const keys = Object.keys(p).sort();
      policySig = keys.map((k) => `${k}=${String(p[k])}`).join(",");
    }
    return `fast:span:${obj.text}|${templateVersion}|${policySig}`;
  }

  return null;
}

function canonicalizeBody(body: unknown): string {
  const fast = tryFastCanonicalizeBody(body);
  if (fast !== null) {
    return fast;
  }

  if (typeof body === "string") {
    return stableStringify(parseMaybeJson(body));
  }

  if (Buffer.isBuffer(body)) {
    return stableStringify(parseMaybeJson(body.toString("utf8")));
  }

  return stableStringify(body);
}

function resolvePrincipalFingerprint(req: Request): string {
  const request = req as RequestWithPrincipal;
  const principal =
    request.user?.uid ?? request.auth?.uid ?? request.userId ?? request.uid;
  if (typeof principal === "string" && principal.trim().length > 0) {
    return `principal:${principal.trim()}`;
  }

  const authorization = req.get("authorization") ?? "";
  const apiKey = req.get("x-api-key") ?? "";
  const firebaseToken = req.get("x-firebase-token") ?? "";
  return `credentials:${authorization}|${apiKey}|${firebaseToken}`;
}

function normalizeHeaders(res: Response): Record<string, string | string[]> {
  const headers = res.getHeaders();
  const normalized: Record<string, string | string[]> = {};

  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || value === null) {
      continue;
    }

    const lowerName = name.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lowerName)) {
      continue;
    }

    if (Array.isArray(value)) {
      normalized[lowerName] = value.map((entry) => String(entry));
      continue;
    }

    normalized[lowerName] = String(value);
  }

  return normalized;
}

function isStreamingRequest(req: Request): boolean {
  const path = `${req.baseUrl ?? ""}${req.path ?? ""}`.toLowerCase();
  if (path.includes("/stream")) {
    return true;
  }

  const acceptHeader = String(req.headers.accept ?? "").toLowerCase();
  if (
    acceptHeader.includes("text/event-stream") ||
    acceptHeader.includes("application/x-ndjson")
  ) {
    return true;
  }

  const contentType = String(req.headers["content-type"] ?? "").toLowerCase();
  return (
    contentType.includes("text/event-stream") ||
    contentType.includes("application/x-ndjson")
  );
}

export interface RequestCoalescingMiddlewareOptions {
  /** Hard cap on pending entries. Oldest is evicted (FIFO) on overflow. */
  maxPending?: number;
  /** Interval (ms) for the independent housekeeper sweep of expired entries. */
  housekeepIntervalMs?: number;
}

/**
 * Structural slice of {@link MetricsService} this middleware depends on.
 *
 * Source of truth: `recordCoalescedRequest` in
 * `server/src/infrastructure/MetricsService.ts`. If that signature changes,
 * update this interface to match. We use a structural type here (rather than
 * importing MetricsService directly) to avoid pulling Prometheus client deps
 * into the middleware module — the middleware is constructed at module load
 * via the exported singleton, before DI is initialized.
 */
interface CoalescingMetricsCollector {
  recordCoalescedRequest(type?: string): void;
}

export class RequestCoalescingMiddleware {
  private pendingRequests: Map<string, PendingEntry>;
  private stats: { coalesced: number; unique: number; totalSaved: number };
  private cleanupTimer: ReturnType<typeof setTimeout> | null;
  private housekeepTimer: ReturnType<typeof setInterval> | null;
  private readonly maxPending: number;
  private readonly housekeepIntervalMs: number;
  // Optional Prometheus collector — wired from DI bootstrap so the existing
  // singleton (imported directly by routes) doesn't need a constructor change.
  private metricsCollector: CoalescingMetricsCollector | null = null;

  constructor(options: RequestCoalescingMiddlewareOptions = {}) {
    this.pendingRequests = new Map();
    this.stats = {
      coalesced: 0,
      unique: 0,
      totalSaved: 0,
    };
    this.cleanupTimer = null;
    this.housekeepTimer = null;
    this.maxPending = Math.max(1, options.maxPending ?? DEFAULT_MAX_PENDING);
    this.housekeepIntervalMs = Math.max(
      1,
      options.housekeepIntervalMs ?? DEFAULT_HOUSEKEEP_INTERVAL_MS,
    );
    this.startHousekeeper();
  }

  /**
   * Start the independent housekeeper interval that sweeps expired entries.
   * Idempotent: a no-op if the timer is already running.
   */
  startHousekeeper(): void {
    if (this.housekeepTimer) {
      return;
    }
    const handle = setInterval(() => {
      this._cleanupCompletedRequests();
    }, this.housekeepIntervalMs);
    if (typeof handle.unref === "function") {
      handle.unref();
    }
    this.housekeepTimer = handle;
  }

  /**
   * Stop the independent housekeeper interval. Idempotent: safe to call when
   * not running. Terminal for the housekeeper; prefer `dispose()` for full
   * shutdown of the middleware instance.
   */
  stopHousekeeper(): void {
    if (!this.housekeepTimer) {
      return;
    }
    clearInterval(this.housekeepTimer);
    this.housekeepTimer = null;
  }

  /**
   * Wire a Prometheus counter so each coalesced request increments
   * `coalesced_requests_total{type}`. Called once during DI bootstrap.
   */
  setMetricsCollector(collector: CoalescingMetricsCollector | null): void {
    this.metricsCollector = collector;
  }

  /**
   * Snapshot of current pending-map occupancy and the configured hard cap.
   */
  capacityStats(): { pending: number; maxPending: number } {
    return {
      pending: this.pendingRequests.size,
      maxPending: this.maxPending,
    };
  }

  // Relies on Map insertion-order stability: Map.set() on an existing key
  // preserves the original position, so we get FIFO eviction, not LRU.
  private evictOldestIfAtCapacity(): void {
    if (this.pendingRequests.size < this.maxPending) {
      return;
    }
    const oldestKey = this.pendingRequests.keys().next().value;
    if (oldestKey === undefined) {
      return;
    }
    this.pendingRequests.delete(oldestKey);
    logger.warn("Request coalescing pending map at capacity; evicted oldest", {
      maxPending: this.maxPending,
      evictedKey: oldestKey,
    });
  }

  generateKey(req: Request, options: RequestCoalescingOptions): string {
    const principalHash = hashFingerprint(resolvePrincipalFingerprint(req));
    const bodyHash = hashFingerprint(canonicalizeBody(req.body));

    return `${req.method}:${options.keyScope}:${principalHash}:${bodyHash}`;
  }

  middleware(options: RequestCoalescingOptions): RequestHandler {
    if (!options?.keyScope || options.keyScope.trim().length === 0) {
      throw new Error("request coalescing requires a non-empty keyScope");
    }

    const coalescingWindowMs = Math.max(
      1,
      options.windowMs ?? DEFAULT_COALESCING_WINDOW_MS,
    );

    return async (req, res, next): Promise<void> => {
      if (req.method !== "POST" || isStreamingRequest(req)) {
        next();
        return;
      }

      const requestKey = this.generateKey(req, options);
      const pendingEntry = this.pendingRequests.get(requestKey);

      if (pendingEntry && pendingEntry.completedAt === null) {
        this.stats.coalesced++;
        this.stats.totalSaved++;
        this.metricsCollector?.recordCoalescedRequest("middleware");

        logger.debug("Request coalesced", {
          requestId: req.id,
          keyScope: options.keyScope,
          path: req.path,
        });

        try {
          const snapshot = await pendingEntry.promise;
          this.applySnapshot(res, snapshot);
          return;
        } catch (error) {
          next(error);
          return;
        }
      }

      this.stats.unique++;

      let resolvePromise: (value: CoalescedResponse) => void = () => undefined;
      let rejectPromise: (reason?: unknown) => void = () => undefined;

      const requestPromise = new Promise<CoalescedResponse>(
        (resolve, reject) => {
          resolvePromise = resolve;
          rejectPromise = reject;
        },
      );

      // A rejection with no waiter is normal, not an error: the leader rejects
      // this promise when the client disconnects before the handler wrote
      // anything, and no second request need ever have joined the window. With
      // no handler attached that became an unhandled rejection, which the
      // classifier treats as fatal — so a browser navigating away killed the
      // API server. Marking it handled here does not swallow anything: a real
      // waiter attaches its own handler at `await pendingEntry.promise` and
      // still sees the rejection.
      requestPromise.catch(() => undefined);

      this.evictOldestIfAtCapacity();
      this.pendingRequests.set(requestKey, {
        promise: requestPromise,
        completedAt: null,
        expiresAt: null,
      });

      let settled = false;
      const settleSuccess = (snapshot: CoalescedResponse): void => {
        if (settled) {
          return;
        }
        settled = true;

        resolvePromise(snapshot);

        const entry = this.pendingRequests.get(requestKey);
        if (entry) {
          const now = Date.now();
          entry.completedAt = now;
          entry.expiresAt = now + coalescingWindowMs;
        }

        this._scheduleCleanup(coalescingWindowMs);
      };

      const settleFailure = (error: unknown): void => {
        if (settled) {
          return;
        }
        settled = true;
        rejectPromise(error);
        this.pendingRequests.delete(requestKey);
      };

      const captureSnapshot = (
        kind: CoalescedResponseKind,
        body?: unknown,
      ): CoalescedResponse => ({
        kind,
        body,
        statusCode: res.statusCode,
        headers: normalizeHeaders(res),
      });

      const originalJson = res.json.bind(res);
      const wrappedJson: Response["json"] = (...args) => {
        settleSuccess(captureSnapshot("json", args[0]));
        return originalJson(...args);
      };
      res.json = wrappedJson;

      const originalSend = res.send.bind(res);
      const wrappedSend: Response["send"] = (...args) => {
        settleSuccess(captureSnapshot("send", args[0]));
        return originalSend(...args);
      };
      res.send = wrappedSend;

      const originalEnd = res.end.bind(res);
      const wrappedEnd = ((
        chunk?: unknown,
        encoding?: BufferEncoding | (() => void),
        cb?: () => void,
      ) => {
        settleSuccess(captureSnapshot("end", chunk));

        if (typeof encoding === "function") {
          return originalEnd(chunk as never, encoding);
        }

        if (encoding === undefined) {
          return originalEnd(chunk as never, cb);
        }

        return originalEnd(chunk as never, encoding, cb);
      }) as Response["end"];
      res.end = wrappedEnd;

      res.once("error", (error) => {
        settleFailure(error);
      });

      res.once("close", () => {
        if (!res.writableEnded) {
          settleFailure(
            new Error(
              `Coalesced request closed before completion: ${req.path}`,
            ),
          );
        }
      });

      next();
    };
  }

  private applySnapshot(res: Response, snapshot: CoalescedResponse): void {
    res.status(snapshot.statusCode);

    for (const [name, value] of Object.entries(snapshot.headers)) {
      res.setHeader(name, value);
    }

    if (snapshot.kind === "json") {
      res.json(snapshot.body);
      return;
    }

    if (snapshot.kind === "send") {
      res.send(snapshot.body as never);
      return;
    }

    res.end(snapshot.body as never);
  }

  _cleanupCompletedRequests(): void {
    const now = Date.now();

    for (const [key, entry] of this.pendingRequests.entries()) {
      if (entry.expiresAt !== null && now >= entry.expiresAt) {
        this.pendingRequests.delete(key);
      }
    }
  }

  _hasCompletedEntries(): boolean {
    for (const entry of this.pendingRequests.values()) {
      if (entry.expiresAt !== null) {
        return true;
      }
    }
    return false;
  }

  _scheduleCleanup(intervalMs: number = DEFAULT_COALESCING_WINDOW_MS): void {
    if (this.cleanupTimer) {
      return;
    }

    this.cleanupTimer = setTimeout(() => {
      this.cleanupTimer = null;
      this._cleanupCompletedRequests();
      if (this._hasCompletedEntries()) {
        this._scheduleCleanup(intervalMs);
      }
    }, intervalMs);
  }

  getStats(): {
    coalesced: number;
    unique: number;
    totalSaved: number;
    total: number;
    coalescingRate: string;
    activePending: number;
  } {
    const total = this.stats.coalesced + this.stats.unique;
    const coalescingRate = total > 0 ? (this.stats.coalesced / total) * 100 : 0;

    return {
      ...this.stats,
      total,
      coalescingRate: `${coalescingRate.toFixed(2)}%`,
      activePending: this.pendingRequests.size,
    };
  }

  resetStats(): void {
    this.stats = {
      coalesced: 0,
      unique: 0,
      totalSaved: 0,
    };
  }

  /**
   * Runtime-safe reset. Clears pending entries and cancels any short-term
   * cleanup timer, but leaves the independent housekeeper running so the
   * middleware continues to function. Use `dispose()` for terminal shutdown.
   */
  clear(): void {
    this.pendingRequests.clear();
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Terminal shutdown. Clears pending state and stops the housekeeper. After
   * `dispose()` the instance should not be reused without first calling
   * `startHousekeeper()` again. Intended for process shutdown and test teardown.
   */
  dispose(): void {
    this.clear();
    this.stopHousekeeper();
  }
}

/**
 * Default singleton used by production routes. Instantiation auto-starts the
 * 5-second housekeeper interval at import time. Tests that need fake timers
 * for this module should instantiate a fresh `RequestCoalescingMiddleware`
 * instance rather than relying on this singleton, to avoid a real timer
 * leaking into the fake-timer clock.
 */
export const requestCoalescing = new RequestCoalescingMiddleware();
