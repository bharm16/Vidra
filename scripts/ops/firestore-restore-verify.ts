import { readFile, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";

const resource = z.string().min(1).refine(value => value.split("/").every(part => part.length > 0 && part !== "." && part !== ".." && ![...part].some(character => character.charCodeAt(0) < 32)));
const Expectations = z.strictObject({
  projectId: z.string().regex(/^demo-[a-z0-9-]+$/),
  collections: z.array(z.strictObject({ path: resource.refine(value => value.split("/").length % 2 === 1), count: z.number().int().min(0) })).min(1),
  documents: z.array(z.strictObject({ path: resource.refine(value => value.split("/").length % 2 === 0), fields: z.record(z.string().min(1), z.unknown()).refine(value => Object.keys(value).length > 0) })).min(1),
}).refine(value => value.collections.some(collection => collection.count > 0), "Acceptance must include a nonempty collection");
const Document = z.object({ fields: z.record(z.string(), z.unknown()) });
const Page = z.object({ documents: z.array(Document).optional(), nextPageToken: z.string().optional() });
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function decode(value: unknown): unknown {
  if (!record(value)) throw new Error("Invalid Firestore field");
  if ("nullValue" in value) return null;
  for (const key of ["stringValue", "timestampValue", "referenceValue", "bytesValue", "booleanValue"]) if (key in value) return value[key];
  if ("integerValue" in value || "doubleValue" in value) {
    const number = Number(value.integerValue ?? value.doubleValue);
    if (!Number.isSafeInteger(number) && "integerValue" in value) throw new Error("Acceptance cannot compare an unsafe integer");
    return number;
  }
  if (record(value.mapValue)) return decodeFields(value.mapValue.fields ?? {});
  if (record(value.arrayValue)) return z.array(z.unknown()).parse(value.arrayValue.values ?? []).map(decode);
  if (record(value.geoPointValue)) return value.geoPointValue;
  throw new Error("Unsupported Firestore field value");
}
function decodeFields(value: unknown): Record<string, unknown> {
  if (!record(value)) throw new Error("Invalid document fields");
  return Object.fromEntries(Object.entries(value).map(([key, field]) => [key, decode(field)]));
}
function required(name: string): string { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; }
async function main(): Promise<void> {
  const expectations = Expectations.parse(JSON.parse(await readFile(required("VIDRA_RESTORE_EXPECTATIONS"), "utf8")) as unknown);
  const project = required("VIDRA_RESTORE_PROJECT");
  if (expectations.projectId !== project) throw new Error("Acceptance project does not match the selected emulator project");
  const host = required("VIDRA_RESTORE_HOST");
  const origin = new URL(`http://${host}`);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) || !origin.port || origin.pathname !== "/" || origin.username || origin.password || origin.search || origin.hash) throw new Error("Restore requires an explicit loopback emulator host and port");
  if (process.argv.includes("--validate")) {
    await writeFile(required("VIDRA_RESTORE_CONFIG"), JSON.stringify({ emulators: { firestore: { host: origin.hostname, port: Number(origin.port) }, ui: { enabled: false }, singleProjectMode: true } }));
    return;
  }
  const token = required("VIDRA_RESTORE_TOKEN");
  const proofPath = required("VIDRA_RESTORE_PROOF");
  if (process.argv.includes("--proof")) {
    const proof = z.object({ token: z.literal(token), projectId: z.literal(project), verified: z.literal(true) }).parse(JSON.parse(await readFile(proofPath, "utf8")) as unknown);
    console.log(`Emulator restore verified for ${proof.projectId}: expected collection counts and document fields match.`);
    return;
  }
  // firebase emulators:exec supplies this only after importing into its new instance.
  if (process.env.FIRESTORE_EMULATOR_HOST !== host) throw new Error("The verifier is not attached to the selected emulator");
  const signal = AbortSignal.timeout(10 * 60_000);
  const documents = new URL(`/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents/`, origin);
  const get = async (path: string, token?: string, listing = false): Promise<unknown> => {
    const url = new URL(path.split("/").map(encodeURIComponent).join("/"), documents);
    if (listing) url.searchParams.set("pageSize", "1000");
    if (token) url.searchParams.set("pageToken", token);
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Restore acceptance read failed (${response.status})`);
    return response.json() as Promise<unknown>;
  };
  for (const collection of expectations.collections) {
    let count = 0; let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const page = Page.parse(await get(collection.path, cursor, true)); count += page.documents?.length ?? 0;
      if (count > collection.count) throw new Error(`Count mismatch for ${collection.path}`);
      cursor = page.nextPageToken;
      if (cursor && seen.has(cursor)) throw new Error("Restore acceptance cursor did not advance");
      if (cursor) seen.add(cursor);
    } while (cursor);
    if (count !== collection.count) throw new Error(`Count mismatch for ${collection.path}: expected ${collection.count}, got ${count}`);
  }
  for (const sample of expectations.documents) {
    const fields = decodeFields(Document.parse(await get(sample.path)).fields);
    for (const [field, expected] of Object.entries(sample.fields)) {
      const actual = field.split(".").reduce<unknown>((value, part) => record(value) ? value[part] : undefined, fields);
      if (!isDeepStrictEqual(actual, expected)) throw new Error(`Document acceptance mismatch: ${sample.path} / ${field}`);
    }
  }
  await writeFile(proofPath, JSON.stringify({ token, projectId: project, verified: true }));
}
void main().catch((failure: unknown) => { console.error(failure instanceof Error ? failure.message : "Restore acceptance failed"); process.exitCode = 1; });
