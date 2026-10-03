import { z } from "zod";

const DocumentSchema = z.object({
  path: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
});
const ObjectSchema = z.object({
  bucket: z.string().min(1),
  storagePath: z.string().min(1),
  generation: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.string()).default({}),
});

/** An export, never a query window: missing collections invalidate the report. */
export const AdmissionMediaInventorySchema = z.object({
  schemaVersion: z.literal("vidra-admission-media-inventory/v1"),
  complete: z.boolean(),
  capturedAt: z.string().datetime(),
  missingSources: z.array(z.string()),
  documents: z.array(DocumentSchema),
  objects: z.array(ObjectSchema),
});

type InventoryObject = z.infer<typeof ObjectSchema>;
export interface AdmissionMediaInspection {
  bucket: string;
  storagePath: string;
  generation: string;
  sizeBytes: number;
  kind: "sketch-snapshot" | "studio-bridge" | "unclassified";
  disposition: "referenced" | "candidate" | "unknown";
  references: string[];
  /** Observation alone can never authorize a storage deletion. */
  deletionAllowed: false;
}

function kindOf(object: InventoryObject): AdmissionMediaInspection["kind"] {
  if (object.metadata.admissionSource === "sketch-snapshot")
    return "sketch-snapshot";
  if (
    object.metadata.studioProjectId &&
    object.metadata.originSessionId &&
    object.metadata.originGenerationId
  )
    return "studio-bridge";
  return "unclassified";
}

function collectStrings(value: unknown, strings: Set<string>): void {
  if (typeof value === "string") {
    strings.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, strings);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, strings);
  }
}

function referenceKeys(value: string): string[] {
  try {
    const url = new URL(value);
    const path = decodeURIComponent(url.pathname);
    if (url.hostname === "storage.googleapis.com")
      return [value, `gs:/${path}`];
    if (url.hostname.endsWith(".storage.googleapis.com"))
      return [
        value,
        `gs://${url.hostname.slice(0, -".storage.googleapis.com".length)}${path}`,
      ];
  } catch {
    // Most values are plain ids and paths, not URLs.
  }
  return [value];
}

function hasInFlightWork(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasInFlightWork);
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (
    typeof record.status === "string" &&
    ["pending", "running", "queued", "processing"].includes(record.status)
  )
    return true;
  return Object.values(record).some(hasInFlightWork);
}

/** Reference reachability across ALL records, including archived and owed takes. */
export function inspectAdmissionMedia(input: unknown): {
  schemaVersion: "vidra-admission-media-report/v1";
  capturedAt: string;
  verified: boolean;
  deletionEnabled: false;
  missingSources: string[];
  inFlightRecords: string[];
  objects: AdmissionMediaInspection[];
} {
  const inventory = AdmissionMediaInventorySchema.parse(input);
  const verified = inventory.complete && inventory.missingSources.length === 0;
  const index = new Map<string, Set<string>>();
  const inFlightRecords = inventory.documents
    .filter((document) => hasInFlightWork(document.data))
    .map((document) => document.path);
  for (const document of inventory.documents) {
    const strings = new Set<string>();
    collectStrings(document.data, strings);
    for (const value of strings) {
      for (const key of referenceKeys(value)) {
        const paths = index.get(key) ?? new Set<string>();
        paths.add(document.path);
        index.set(key, paths);
      }
    }
  }
  return {
    schemaVersion: "vidra-admission-media-report/v1",
    capturedAt: inventory.capturedAt,
    verified,
    deletionEnabled: false,
    missingSources: inventory.missingSources,
    inFlightRecords,
    objects: inventory.objects.map((object) => {
      const basename = object.storagePath.slice(
        object.storagePath.lastIndexOf("/") + 1,
      );
      // Id-only records and colliding ids conservatively protect all matches.
      const keys = [
        object.storagePath,
        `gs://${object.bucket}/${object.storagePath}`,
        basename,
        basename.replace(/\.[^.]+$/, ""),
      ];
      const paths = [
        ...new Set(keys.flatMap((key) => [...(index.get(key) ?? [])])),
      ].sort();
      const kind = kindOf(object);
      return {
        bucket: object.bucket,
        storagePath: object.storagePath,
        generation: object.generation,
        sizeBytes: object.sizeBytes,
        kind,
        disposition: paths.length
          ? "referenced"
          : verified && inFlightRecords.length === 0 && kind !== "unclassified"
            ? "candidate"
            : "unknown",
        references: paths,
        deletionAllowed: false,
      };
    }),
  };
}
