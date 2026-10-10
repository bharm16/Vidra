import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSseWriter } from "../sseBackpressure";

/**
 * Mock Response object shaped after the bits of Node's Writable that the
 * backpressure writer touches. Kept intentionally minimal.
 */
interface MockResponse extends EventEmitter {
  write: (chunk: string) => boolean;
  end: () => void;
  destroy: () => void;
  writableLength: number;
  writableEnded: boolean;
  destroyed: boolean;
  writtenChunks: string[];
}

interface MockResponseOptions {
  /** If set, write() returns false until a drain is emitted. */
  pauseAfterBytes?: number;
  /** Simulated buffered bytes in addition to chunk length. */
  forcedBufferedBytes?: number;
}

function createMockResponse(opts: MockResponseOptions = {}): MockResponse {
  const emitter = new EventEmitter() as MockResponse;
  emitter.writtenChunks = [];
  emitter.writableLength = 0;
  emitter.writableEnded = false;
  emitter.destroyed = false;

  emitter.write = (chunk: string) => {
    if (emitter.writableEnded || emitter.destroyed) return false;
    emitter.writtenChunks.push(chunk);
    emitter.writableLength += Buffer.byteLength(chunk);
    if (opts.forcedBufferedBytes !== undefined) {
      emitter.writableLength = opts.forcedBufferedBytes;
    }
    if (
      opts.pauseAfterBytes !== undefined &&
      emitter.writableLength >= opts.pauseAfterBytes
    ) {
      return false;
    }
    return true;
  };

  emitter.end = () => {
    emitter.writableEnded = true;
  };

  emitter.destroy = () => {
    emitter.destroyed = true;
    emitter.writableEnded = true;
  };

  return emitter;
}

describe("sseBackpressure / createSseWriter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("queues subsequent writes behind a pause and flushes them on 'drain'", async () => {
    const res = createMockResponse({ pauseAfterBytes: 3 });
    const writer = createSseWriter(
      res as unknown as import("http").ServerResponse,
    );
    // First write accepts synchronously but triggers pause.
    const first = await writer.write("abcdef");
    expect(first).toEqual({ ok: true });

    // Second write must queue until drain.
    const secondPromise = writer.write("more");
    let secondSettled = false;
    void secondPromise.then(() => {
      secondSettled = true;
    });
    await new Promise((r) => setImmediate(r));
    expect(secondSettled).toBe(false);
    // Queued write was NOT yet handed to the socket.
    expect(res.writtenChunks).toEqual(["abcdef"]);

    res.writableLength = 0; // simulate kernel accepting the buffered data
    res.emit("drain");
    const secondResult = await secondPromise;
    expect(secondResult).toEqual({ ok: true });
    expect(res.writtenChunks).toEqual(["abcdef", "more"]);
  });

  it("returns ok:false reason:overflow when writableLength exceeds threshold and closes the connection", async () => {
    const res = createMockResponse({ forcedBufferedBytes: 10 });
    const destroySpy = vi.spyOn(res, "destroy");
    const endSpy = vi.spyOn(res, "end");
    const writer = createSseWriter(
      res as unknown as import("http").ServerResponse,
      { maxBufferedBytes: 8 },
    );
    const result = await writer.write("chunk");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("overflow");
    }
    expect(endSpy).toHaveBeenCalled();
    expect(destroySpy).toHaveBeenCalled();
  });

  it("returns ok:false reason:closed when connection is already ended/destroyed", async () => {
    const res = createMockResponse();
    res.end();
    const writer = createSseWriter(
      res as unknown as import("http").ServerResponse,
    );
    const result = await writer.write("chunk");
    expect(result).toEqual({ ok: false, reason: "closed" });
    expect(res.writtenChunks).toEqual([]);
  });

  it("serializes concurrent writes (no interleaving, stable order)", async () => {
    const res = createMockResponse({ pauseAfterBytes: 1 });
    const writer = createSseWriter(
      res as unknown as import("http").ServerResponse,
    );

    const p1 = writer.write("one\n");
    const p2 = writer.write("two\n");
    const p3 = writer.write("three\n");

    // Let first write go pending
    await new Promise((r) => setImmediate(r));
    res.writableLength = 0;
    res.emit("drain");
    await new Promise((r) => setImmediate(r));
    res.writableLength = 0;
    res.emit("drain");
    await new Promise((r) => setImmediate(r));
    res.writableLength = 0;
    res.emit("drain");

    const results = await Promise.all([p1, p2, p3]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(res.writtenChunks).toEqual(["one\n", "two\n", "three\n"]);
  });

  it("trips overflow when pending[] queue would exceed threshold (pending bytes counted)", async () => {
    // Stream stays paused forever (no drain). Without pendingBytes tracking,
    // chunks pile up in the in-JS queue while writableLength stays small —
    // the original bug this task fixes.
    const res = createMockResponse({ pauseAfterBytes: 1 });
    const destroySpy = vi.spyOn(res, "destroy");
    const endSpy = vi.spyOn(res, "end");
    const writer = createSseWriter(
      res as unknown as import("http").ServerResponse,
      { maxBufferedBytes: 20 },
    );

    // First write: accepts synchronously (4 bytes <= threshold), triggers pause.
    const first = await writer.write("aaaa");
    expect(first).toEqual({ ok: true });

    // Next writes queue into pending[]. Second chunk (8 bytes) still fits:
    // writableLength=4, pendingBytes=0, projected=4+0+8=12 <= 20.
    const secondPromise = writer.write("bbbbbbbb");
    // Third chunk (12 bytes) would push total to 4+8+12=24 > 20 → overflow.
    const third = await writer.write("cccccccccccc");

    expect(third.ok).toBe(false);
    if (!third.ok) {
      expect(third.reason).toBe("overflow");
    }
    expect(endSpy).toHaveBeenCalled();
    expect(destroySpy).toHaveBeenCalled();

    // The queued second write should have been failed with overflow when the
    // kill switch fired (failPending called on overflow).
    const secondResult = await secondPromise;
    expect(secondResult).toEqual({ ok: false, reason: "overflow" });
  });

  it("resolves queued writes with reason:closed when writer.close() is called mid-queue", async () => {
    const res = createMockResponse({ pauseAfterBytes: 1 });
    const writer = createSseWriter(
      res as unknown as import("http").ServerResponse,
    );

    // Trigger pause
    const first = await writer.write("hello");
    expect(first).toEqual({ ok: true });

    // Queue a write
    const queuedPromise = writer.write("queued");
    let settled = false;
    void queuedPromise.then(() => {
      settled = true;
    });
    await new Promise((r) => setImmediate(r));
    expect(settled).toBe(false);

    // Close before drain fires
    writer.close();
    const result = await queuedPromise;
    expect(result).toEqual({ ok: false, reason: "closed" });
    // The queued chunk must NOT have been written to the socket after close.
    expect(res.writtenChunks).toEqual(["hello"]);
  });

  it("stops writing after an overflow kill switch fires", async () => {
    const res = createMockResponse({ forcedBufferedBytes: 100 });
    const writer = createSseWriter(
      res as unknown as import("http").ServerResponse,
      { maxBufferedBytes: 10 },
    );
    const first = await writer.write("a");
    expect(first.ok).toBe(false);
    const second = await writer.write("b");
    expect(second).toEqual({ ok: false, reason: "closed" });
  });
});
