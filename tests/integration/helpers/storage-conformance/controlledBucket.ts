import type { Bucket, Storage } from "@google-cloud/storage";
import { Writable } from "node:stream";

/**
 * A process-local stand-in for a Google Cloud Storage bucket.
 *
 * The production storage adapters (`GcsImageAssetStore`, `StorageService`, the
 * `SignedUrlMinter`) are the REAL classes in the conformance suite — id
 * minting, path building, precondition writes and expiry all run their own
 * code. Only the bucket underneath them is controlled, standing exactly where
 * GCS stands. This is the "controlled bucket" the ticket permits in place of an
 * emulator, and it is what CI's `integration-firestore` job has to use: that
 * job starts only the Firestore emulator, never a Storage one.
 *
 * It is stateful on purpose — a `save` makes the object `exists()`, and a
 * missing object `getMetadata()`s to a 404 — so the adapters' own honest-404
 * and ownership paths are exercised rather than stubbed.
 */

interface SaveOptions {
  contentType?: string;
  metadata?: {
    contentType?: string;
    cacheControl?: string;
    metadata?: Record<string, unknown>;
  };
  resumable?: boolean;
  validation?: boolean;
  preconditionOpts?: { ifGenerationMatch?: number };
}

interface SignedUrlConfig {
  version?: string;
  action?: string;
  expires?: number | string | Date;
  responseDisposition?: string;
  contentType?: string;
  extensionHeaders?: Record<string, string>;
}

interface ControlledObject {
  buffer: Buffer;
  contentType: string;
  createdAtMs: number;
  generation: number;
}

/** GCS reports a create-only precondition miss as a 412. */
const PRECONDITION_FAILED = 412;

function gcsError(message: string, code: number): Error {
  const error = new Error(message) as Error & { code: number };
  error.code = code;
  return error;
}

/** One object in the controlled bucket, addressed by its path. */
class ControlledFile {
  constructor(
    private readonly objects: Map<string, ControlledObject>,
    readonly name: string,
    private readonly bucketName: string,
  ) {}

  save(buffer: Buffer, options: SaveOptions = {}): Promise<void> {
    const existing = this.objects.get(this.name);
    // `ifGenerationMatch: 0` is a create-only write: GCS refuses it when the
    // object already exists. Both production adapters write with it, so a store
    // that reused a path (a content-addressed double) would collide here rather
    // than silently overwriting — the write-conflict guarantee, at the bucket.
    if (options.preconditionOpts?.ifGenerationMatch === 0 && existing) {
      return Promise.reject(
        gcsError(
          `Precondition failed: object ${this.name} already exists`,
          PRECONDITION_FAILED,
        ),
      );
    }
    const contentType =
      options.contentType ??
      options.metadata?.contentType ??
      "application/octet-stream";
    this.objects.set(this.name, {
      buffer: Buffer.from(buffer),
      contentType,
      createdAtMs: Date.now(),
      generation: (existing?.generation ?? 0) + 1,
    });
    return Promise.resolve();
  }

  /**
   * The SDK's streaming write, piped through by `UploadService.uploadFromUrl`
   * (the URL intake the studio bridge copies through). Chunks are accumulated
   * and land exactly as `save` lands them — same precondition, same metadata —
   * so a streamed write cannot diverge from a buffered one.
   */
  createWriteStream(options: SaveOptions = {}): Writable {
    const chunks: Buffer[] = [];
    return new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
      final: (callback) => {
        this.save(Buffer.concat(chunks), options).then(
          () => callback(),
          (error: Error) => callback(error),
        );
      },
    });
  }

  exists(): Promise<[boolean]> {
    return Promise.resolve([this.objects.has(this.name)]);
  }

  getMetadata(): Promise<
    [{ size: string; contentType: string; timeCreated: string }]
  > {
    const object = this.objects.get(this.name);
    if (!object) {
      return Promise.reject(gcsError(`No such object: ${this.name}`, 404));
    }
    return Promise.resolve([
      {
        size: String(object.buffer.byteLength),
        contentType: object.contentType,
        timeCreated: new Date(object.createdAtMs).toISOString(),
      },
    ]);
  }

  /**
   * Sign like the SDK: GCS signs even for absent objects (the minter gates
   * presence separately), and every mint site here asks for v4. We emit the v4
   * URL shape — distinct per object path and carrying the requested expiry — so
   * a v2 mint site would be visibly different, matching `fakeGcsSigning`.
   */
  getSignedUrl(config: SignedUrlConfig): Promise<[string]> {
    const expiresMs =
      typeof config.expires === "number"
        ? config.expires
        : config.expires instanceof Date
          ? config.expires.getTime()
          : Number(config.expires ?? 0);
    const ttlSeconds = Math.max(0, Math.round((expiresMs - Date.now()) / 1000));
    const query = new URLSearchParams({
      "X-Goog-Algorithm": "GOOG4-RSA-SHA256",
      "X-Goog-Expires": String(ttlSeconds),
      "X-Goog-SignedHeaders": "host",
      "X-Goog-Signature": "conformance-signature",
    });
    if (config.responseDisposition) {
      query.set("response-content-disposition", config.responseDisposition);
    }
    return Promise.resolve([
      `https://storage.googleapis.com/${this.bucketName}/${this.name}?${query.toString()}`,
    ]);
  }

  delete(): Promise<void> {
    this.objects.delete(this.name);
    return Promise.resolve();
  }
}

/** A GCS bucket, in memory. Its files share one object map, so state is real. */
export class ControlledBucket {
  private readonly objects = new Map<string, ControlledObject>();

  constructor(readonly name: string = "conformance-bucket") {}

  file(objectPath: string): ControlledFile {
    return new ControlledFile(this.objects, objectPath, this.name);
  }

  getFiles(options: { prefix?: string } = {}): Promise<[ControlledFile[]]> {
    const prefix = options.prefix ?? "";
    const matches = [...this.objects.keys()]
      .filter((path) => path.startsWith(prefix))
      .map((path) => this.file(path));
    return Promise.resolve([matches]);
  }

  /** How many distinct objects the bucket holds (the no-clobber probe). */
  get objectCount(): number {
    return this.objects.size;
  }

  /**
   * Read an object's bytes and content type back, or `undefined` when absent.
   *
   * The conformance suite never needs this (its adapters do the reading);
   * the real-adapter cross-mode suite uses it to serve the bucket over the
   * outbound guard's route table, the way a signed-URL GET is served.
   */
  read(
    objectPath: string,
  ): { buffer: Buffer; contentType: string } | undefined {
    const object = this.objects.get(objectPath);
    if (!object) return undefined;
    return { buffer: Buffer.from(object.buffer), contentType: object.contentType };
  }
}

/** The controlled bucket, typed as the SDK `Bucket` the adapters accept. */
export function asBucket(bucket: ControlledBucket): Bucket {
  return bucket as unknown as Bucket;
}

/** A `Storage` whose `.bucket()` always returns the one controlled bucket. */
export function controlledStorage(bucket: ControlledBucket): Storage {
  return { bucket: () => asBucket(bucket) } as unknown as Storage;
}
