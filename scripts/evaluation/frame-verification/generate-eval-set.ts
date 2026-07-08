/**
 * Frame-verification eval set generator (Phase 1)
 *
 * Builds a self-labeling eval set: frames generated with Flux Schnell from
 * golden-set prompts plus perturbed variants where exactly one labeled span
 * is dropped or contradicted BEFORE generation — so per-span ground truth is
 * known by construction:
 *   - base variant: every (visual) span expected present
 *   - perturbed variant: the perturbed span expected absent, the rest present
 *
 * Perturbations operate on golden-set character offsets (pure string slicing,
 * no pattern matching). A contradiction substitutes the span text with a
 * same-role span from a different golden prompt, keeping the sentence
 * grammatical while flipping its meaning.
 *
 * Usage:
 *   npx tsx scripts/evaluation/frame-verification/generate-eval-set.ts
 *   npx tsx scripts/evaluation/frame-verification/generate-eval-set.ts --dry-run
 *   npx tsx scripts/evaluation/frame-verification/generate-eval-set.ts --concurrency 2
 *
 * Requires REPLICATE_API_TOKEN in the repo-root .env. Resumable: variants
 * whose frame file already exists are not regenerated.
 */

import { config as loadEnv } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ReplicateFluxSchnellProvider } from "../../../server/src/services/image-generation/providers/ReplicateFluxSchnellProvider.js";
import { getParentCategory } from "../../../shared/taxonomy.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

loadEnv({ path: join(__dirname, "../../..", ".env") });

const GOLDEN_SET_DIR = join(
  __dirname,
  "../../../server/src/llm/span-labeling/evaluation/golden-set",
);
const FRAMES_DIR = join(__dirname, "frames");
const MANIFEST_PATH = join(__dirname, "manifest.json");

/** fixture file → how many prompts to take (deterministic: first N) */
const FIXTURE_SELECTION: Array<{ file: string; take: number }> = [
  { file: "core-prompts.json", take: 5 },
  { file: "appearance-prompts.json", take: 12 },
  { file: "lighting-prompts.json", take: 10 },
  { file: "pattern-overlap-prompts.json", take: 3 },
];

/** Parent categories a still frame can never verify — excluded from ground truth. */
const NON_VISUAL_PARENTS = new Set(["audio", "technical"]);

/** camera.movement cannot be seen in a still frame either. */
const NON_VISUAL_CATEGORIES = new Set(["camera.movement"]);

/**
 * Perturbation-target preference order: categories Flux Schnell renders
 * reliably enough that contradicting them actually changes the image.
 */
const PERTURB_PREFERENCE = [
  "subject.identity",
  "environment.location",
  "subject.wardrobe",
  "lighting.timeOfDay",
  "lighting.source",
  "subject.appearance",
  "action.movement",
  "action.state",
];

interface GoldenSpan {
  text: string;
  start: number;
  end: number;
  role: string;
}

interface GoldenPrompt {
  id: string;
  text: string;
  groundTruth: { spans: GoldenSpan[] };
}

interface ManifestSpan {
  text: string;
  category: string;
  expected: "present" | "absent";
}

export interface ManifestVariant {
  variantId: string;
  promptId: string;
  kind: "base" | "dropped" | "contradicted";
  /** The prompt actually sent to the image model */
  generationPrompt: string;
  /** Original golden prompt text (what the spans came from) */
  originalPrompt: string;
  /** Category of the perturbed span (perturbed variants only) */
  perturbedCategory?: string;
  /** Original text of the perturbed span (perturbed variants only) */
  perturbedSpanText?: string;
  /** Replacement text for contradictions */
  replacementText?: string;
  /** Spans to verify (original span texts) with constructed ground truth */
  spans: ManifestSpan[];
  imagePath: string;
}

const isVisual = (role: string): boolean => {
  const parent = getParentCategory(role);
  if (!parent) return false;
  if (NON_VISUAL_PARENTS.has(parent)) return false;
  if (NON_VISUAL_CATEGORIES.has(role)) return false;
  return true;
};

const loadSelectedPrompts = (): GoldenPrompt[] => {
  const prompts: GoldenPrompt[] = [];
  for (const { file, take } of FIXTURE_SELECTION) {
    const fixture = JSON.parse(
      readFileSync(join(GOLDEN_SET_DIR, file), "utf8"),
    ) as { prompts: GoldenPrompt[] };
    prompts.push(...fixture.prompts.slice(0, take));
  }
  return prompts;
};

/**
 * A span can be dropped cleanly only when it is a comma-bounded trailing
 * descriptor — preceded by ", " and followed by end/period/comma — so its
 * removal leaves a grammatical sentence. Checked by inspecting the exact
 * neighbor characters at the span's offsets.
 */
export const canDropCleanly = (text: string, span: GoldenSpan): boolean => {
  if (text.slice(span.start - 2, span.start) !== ", ") return false;
  const after = text.slice(span.end, span.end + 1);
  return after === "" || after === "." || after === ",";
};

/** Remove a comma-bounded span (and its leading ", ") by character offsets. */
export const dropSpan = (text: string, span: GoldenSpan): string =>
  (text.slice(0, span.start - 2) + text.slice(span.end)).trim();

const VOWELS = new Set(["a", "e", "i", "o", "u"]);

/**
 * Substitute a span with donor text at the same character offsets, fixing
 * the preceding article's a/an agreement when one is present.
 */
export const substituteSpan = (
  text: string,
  span: GoldenSpan,
  replacement: string,
): string => {
  let before = text.slice(0, span.start);
  const startsWithVowel = VOWELS.has(replacement.slice(0, 1).toLowerCase());
  for (const [article, opposite] of [
    ["A ", "An "],
    ["a ", "an "],
    ["An ", "A "],
    ["an ", "a "],
  ] as const) {
    if (!before.endsWith(article)) continue;
    const articleIsAn = article.trim().toLowerCase() === "an";
    if (articleIsAn !== startsWithVowel) {
      before = before.slice(0, before.length - article.length) + opposite;
    }
    break;
  }
  return before + replacement + text.slice(span.end);
};

/**
 * Pick the span to contradict: rotate the preference order by prompt index so
 * the eval set covers many categories; fall back to the longest visual span.
 */
export const pickContradictTarget = (
  spans: GoldenSpan[],
  promptIndex: number,
): GoldenSpan | null => {
  const visual = spans.filter((span) => isVisual(span.role));
  if (visual.length === 0) return null;
  for (let i = 0; i < PERTURB_PREFERENCE.length; i++) {
    const category =
      PERTURB_PREFERENCE[(i + promptIndex) % PERTURB_PREFERENCE.length];
    const match = visual.find((span) => span.role === category);
    if (match) return match;
  }
  return [...visual].sort((a, b) => b.text.length - a.text.length)[0] ?? null;
};

/** Pick the last visual span that can be dropped without breaking grammar. */
export const pickDropTarget = (
  text: string,
  spans: GoldenSpan[],
): GoldenSpan | null => {
  const candidates = spans.filter(
    (span) => isVisual(span.role) && canDropCleanly(text, span),
  );
  return candidates[candidates.length - 1] ?? null;
};

/**
 * Find a same-role donor span with different text, scanning other prompts in
 * deterministic order starting after the target prompt.
 */
export const findDonor = (
  prompts: GoldenPrompt[],
  promptIndex: number,
  target: GoldenSpan,
): GoldenSpan | null => {
  for (let offset = 1; offset < prompts.length; offset++) {
    const donorPrompt = prompts[(promptIndex + offset) % prompts.length];
    if (!donorPrompt) continue;
    const donor = donorPrompt.groundTruth.spans.find(
      (span) =>
        span.role === target.role &&
        span.text.toLowerCase() !== target.text.toLowerCase(),
    );
    if (donor) return donor;
  }
  return null;
};

export const buildVariantPlan = (
  prompts: GoldenPrompt[],
): ManifestVariant[] => {
  const variants: ManifestVariant[] = [];
  let dropCount = 0;

  prompts.forEach((prompt, promptIndex) => {
    const visualSpans = prompt.groundTruth.spans.filter((span) =>
      isVisual(span.role),
    );
    if (visualSpans.length < 2) {
      console.warn(`Skipping ${prompt.id}: fewer than 2 visual spans`);
      return;
    }

    variants.push({
      variantId: `${prompt.id}-base`,
      promptId: prompt.id,
      kind: "base",
      generationPrompt: prompt.text,
      originalPrompt: prompt.text,
      spans: visualSpans.map((span) => ({
        text: span.text,
        category: span.role,
        expected: "present",
      })),
      imagePath: `frames/${prompt.id}-base.webp`,
    });

    // Mostly contradictions (stronger ground truth than drops — the frame
    // actively shows something else), but take a drop whenever a span can be
    // removed without breaking grammar (capped) so the eval also covers plain
    // omission. Cleanly droppable spans are rare enough that this stays a
    // minority of the set.
    const dropTarget =
      dropCount < 10
        ? pickDropTarget(prompt.text, prompt.groundTruth.spans)
        : null;
    if (dropTarget) dropCount++;
    const contradictTarget = dropTarget
      ? null
      : pickContradictTarget(prompt.groundTruth.spans, promptIndex);
    const donor = contradictTarget
      ? findDonor(prompts, promptIndex, contradictTarget)
      : null;

    let target: GoldenSpan;
    let kind: "dropped" | "contradicted";
    let generationPrompt: string;
    if (dropTarget) {
      target = dropTarget;
      kind = "dropped";
      generationPrompt = dropSpan(prompt.text, dropTarget);
    } else if (contradictTarget && donor) {
      target = contradictTarget;
      kind = "contradicted";
      generationPrompt = substituteSpan(
        prompt.text,
        contradictTarget,
        donor.text,
      );
    } else {
      console.warn(`No perturbation available for ${prompt.id}`);
      return;
    }

    variants.push({
      variantId: `${prompt.id}-perturbed`,
      promptId: prompt.id,
      kind,
      generationPrompt,
      originalPrompt: prompt.text,
      perturbedCategory: target.role,
      perturbedSpanText: target.text,
      ...(donor ? { replacementText: donor.text } : {}),
      spans: visualSpans.map((span) => ({
        text: span.text,
        category: span.role,
        expected:
          span.start === target.start && span.end === target.end
            ? "absent"
            : "present",
      })),
      imagePath: `frames/${prompt.id}-perturbed.webp`,
    });
  });

  return variants;
};

const downloadImage = async (url: string, filePath: string): Promise<void> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download frame: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  writeFileSync(filePath, Buffer.from(arrayBuffer));
};

const generateFrames = async (
  variants: ManifestVariant[],
  concurrency: number,
): Promise<{ generated: number; skipped: number; failed: string[] }> => {
  const provider = new ReplicateFluxSchnellProvider({
    ...(process.env.REPLICATE_API_TOKEN
      ? { apiToken: process.env.REPLICATE_API_TOKEN }
      : {}),
    promptTransformer: null,
    videoPromptDetector: { isVideoPrompt: () => false },
  });
  if (!provider.isAvailable()) {
    throw new Error("REPLICATE_API_TOKEN is not set — cannot generate frames");
  }

  let generated = 0;
  let skipped = 0;
  const failed: string[] = [];
  const queue = [...variants];

  const worker = async (): Promise<void> => {
    for (;;) {
      const variant = queue.shift();
      if (!variant) return;
      const filePath = join(__dirname, variant.imagePath);
      if (existsSync(filePath)) {
        skipped++;
        continue;
      }
      try {
        const result = await provider.generatePreview({
          prompt: variant.generationPrompt,
          aspectRatio: "16:9",
          userId: "frame-verification-eval",
          disablePromptTransformation: true,
        });
        await downloadImage(result.imageUrl, filePath);
        generated++;
        console.log(
          `[${generated + skipped}/${variants.length}] ${variant.variantId} (${result.durationMs}ms)`,
        );
      } catch (error) {
        failed.push(variant.variantId);
        console.error(
          `FAILED ${variant.variantId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, () => worker()),
  );
  return { generated, skipped, failed };
};

const main = async (): Promise<void> => {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const concurrencyIndex = argv.indexOf("--concurrency");
  const concurrency =
    concurrencyIndex >= 0 ? Number(argv[concurrencyIndex + 1]) : 3;

  const prompts = loadSelectedPrompts();
  const variants = buildVariantPlan(prompts);

  const kinds = { base: 0, dropped: 0, contradicted: 0 };
  for (const variant of variants) kinds[variant.kind]++;
  console.log(
    `Planned ${variants.length} variants from ${prompts.length} prompts ` +
      `(${kinds.base} base, ${kinds.contradicted} contradicted, ${kinds.dropped} dropped)`,
  );

  if (dryRun) {
    for (const variant of variants.filter((v) => v.kind !== "base")) {
      console.log(
        `\n${variant.variantId} [${variant.kind}] ${variant.perturbedCategory}`,
      );
      console.log(`  original:  ${variant.originalPrompt}`);
      console.log(`  perturbed: ${variant.generationPrompt}`);
    }
    return;
  }

  mkdirSync(FRAMES_DIR, { recursive: true });
  const { generated, skipped, failed } = await generateFrames(
    variants,
    concurrency,
  );

  const manifest = {
    metadata: {
      description:
        "Self-labeling frame-verification eval set. Ground truth constructed by pre-generation span perturbation.",
      sourceGoldenSet: FIXTURE_SELECTION.map((f) => f.file),
      generator:
        "black-forest-labs/flux-schnell via ReplicateFluxSchnellProvider",
      variantCount: variants.length,
    },
    variants: variants.filter((variant) => !failed.includes(variant.variantId)),
  };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  console.log(
    `\nDone: ${generated} generated, ${skipped} already present, ${failed.length} failed.`,
  );
  console.log(`Manifest: ${MANIFEST_PATH}`);
  if (failed.length > 0) {
    console.error(`Failed variants: ${failed.join(", ")}`);
    process.exitCode = 1;
  }
};

const isDirectRun = process.argv[1] === __filename;
if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
