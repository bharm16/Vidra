#!/usr/bin/env node
/**
 * collect-raw-prompts - CLI helper to dump un-optimized (user-input) prompts.
 *
 * Useful when you need to inspect every raw prompt stored in Firestore (optimized
 * history collection) or in a localStorage export. The script can target a single
 * user, limit the number of documents processed, and emit either JSON or CSV.
 *
 * Example usage:
 *   tsx --tsconfig server/tsconfig.json scripts/collect-raw-prompts.ts \
 *     --output=reports/raw-prompts.json \
 *     --limit=500 \
 *     --local-file=~/Downloads/promptHistory.json
 */

import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import {
  initializeFirebaseAdmin,
  admin,
} from "./migrations/firebase-admin-init.js";

type TimestampLike = admin.firestore.Timestamp | string | undefined;

interface ScriptOptions {
  userId?: string | undefined;
  batchSize: number;
  limit: number | null;
  output: string;
  format: "json" | "csv";
  localFile?: string | undefined;
  envFile?: string | undefined;
}

interface RawPromptEntry {
  source: "firestore" | "localStorage";
  id?: string | undefined;
  uuid?: string | undefined;
  userId?: string | undefined;
  timestamp?: string | undefined;
  mode?: string | undefined;
  input: string;
  output?: string | undefined;
}

const argv = process.argv.slice(2);

function parseOption(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

const options: ScriptOptions = {
  userId: parseOption("userId"),
  batchSize: parseInt(parseOption("batch-size") ?? "500", 10),
  limit: parseOption("limit")
    ? parseInt(parseOption("limit") as string, 10)
    : null,
  output: parseOption("output") ?? "raw-prompts.json",
  format: (parseOption("format") as "json" | "csv") ?? "json",
  localFile: parseOption("local-file"),
  envFile: parseOption("env-file"),
};

if (
  !options.batchSize ||
  Number.isNaN(options.batchSize) ||
  options.batchSize <= 0
) {
  options.batchSize = 500;
}

if (
  options.limit !== null &&
  (Number.isNaN(options.limit) || options.limit <= 0)
) {
  options.limit = null;
}

if (options.format !== "json" && options.format !== "csv") {
  options.format = "json";
}

dotenv.config({ path: options.envFile ?? ".env" });

function toIso(value: TimestampLike): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") {
    return value;
  }
  if (typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return undefined;
}

function buildEntryFromFirestore(
  doc: admin.firestore.QueryDocumentSnapshot<admin.firestore.DocumentData>,
): RawPromptEntry {
  const data = doc.data();
  const input =
    typeof data.input === "string"
      ? data.input
      : typeof data.prompt === "string"
        ? data.prompt
        : "";
  return {
    source: "firestore",
    id: doc.id,
    uuid: typeof data.uuid === "string" ? data.uuid : undefined,
    userId: typeof data.userId === "string" ? data.userId : undefined,
    timestamp: toIso(data.timestamp),
    mode: typeof data.mode === "string" ? data.mode : undefined,
    input: input.trim(),
    output: typeof data.output === "string" ? data.output : undefined,
  };
}

async function collectFromFirestore(
  opts: ScriptOptions,
): Promise<RawPromptEntry[]> {
  const db = initializeFirebaseAdmin();
  const entries: RawPromptEntry[] = [];
  let lastDoc: admin.firestore.QueryDocumentSnapshot<admin.firestore.DocumentData> | null =
    null;
  let remaining = opts.limit;

  const baseCollection = db.collection("prompts");
  const filteredCollection = opts.userId
    ? baseCollection.where("userId", "==", opts.userId)
    : baseCollection;

  while (true) {
    const batchSize =
      remaining !== null ? Math.min(opts.batchSize, remaining) : opts.batchSize;
    let query = filteredCollection
      .orderBy("timestamp", "desc")
      .limit(batchSize);

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) {
      break;
    }

    for (const doc of snapshot.docs) {
      entries.push(buildEntryFromFirestore(doc));
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1] ?? null;

    if (remaining !== null) {
      remaining -= snapshot.size;
      if (remaining <= 0) {
        break;
      }
    }
  }

  return remaining === null
    ? entries
    : entries.slice(0, opts.limit ?? entries.length);
}

function loadLocalStorageEntries(filePath: string): RawPromptEntry[] {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Local storage export not found at ${resolved}`);
  }

  const raw = fs.readFileSync(resolved, "utf8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error("Local storage export must be a JSON array");
  }

  return parsed.map((entry: Record<string, unknown>, index: number) => {
    const input =
      typeof entry.input === "string"
        ? entry.input
        : typeof entry.prompt === "string"
          ? entry.prompt
          : "";
    const timestamp =
      typeof entry.timestamp === "string" ? entry.timestamp : undefined;

    return {
      source: "localStorage" as const,
      id: entry.id ? String(entry.id) : `local-${index}`,
      uuid: typeof entry.uuid === "string" ? entry.uuid : undefined,
      userId: typeof entry.userId === "string" ? entry.userId : undefined,
      timestamp,
      mode: typeof entry.mode === "string" ? entry.mode : undefined,
      input: input.trim(),
      output: typeof entry.output === "string" ? entry.output : undefined,
    };
  });
}

function writeJsonOutput(filePath: string, entries: RawPromptEntry[]): void {
  fs.writeFileSync(filePath, JSON.stringify(entries, null, 2), "utf8");
}

function toCsvLine(entry: RawPromptEntry): string {
  const escape = (value?: string): string => {
    if (value === undefined) return "";
    return `"${value.replace(/"/g, '""')}"`;
  };
  return [
    entry.source,
    entry.userId ?? "",
    entry.id ?? "",
    entry.uuid ?? "",
    entry.timestamp ?? "",
    entry.mode ?? "",
    escape(entry.input),
    escape(entry.output),
  ].join(",");
}

function writeCsvOutput(filePath: string, entries: RawPromptEntry[]): void {
  const header = "source,userId,id,uuid,timestamp,mode,input,output";
  const lines = entries.map((entry) => toCsvLine(entry));
  fs.writeFileSync(filePath, [header, ...lines].join("\n"), "utf8");
}

function appendTimestampToFileName(filePath: string, suffix: string): string {
  const ext = path.extname(filePath) || ".json";
  const base = path.basename(filePath, ext);
  const dir = path.dirname(filePath);
  return path.join(dir, `${base}-${suffix}${ext}`);
}

function ensureOutputDirectory(outputPath: string): void {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getTimestampSuffix(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, "0");
  const datePart = `${date.getFullYear()}_${pad(date.getMonth() + 1)}_${pad(
    date.getDate(),
  )}`;
  const timePart = `${pad(date.getHours())}_${pad(date.getMinutes())}_${pad(
    date.getSeconds(),
  )}`;
  return `${datePart}_${timePart}`;
}

(async () => {
  try {
    console.log("Collecting raw prompts...");
    const firestoreEntries = await collectFromFirestore(options);
    console.log(`  • Firestore entries: ${firestoreEntries.length}`);

    let localEntries: RawPromptEntry[] = [];
    if (options.localFile) {
      localEntries = loadLocalStorageEntries(options.localFile);
      console.log(`  • Local storage entries: ${localEntries.length}`);
    }

    const allEntries = [...firestoreEntries, ...localEntries];
    console.log(`  → Total raw prompts captured: ${allEntries.length}`);

    const suffix = getTimestampSuffix(new Date());
    const timestampedOutput = appendTimestampToFileName(
      path.resolve(options.output),
      suffix,
    );
    ensureOutputDirectory(timestampedOutput);

    if (options.format === "csv") {
      writeCsvOutput(timestampedOutput, allEntries);
    } else {
      writeJsonOutput(timestampedOutput, allEntries);
    }

    console.log(`Output saved to ${timestampedOutput}`);
  } catch (error) {
    console.error(
      "Failed to collect prompts:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
})();
