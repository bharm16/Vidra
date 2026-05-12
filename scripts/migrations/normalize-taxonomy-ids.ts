#!/usr/bin/env node

/**
 * Firestore Taxonomy Normalization Migration
 *
 * Normalizes legacy span category/role IDs to the V3 taxonomy for stored
 * highlightCache data. Removes reliance on legacy mappings at runtime.
 *
 * Usage:
 *   tsx --tsconfig server/tsconfig.json scripts/migrations/normalize-taxonomy-ids.ts [options]
 *
 * Options:
 *   --dry-run              Preview changes without writing to Firestore
 *   --userId=USER_ID       Process only prompts for a specific user
 *   --batch-size=N         Number of documents to process in parallel (default: 10)
 *   --limit=N              Maximum number of documents to process (for testing)
 */

import { initializeFirebaseAdmin, admin } from "./firebase-admin-init.js";
import { VALID_CATEGORIES } from "../../shared/taxonomy.js";

const args = process.argv.slice(2);
const options = {
  dryRun: args.includes("--dry-run"),
  userId: args.find((arg) => arg.startsWith("--userId="))?.split("=")[1],
  batchSize:
    parseInt(
      args.find((arg) => arg.startsWith("--batch-size="))?.split("=")[1] ?? "",
    ) || 10,
  limit:
    parseInt(
      args.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? "",
    ) || null,
};

const LEGACY_ID_MAP: Record<string, string> = {
  // Subject attributes
  identity: "subject.identity",
  appearance: "subject.appearance",
  wardrobe: "subject.wardrobe",
  action: "action.movement",
  emotion: "subject.emotion",
  "subject.action": "action.movement",

  // Environment attributes
  location: "environment.location",
  weather: "environment.weather",
  context: "environment.context",

  // Lighting attributes
  lighting_source: "lighting.source",
  lightingSource: "lighting.source",
  lighting_quality: "lighting.quality",
  lightingQuality: "lighting.quality",
  time_of_day: "lighting.timeOfDay",
  timeOfDay: "lighting.timeOfDay",
  timeofday: "lighting.timeOfDay",
  timeday: "lighting.timeOfDay",
  colorTemp: "lighting.colorTemp",
  color_temp: "lighting.colorTemp",

  // Camera attributes
  framing: "shot.type",
  "camera.framing": "shot.type",
  shot: "shot.type",
  camera_move: "camera.movement",
  cameraMove: "camera.movement",
  movement: "camera.movement",
  lens: "camera.lens",
  angle: "camera.angle",
  focus: "camera.focus",
  aperture: "camera.focus",
  depth_of_field: "camera.focus",

  // Style attributes
  aesthetic: "style.aesthetic",
  film_stock: "style.filmStock",
  filmStock: "style.filmStock",
  colorGrade: "style.colorGrade",
  color_grade: "style.colorGrade",

  // Technical attributes
  aspect_ratio: "technical.aspectRatio",
  aspectRatio: "technical.aspectRatio",
  frame_rate: "technical.frameRate",
  frameRate: "technical.frameRate",
  fps: "technical.frameRate",
  resolution: "technical.resolution",
  specs: "technical.resolution",
  duration: "technical.duration",

  // Audio attributes
  score: "audio.score",
  sound_effect: "audio.soundEffect",
  soundEffect: "audio.soundEffect",
  sfx: "audio.soundEffect",
  ambient: "audio.ambient",
  ambience: "audio.ambient",
};

const LEGACY_ROLE_TO_CATEGORY: Record<string, string> = {
  Subject: "subject",
  Appearance: "subject.appearance",
  Wardrobe: "subject.wardrobe",
  Movement: "action.movement",
  Environment: "environment",
  Lighting: "lighting",
  Camera: "camera",
  Framing: "shot.type",
  Specs: "technical",
  Style: "style",
  Quality: "style.aesthetic",
};

const stats = {
  total: 0,
  processed: 0,
  updated: 0,
  skipped: 0,
  errors: 0,
  alreadyNormalized: 0,
  startTime: null as number | null,
};

function normalizeCategoryId(value: string): {
  value: string;
  changed: boolean;
  source?: string;
} {
  if (!value || typeof value !== "string") {
    return { value, changed: false };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { value: trimmed, changed: false };
  }

  if (VALID_CATEGORIES.has(trimmed)) {
    return { value: trimmed, changed: false };
  }

  if (LEGACY_ID_MAP[trimmed]) {
    return {
      value: LEGACY_ID_MAP[trimmed],
      changed: true,
      source: "legacy-id",
    };
  }

  if (LEGACY_ROLE_TO_CATEGORY[trimmed]) {
    return {
      value: LEGACY_ROLE_TO_CATEGORY[trimmed],
      changed: true,
      source: "legacy-role",
    };
  }

  const lower = trimmed.toLowerCase();
  if (VALID_CATEGORIES.has(lower)) {
    return { value: lower, changed: lower !== trimmed, source: "lowercase" };
  }

  if (LEGACY_ID_MAP[lower]) {
    return {
      value: LEGACY_ID_MAP[lower],
      changed: true,
      source: "legacy-id-lowercase",
    };
  }

  return { value: trimmed, changed: false };
}

function normalizeSpan(span: Record<string, unknown>): {
  span: Record<string, unknown>;
  changed: boolean;
} {
  let changed = false;
  const updated = { ...span };

  if (typeof span.category === "string") {
    const normalized = normalizeCategoryId(span.category);
    if (normalized.changed) {
      updated.category = normalized.value;
      changed = true;
    }
  }

  if (typeof span.role === "string") {
    const normalized = normalizeCategoryId(span.role);
    if (normalized.changed) {
      updated.role = normalized.value;
      changed = true;
    }
  }

  if (typeof span.taxonomyId === "string") {
    const normalized = normalizeCategoryId(span.taxonomyId);
    if (normalized.changed) {
      updated.taxonomyId = normalized.value;
      changed = true;
    }
  }

  return { span: updated, changed };
}

async function processDocument(doc: any): Promise<void> {
  const data = doc.data();
  const highlightCache = data.highlightCache;

  if (!highlightCache || !Array.isArray(highlightCache.spans)) {
    stats.skipped++;
    return;
  }

  let hasChanges = false;
  const normalizedSpans = highlightCache.spans.map((span: unknown) => {
    if (!span || typeof span !== "object") {
      return span;
    }

    const normalized = normalizeSpan(span as Record<string, unknown>);
    if (normalized.changed) {
      hasChanges = true;
    }
    return normalized.span;
  });

  if (!hasChanges) {
    stats.alreadyNormalized++;
    stats.skipped++;
    return;
  }

  stats.updated++;

  if (options.dryRun) {
    return;
  }

  const updatePayload: Record<string, unknown> = {
    highlightCache: {
      ...highlightCache,
      spans: normalizedSpans,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    versions: admin.firestore.FieldValue.arrayUnion({
      versionId: `taxonomy-normalization-${Date.now()}`,
      action: "normalize-taxonomy-v3",
      spansCount: normalizedSpans.length,
      timestamp: new Date().toISOString(),
    }),
  };

  await doc.ref.update(updatePayload);
}

async function runMigration(): Promise<void> {
  console.log("\n🔧 Firestore Taxonomy Normalization Migration\n");
  console.log("Configuration:");
  console.log(
    `  Dry Run: ${options.dryRun ? "✓ YES (no changes will be made)" : "✗ NO (will update Firestore)"}`,
  );
  console.log(`  User Filter: ${options.userId || "ALL USERS"}`);
  console.log(`  Batch Size: ${options.batchSize}`);
  console.log(`  Limit: ${options.limit || "NONE"}`);
  console.log("");

  const db = initializeFirebaseAdmin();

  let query: admin.firestore.Query<admin.firestore.DocumentData> =
    db.collection("prompts");
  if (options.userId) {
    query = query.where("userId", "==", options.userId);
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }

  console.log("📥 Fetching documents from Firestore...");
  const snapshot = await query.get();

  if (snapshot.empty) {
    console.log("⚠️  No documents found matching criteria.\n");
    return;
  }

  stats.total = snapshot.size;
  stats.startTime = Date.now();
  console.log(`✓ Found ${stats.total} document(s)\n`);

  const docs = snapshot.docs;

  for (let i = 0; i < docs.length; i += options.batchSize) {
    const batch = docs.slice(i, i + options.batchSize);
    await Promise.all(
      batch.map(async (doc) => {
        try {
          await processDocument(doc);
          stats.processed++;
        } catch (error) {
          stats.errors++;
          const err = error as Error;
          console.error(`❌ Failed to process doc ${doc.id}: ${err.message}`);
        }
      }),
    );

    const progress = Math.round((stats.processed / stats.total) * 100);
    console.log(`Progress: ${stats.processed}/${stats.total} (${progress}%)`);
  }

  const elapsedMs = stats.startTime ? Date.now() - stats.startTime : 0;
  const elapsedMinutes = elapsedMs / 60000;

  console.log("\n============================================================");
  console.log("📊 Migration Summary");
  console.log("============================================================");
  console.log(`Total documents found:        ${stats.total}`);
  console.log(`Documents processed:          ${stats.processed}`);
  console.log(`Documents updated:            ${stats.updated}`);
  console.log(`Documents skipped:            ${stats.skipped}`);
  console.log(`Already normalized:           ${stats.alreadyNormalized}`);
  console.log(`Errors:                       ${stats.errors}`);
  console.log(
    `Total time:                   ${elapsedMinutes.toFixed(2)} minutes`,
  );
  console.log("============================================================");

  console.log("\n✓ Migration completed.");
}

runMigration().catch((error) => {
  console.error("❌ Migration failed:", error);
  process.exit(1);
});
