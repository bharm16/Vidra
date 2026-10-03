import "dotenv/config";
import { writeFileSync } from "node:fs";
import { Storage } from "@google-cloud/storage";
import { getFirestore } from "../../server/src/infrastructure/firebaseAdmin.ts";
import type { CollectionReference } from "firebase-admin/firestore";

/** Read-only full export. listDocuments includes missing parents with subcollections. */
async function main(): Promise<void> {
  const [output, ...bucketArgs] = process.argv.slice(2);
  const buckets = [...new Set(bucketArgs)];
  if (
    !output ||
    output.startsWith("-") ||
    !buckets.length ||
    buckets.some((bucket) => bucket.startsWith("-"))
  ) {
    throw new Error(
      "Usage: npx tsx scripts/ops/export-admission-media-inventory.ts <new-inventory.json> <bucket> [bucket...]",
    );
  }
  const documents: { path: string; data: Record<string, unknown> }[] = [];
  const visit = async (collection: CollectionReference): Promise<void> => {
    for (const reference of await collection.listDocuments()) {
      const snapshot = await reference.get();
      if (snapshot.exists)
        documents.push({ path: reference.path, data: snapshot.data() ?? {} });
      for (const child of await reference.listCollections()) await visit(child);
    }
  };
  for (const collection of await getFirestore().listCollections())
    await visit(collection);
  const storage = new Storage();
  const objects: {
    bucket: string;
    storagePath: string;
    generation: string;
    sizeBytes: number;
    metadata: Record<string, string>;
  }[] = [];
  for (const bucket of buckets) {
    const [files] = await storage.bucket(bucket).getFiles();
    for (const file of files) {
      const [metadata] = await file.getMetadata();
      if (!metadata.generation || metadata.size === undefined)
        throw new Error(`Incomplete metadata for ${bucket}/${file.name}`);
      objects.push({
        bucket,
        storagePath: file.name,
        generation: String(metadata.generation),
        sizeBytes: Number(metadata.size),
        metadata: Object.fromEntries(
          Object.entries(metadata.metadata ?? {}).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        ),
      });
    }
  }
  writeFileSync(
    output,
    JSON.stringify(
      {
        schemaVersion: "vidra-admission-media-inventory/v1",
        complete: true,
        capturedAt: new Date().toISOString(),
        missingSources: [],
        documents,
        objects,
      },
      null,
      2,
    ),
    { flag: "wx", mode: 0o600 },
  );
}

main().catch((error: unknown): void => {
  console.error(
    error instanceof Error ? error.message : "Inventory export failed",
  );
  process.exitCode = 2;
});
