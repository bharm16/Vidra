#!/usr/bin/env node

/**
 * Firestore Highlight Cache Backfill Migration
 *
 * Generates and saves highlight cache data for existing prompt documents
 * that don't have highlightCache populated.
 *
 * Usage:
 *   tsx --tsconfig server/tsconfig.json scripts/migrations/backfill-highlight-cache.ts [options]
 *
 * Options:
 *   --dry-run              Preview changes without writing to Firestore
 *   --userId=USER_ID       Process only prompts for a specific user
 *   --limit=N              Maximum number of documents to process (for testing)
 *
 * Requires Firebase credentials (see firebase-admin-init.ts) plus the LLM
 * provider key the span-labeling route resolves to (GROQ_API_KEY /
 * GEMINI_API_KEY / OPENAI_API_KEY — same env contract as the synthetic
 * harness).
 *
 * Examples:
 *   # Dry run to see what would be updated
 *   tsx --tsconfig server/tsconfig.json scripts/migrations/backfill-highlight-cache.ts --dry-run
 *
 *   # Process prompts for specific user
 *   tsx --tsconfig server/tsconfig.json scripts/migrations/backfill-highlight-cache.ts --userId=abc123
 *
 *   # Process only 10 documents (testing)
 *   tsx --tsconfig server/tsconfig.json scripts/migrations/backfill-highlight-cache.ts --limit=10 --dry-run
 */

import { initializeFirebaseAdmin, admin } from "./firebase-admin-init.js";
import { labelSpans } from "../../server/src/llm/span-labeling/SpanLabelingService.js";
import { hashString } from "./hashString.js";
import { createSyntheticAIService } from "../synthetic/utils/aiService.js";

// labelSpans requires an AIService since the DI refactor — this script
// crashed on its first document for as long as it was tsconfig-excluded
// (the exclusion hid the TS2554 that would have said so). The synthetic
// factory mirrors the production DI wiring from env vars.
const aiService = createSyntheticAIService();

const args = process.argv.slice(2);

function argValue(prefix: string): string | undefined {
  return args.find((arg) => arg.startsWith(prefix))?.split("=")[1];
}

const options = {
  dryRun: args.includes("--dry-run"),
  userId: argValue("--userId="),
  limit: Number.parseInt(argValue("--limit=") ?? "", 10) || null,
};

interface FailedDoc {
  id: string;
  mode: string | undefined;
  error: string;
  charCount: number;
}

const stats = {
  total: 0,
  processed: 0,
  updated: 0,
  skipped: 0,
  errors: 0,
  alreadyHasCache: 0,
  failedDocs: [] as FailedDoc[],
  startTime: 0,
  totalProcessingTime: 0,
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

async function generateHighlightCache(text: string): Promise<{
  spans: unknown[];
  meta: unknown;
  signature: string;
  timestamp: FirebaseFirestore.FieldValue;
}> {
  const result = await labelSpans(
    {
      text,
      maxSpans: 60,
      minConfidence: 0.5,
      policy: { nonTechnicalWordLimit: 6, allowOverlap: false },
      templateVersion: "v1",
    },
    aiService,
  );

  return {
    spans: result.spans || [],
    meta: result.meta || null,
    signature: hashString(text),
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  };
}

interface ProcessResult {
  status: "updated" | "skipped" | "error";
  reason?: string;
  error?: string;
  spansCount?: number;
  signature?: string;
  mode: string | undefined;
  charCount: number;
  processingTime: number;
}

async function processDocument(
  doc: FirebaseFirestore.QueryDocumentSnapshot,
  db: FirebaseFirestore.Firestore,
): Promise<ProcessResult> {
  const startTime = Date.now();
  const docId = doc.id;
  const data = doc.data();
  const mode = typeof data.mode === "string" ? data.mode : undefined;

  if (data.highlightCache) {
    stats.alreadyHasCache++;
    stats.skipped++;
    return {
      status: "skipped",
      reason: "already-has-cache",
      mode,
      charCount: 0,
      processingTime: 0,
    };
  }

  const promptText = data.output || data.optimizedPrompt || data.prompt;
  if (!promptText || typeof promptText !== "string" || !promptText.trim()) {
    stats.skipped++;
    return {
      status: "skipped",
      reason: "no-prompt-text",
      mode,
      charCount: 0,
      processingTime: 0,
    };
  }

  try {
    const highlightCache = await generateHighlightCache(promptText);

    const versionEntry = {
      versionId: `migration-v-${Date.now()}`,
      signature: highlightCache.signature,
      spansCount: highlightCache.spans.length,
      timestamp: new Date().toISOString(),
    };

    if (!options.dryRun) {
      await db
        .collection("prompts")
        .doc(docId)
        .update({
          highlightCache,
          versions: admin.firestore.FieldValue.arrayUnion(versionEntry),
        });
    }

    const processingTime = (Date.now() - startTime) / 1000;
    stats.updated++;
    stats.totalProcessingTime += processingTime;

    return {
      status: "updated",
      spansCount: highlightCache.spans.length,
      signature: highlightCache.signature,
      mode,
      charCount: promptText.length,
      processingTime,
    };
  } catch (error) {
    const processingTime = (Date.now() - startTime) / 1000;
    stats.errors++;
    stats.failedDocs.push({
      id: docId,
      mode,
      error: errorMessage(error),
      charCount: promptText.length,
    });

    return {
      status: "error",
      error: errorMessage(error),
      mode,
      charCount: promptText.length,
      processingTime,
    };
  }
}

async function runMigration(): Promise<void> {
  console.log("\n🔧 Firestore Highlight Cache Backfill Migration\n");
  console.log("Configuration:");
  console.log(
    `  Dry Run: ${options.dryRun ? "✓ YES (no changes will be made)" : "✗ NO (will update Firestore)"}`,
  );
  console.log(`  User Filter: ${options.userId || "ALL USERS"}`);
  console.log(`  Limit: ${options.limit || "NONE"}`);
  console.log("");

  const db = initializeFirebaseAdmin();

  try {
    let query: FirebaseFirestore.Query = db.collection("prompts");

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
    console.log(`✓ Found ${stats.total} document(s)\n`);

    console.log("🔄 Processing documents...\n");
    const docs = snapshot.docs;
    stats.startTime = Date.now();

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i]!;
      const progress = Math.round(((i + 1) / stats.total) * 100);
      const result = await processDocument(doc, db);
      stats.processed++;

      const elapsedMinutes = (Date.now() - stats.startTime) / 1000 / 60;
      const docsPerMinute = stats.processed / elapsedMinutes;
      const remainingDocs = stats.total - stats.processed;
      const estimatedMinutesRemaining = remainingDocs / docsPerMinute;

      if (result.status === "updated") {
        console.log(
          `[${i + 1}/${stats.total}] (${progress}%) ${doc.id.slice(0, 8)} (${result.mode || "unknown"}, ${result.charCount} chars)`,
        );
        console.log(
          `  ✓ ${result.spansCount} spans in ${result.processingTime.toFixed(1)}s`,
        );
        if (i < docs.length - 1) {
          console.log(
            `  Speed: ${docsPerMinute.toFixed(1)} docs/min | ETA: ${estimatedMinutesRemaining.toFixed(1)} min\n`,
          );
        }
      } else if (result.status === "error") {
        console.log(
          `[${i + 1}/${stats.total}] (${progress}%) ${doc.id.slice(0, 8)} (${result.mode || "unknown"}, ${result.charCount} chars)`,
        );
        console.log(`  ✗ Failed: ${result.error}\n`);
      }
    }

    const totalTime = (Date.now() - stats.startTime) / 1000 / 60;
    const avgTimePerDoc =
      stats.updated > 0 ? stats.totalProcessingTime / stats.updated : 0;

    console.log("\n" + "=".repeat(60));
    console.log("📊 Migration Summary");
    console.log("=".repeat(60));
    console.log(`Total documents found:        ${stats.total}`);
    console.log(`Documents processed:          ${stats.processed}`);
    console.log(`Documents updated:            ${stats.updated} ✓`);
    console.log(`Documents skipped:            ${stats.skipped}`);
    console.log(`  - Already had cache:        ${stats.alreadyHasCache}`);
    console.log(
      `  - No prompt text:           ${stats.skipped - stats.alreadyHasCache}`,
    );
    console.log(
      `Errors:                       ${stats.errors} ${stats.errors > 0 ? "✗" : ""}`,
    );
    console.log("");
    console.log(
      `Total time:                   ${totalTime.toFixed(1)} minutes`,
    );
    console.log(`Average time per document:    ${avgTimePerDoc.toFixed(1)}s`);
    console.log("=".repeat(60));

    if (stats.failedDocs.length > 0) {
      console.log("\n❌ Failed Documents:");
      stats.failedDocs.forEach((failed) => {
        console.log(
          `  - ${failed.id.slice(0, 8)} (${failed.mode || "unknown"}): ${failed.error}`,
        );
      });
      console.log("");
    }

    if (options.dryRun) {
      console.log("\n⚠️  DRY RUN MODE - No changes were made to Firestore");
      console.log("Run without --dry-run to apply changes.\n");
    } else {
      console.log(
        `\n✓ Migration completed! ${stats.updated} documents updated, ${stats.errors} failed.\n`,
      );
    }
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("\n❌ Unexpected error:", error);
    process.exit(1);
  });
