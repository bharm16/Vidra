import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * The storage-adapter conformance contract (issue #138).
 *
 * ONE body of behavioural assertions that EVERY image-store and storage
 * implementation must satisfy — the production `GcsImageAssetStore` and
 * `StorageService` (run against a controlled bucket) and the cross-mode
 * doubles alike. Its purpose is to keep a test double from quietly diverging
 * from production in a way that hides a bug offline: the divergences that
 * prompted this suite were a content-addressed identity where production mints
 * fresh ids, a different path namespace, and non-expiring URLs.
 *
 * Each concrete store is adapted to the small `ConformanceOps` port and
 * described by a `ConformanceSpec` of its static facts. The axes below are the
 * ticket's list — identity, namespace and ownership, URL expiry, serialization
 * round trips, write conflicts, and failure semantics.
 *
 * The suite NEVER lets a double be more permissive or more naturally
 * deduplicating than production: the identity axis is mandatory for every
 * subject, and `assertMintsDistinctObjects` is exported so the mutation check
 * can prove a deliberately-deduplicating double fails it.
 */

/** A durable handle to a stored object, normalised across every adapter. */
export interface ConformanceHandle {
  /** The object's identity as the adapter reports it (production: a fresh id). */
  id: string;
  /** The durable path the object lives at — its namespace. */
  storagePath: string;
  /** A read URL for the object. */
  url: string;
  /** When the read URL stops working, if the adapter issues expiring URLs. */
  expiresAtMs?: number;
}

/** The operations the conformance suite drives, per adapter. */
export interface ConformanceOps {
  /** Persist bytes for an owner and report the durable handle. */
  store(bytes: Buffer, owner: string): Promise<ConformanceHandle>;
  /** Resolve a fresh read URL for an object the owner persisted. */
  resolveOwn(handle: ConformanceHandle, owner: string): Promise<string | null>;
  /**
   * Attempt to resolve `handle` as a DIFFERENT owner. Resolves to the URL if
   * the adapter (wrongly) grants it, resolves to null if it refuses by
   * returning null, or rejects if it refuses by throwing.
   */
  resolveCrossOwner(
    handle: ConformanceHandle,
    otherOwner: string,
  ): Promise<string | null>;
  /**
   * Resolve an object that was never stored (honest 404 → null). Present only
   * on adapters that expose a presence-checking read.
   */
  resolveAbsent?(owner: string): Promise<string | null>;
  /** Release any resources the adapter acquired (e.g. a temp directory). */
  teardown?(): Promise<void>;
}

/** The static facts about one adapter, and how to build a fresh instance. */
export interface ConformanceSpec {
  readonly name: string;
  /** Does this adapter issue URLs that expire? GCS/StorageService: yes; Local: no. */
  readonly urlsExpire: boolean;
  /** How the adapter refuses a cross-owner read. */
  readonly crossOwnerRefusal: "null" | "throws";
  /** Whether the adapter can resolve a never-stored object to null. */
  readonly supportsAbsentProbe: boolean;
  /** Whether a blank owner is refused (the `ownerSegment` guard). */
  readonly refusesBlankOwner: boolean;
  /** The prefix every object of `owner` must live under. */
  namespacePrefix(owner: string): string;
  /** Build a fresh, isolated instance of the adapter. */
  make(): Promise<ConformanceOps>;
}

/** Two distinct owners, both valid `ownerSegment`s. */
export const CONFORMANCE_OWNER = "conformance-owner-a";
export const CONFORMANCE_OTHER_OWNER = "conformance-owner-b";

/** Fixed bytes, reused so a content-addressed store would collide on a re-store. */
export const CONFORMANCE_BYTES = Buffer.from(
  "conformance-image-bytes-identical-across-every-store",
);

/**
 * A read URL is expiring, not permanent: its death is in the future and within
 * a day. A permanent handle (year-2100, or an absent expiry the store claimed
 * to have) fails this — the "non-expiring URL" bug the suite exists to catch.
 */
const MAX_URL_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The identity + no-clobber core: storing the same bytes twice mints two
 * distinct objects, and both survive independently.
 *
 * Exported because the mutation check runs it against a deliberately
 * content-addressed store and confirms it turns red.
 */
export async function assertMintsDistinctObjects(
  ops: ConformanceOps,
  name: string,
  owner: string = CONFORMANCE_OWNER,
): Promise<void> {
  const first = await ops.store(CONFORMANCE_BYTES, owner);
  const second = await ops.store(CONFORMANCE_BYTES, owner);

  // Production mints a fresh id per store and NEVER content-addresses.
  expect(
    second.id,
    `${name}: reused an object id for identical bytes (content-addressed?)`,
  ).not.toBe(first.id);
  expect(
    second.storagePath,
    `${name}: reused a storage path for identical bytes (content-addressed?)`,
  ).not.toBe(first.storagePath);

  // No-clobber: the second store did not overwrite the first — both resolve.
  const firstUrl = await ops.resolveOwn(first, owner);
  const secondUrl = await ops.resolveOwn(second, owner);
  expect(
    firstUrl,
    `${name}: lost the first object after a re-store`,
  ).toBeTruthy();
  expect(
    secondUrl,
    `${name}: could not resolve the second object`,
  ).toBeTruthy();
}

/**
 * Register the conformance suite for one adapter. Call once per subject; the
 * shared assertion bodies are what make this "one conformance suite".
 */
export function runStorageAdapterConformance(spec: ConformanceSpec): void {
  describe(spec.name, () => {
    let ops: ConformanceOps;

    beforeEach(async () => {
      ops = await spec.make();
    });

    afterEach(async () => {
      await ops.teardown?.();
    });

    it("identity: repeated stores of identical bytes mint distinct objects", async () => {
      await assertMintsDistinctObjects(ops, spec.name);
    });

    it("namespace: an object is filed under its owner's prefix, and no other owner's", async () => {
      const handle = await ops.store(CONFORMANCE_BYTES, CONFORMANCE_OWNER);
      expect(
        handle.storagePath.startsWith(spec.namespacePrefix(CONFORMANCE_OWNER)),
      ).toBe(true);
      expect(
        handle.storagePath.startsWith(
          spec.namespacePrefix(CONFORMANCE_OTHER_OWNER),
        ),
      ).toBe(false);
    });

    it("ownership: a cross-owner read is refused, never granted", async () => {
      const handle = await ops.store(CONFORMANCE_BYTES, CONFORMANCE_OWNER);
      if (spec.crossOwnerRefusal === "throws") {
        await expect(
          ops.resolveCrossOwner(handle, CONFORMANCE_OTHER_OWNER),
        ).rejects.toThrow();
      } else {
        await expect(
          ops.resolveCrossOwner(handle, CONFORMANCE_OTHER_OWNER),
        ).resolves.toBeNull();
      }
    });

    it("url expiry: the store reports when its read url dies", async () => {
      const before = Date.now();
      const handle = await ops.store(CONFORMANCE_BYTES, CONFORMANCE_OWNER);
      expect(
        handle.url,
        `${spec.name}: stored object has no read url`,
      ).toBeTruthy();
      if (spec.urlsExpire) {
        expect(typeof handle.expiresAtMs).toBe("number");
        const expiresAtMs = handle.expiresAtMs ?? 0;
        expect(expiresAtMs).toBeGreaterThan(before);
        expect(expiresAtMs).toBeLessThanOrEqual(Date.now() + MAX_URL_TTL_MS);
        // The read url is a signed handle, not the bare durable path.
        expect(handle.url).not.toBe(handle.storagePath);
      }
    });

    it("serialization round trip: the durable handle survives JSON and re-resolves", async () => {
      const handle = await ops.store(CONFORMANCE_BYTES, CONFORMANCE_OWNER);
      const revived = JSON.parse(JSON.stringify(handle)) as ConformanceHandle;
      expect(revived).toEqual(handle);
      // The live url may be gone; only the persisted handle remains. It must
      // still yield a working url — the property a non-expiring double hides,
      // because its permanent url lets a "persist the url, never refresh" bug
      // read as correct offline.
      const reresolved = await ops.resolveOwn(revived, CONFORMANCE_OWNER);
      expect(
        reresolved,
        `${spec.name}: a persisted handle no longer resolves`,
      ).toBeTruthy();
    });

    it("write conflict: a re-store never clobbers the first object", async () => {
      const first = await ops.store(CONFORMANCE_BYTES, CONFORMANCE_OWNER);
      const firstUrlBefore = await ops.resolveOwn(first, CONFORMANCE_OWNER);
      await ops.store(CONFORMANCE_BYTES, CONFORMANCE_OWNER);
      const firstUrlAfter = await ops.resolveOwn(first, CONFORMANCE_OWNER);
      // The first object is still there after the second store landed.
      expect(firstUrlBefore).toBeTruthy();
      expect(firstUrlAfter).toBeTruthy();
    });

    if (spec.refusesBlankOwner) {
      it("failure semantics: a blank owner is refused", async () => {
        await expect(ops.store(CONFORMANCE_BYTES, "")).rejects.toThrow();
      });
    }

    if (spec.supportsAbsentProbe) {
      it("failure semantics: a missing object resolves to null, not a fabricated url", async () => {
        const resolveAbsent = ops.resolveAbsent;
        expect(
          resolveAbsent,
          `${spec.name}: declared an absent probe but has none`,
        ).toBeDefined();
        await expect(resolveAbsent?.(CONFORMANCE_OWNER)).resolves.toBeNull();
      });
    }
  });
}
