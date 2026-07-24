/**
 * Studio model registry — the stable seam between the conversation layer and
 * the image models (ADR-0019 §5).
 *
 * Owns: the roster (slug → Replicate ID, capabilities, cost, latency,
 * aspect-ratio allowlist), cheapest-capable Auto routing, pin validation,
 * per-call timeout budgets, and per-model Replicate input shaping. Pure
 * lookups over static data — unit-testable without any LLM or network.
 *
 * Replicate IDs verified against live model pages 2026-07-24. Costs marked
 * costVerified: false are deliberate overestimates (they reserve more spend
 * than needed, never less) and MUST be confirmed before launch — M1 exit gate.
 */

import type {
  StudioCapability,
  StudioModelEntry,
  StudioModelSlug,
  StudioUtilityEntry,
  StudioUtilityOperation,
} from "./types";

/**
 * Conservative allowlist shared by the v1 roster. Recraft's schema documents
 * `aspect_ratio` without enumerating values and Nano Banana accepts the same
 * common set; anything outside falls back to the model default. Confirm the
 * full per-model lists at M1.
 */
const COMMON_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"] as const;

const MODELS: readonly StudioModelEntry[] = [
  {
    slug: "recraft-v4.1",
    displayName: "Recraft V4.1",
    replicateId: "recraft-ai/recraft-v4.1",
    capabilities: ["design", "general"],
    costCentsPerCall: 4,
    costVerified: true,
    latencyHintSeconds: 6,
    aspectRatios: COMMON_ASPECT_RATIOS,
    defaultAspectRatio: "1:1",
  },
  {
    slug: "recraft-v4.1-svg",
    displayName: "Recraft V4.1 Vector",
    replicateId: "recraft-ai/recraft-v4.1-svg",
    capabilities: ["svg"],
    costCentsPerCall: 4,
    costVerified: true,
    latencyHintSeconds: 11,
    aspectRatios: COMMON_ASPECT_RATIOS,
    defaultAspectRatio: "1:1",
  },
  {
    slug: "recraft-v4.1-pro",
    displayName: "Recraft V4.1 Pro",
    replicateId: "recraft-ai/recraft-v4.1-pro",
    capabilities: ["design", "general"],
    costCentsPerCall: 25,
    costVerified: true,
    latencyHintSeconds: 11,
    aspectRatios: COMMON_ASPECT_RATIOS,
    defaultAspectRatio: "1:1",
  },
  {
    slug: "recraft-v4.1-pro-svg",
    displayName: "Recraft V4.1 Pro Vector",
    replicateId: "recraft-ai/recraft-v4.1-pro-svg",
    capabilities: ["svg"],
    costCentsPerCall: 30,
    costVerified: false,
    latencyHintSeconds: 14,
    aspectRatios: COMMON_ASPECT_RATIOS,
    defaultAspectRatio: "1:1",
  },
  {
    slug: "nano-banana-2",
    displayName: "Nano Banana 2",
    replicateId: "google/nano-banana-2",
    capabilities: ["general", "edit"],
    costCentsPerCall: 10,
    costVerified: false,
    latencyHintSeconds: 25,
    aspectRatios: COMMON_ASPECT_RATIOS,
    defaultAspectRatio: "1:1",
  },
  {
    slug: "nano-banana-2-lite",
    displayName: "Nano Banana 2 Lite",
    replicateId: "google/nano-banana-2-lite",
    capabilities: ["general", "edit"],
    costCentsPerCall: 5,
    costVerified: false,
    latencyHintSeconds: 4,
    aspectRatios: COMMON_ASPECT_RATIOS,
    defaultAspectRatio: "1:1",
  },
  {
    slug: "nano-banana-pro",
    displayName: "Nano Banana Pro",
    replicateId: "google/nano-banana-pro",
    capabilities: ["general", "edit"],
    costCentsPerCall: 25,
    costVerified: false,
    latencyHintSeconds: 30,
    aspectRatios: COMMON_ASPECT_RATIOS,
    defaultAspectRatio: "1:1",
  },
  {
    slug: "gpt-image-2",
    displayName: "GPT Image 2",
    replicateId: "openai/gpt-image-2",
    capabilities: ["general", "edit"],
    costCentsPerCall: 25,
    costVerified: false,
    latencyHintSeconds: 45,
    aspectRatios: COMMON_ASPECT_RATIOS,
    defaultAspectRatio: "1:1",
  },
] as const;

const UTILITIES: readonly StudioUtilityEntry[] = [
  {
    operation: "remove_background",
    replicateId: "recraft-ai/recraft-remove-background",
    costCentsPerCall: 1,
    costVerified: true,
    latencyHintSeconds: 5,
  },
  {
    operation: "vectorize",
    replicateId: "recraft-ai/recraft-vectorize",
    costCentsPerCall: 1,
    costVerified: true,
    latencyHintSeconds: 5,
  },
] as const;

const TIMEOUT_MULTIPLIER = 3;
const MIN_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 180_000;

export class StudioModelRegistry {
  private readonly bySlug = new Map<StudioModelSlug, StudioModelEntry>(
    MODELS.map((entry) => [entry.slug, entry]),
  );

  private readonly byOperation = new Map<
    StudioUtilityOperation,
    StudioUtilityEntry
  >(UTILITIES.map((entry) => [entry.operation, entry]));

  listModels(): readonly StudioModelEntry[] {
    return MODELS;
  }

  getModel(slug: StudioModelSlug): StudioModelEntry {
    const entry = this.bySlug.get(slug);
    if (!entry) {
      throw new Error(`Unknown studio model slug: ${slug}`);
    }
    return entry;
  }

  /**
   * Pin validation for persisted pinnedModel values: a slug that no longer
   * resolves (deprecated/renamed roster entry) returns null and the project
   * reverts to Auto (plan: "stale pin").
   */
  resolvePin(slug: string | null | undefined): StudioModelEntry | null {
    if (!slug) return null;
    return this.bySlug.get(slug as StudioModelSlug) ?? null;
  }

  /**
   * Auto mode: the cheapest model whose capabilities cover the operation.
   * Escalation to pricier tiers happens only via explicit user pin — this
   * function never trades cost for quality (plan: "Auto routing = cheapest
   * capable").
   */
  cheapestCapable(capability: StudioCapability): StudioModelEntry {
    const candidates = MODELS.filter((entry) =>
      entry.capabilities.includes(capability),
    );
    if (candidates.length === 0) {
      throw new Error(`No studio model covers capability: ${capability}`);
    }
    return candidates.reduce((cheapest, entry) =>
      entry.costCentsPerCall < cheapest.costCentsPerCall ? entry : cheapest,
    );
  }

  /**
   * Validate-and-fallback for the LLM's free-text aspectRatio: values outside
   * the model's allowlist degrade to the model default, never an upstream 400.
   */
  resolveAspectRatio(slug: StudioModelSlug, requested?: string): string {
    const entry = this.getModel(slug);
    if (!requested) return entry.defaultAspectRatio;
    const trimmed = requested.trim();
    return entry.aspectRatios.includes(trimmed)
      ? trimmed
      : entry.defaultAspectRatio;
  }

  /** Per-call budget: latency hint × 3, clamped to 60–180s (plan: "Timeouts"). */
  timeoutMsFor(slug: StudioModelSlug): number {
    const entry = this.getModel(slug);
    const raw = entry.latencyHintSeconds * TIMEOUT_MULTIPLIER * 1000;
    return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, raw));
  }

  getUtility(operation: StudioUtilityOperation): StudioUtilityEntry {
    const entry = this.byOperation.get(operation);
    if (!entry) {
      throw new Error(`Unknown studio utility operation: ${operation}`);
    }
    return entry;
  }

  /**
   * Replicate input for a text-to-image call. Input shaping is per model
   * family; the runner stays generic.
   */
  buildGenerateInput(
    slug: StudioModelSlug,
    prompt: string,
    aspectRatio?: string,
  ): Record<string, unknown> {
    const entry = this.getModel(slug);
    const resolvedRatio = this.resolveAspectRatio(slug, aspectRatio);

    if (entry.replicateId.startsWith("recraft-ai/")) {
      return { prompt, aspect_ratio: resolvedRatio };
    }
    if (entry.replicateId.startsWith("google/")) {
      return { prompt, aspect_ratio: resolvedRatio, output_format: "webp" };
    }
    // openai/gpt-image-2 — exact param names (quality tiers) confirmed at M1.
    return { prompt, aspect_ratio: resolvedRatio };
  }

  /** Replicate input for an image-edit call (image-capable models only). */
  buildEditInput(
    slug: StudioModelSlug,
    instruction: string,
    imageUrls: string[],
  ): Record<string, unknown> {
    const entry = this.getModel(slug);
    if (!entry.capabilities.includes("edit")) {
      throw new Error(`Model ${slug} cannot edit images`);
    }
    if (entry.replicateId.startsWith("google/")) {
      return {
        prompt: instruction,
        image_input: imageUrls,
        output_format: "webp",
      };
    }
    // openai/gpt-image-2 — input key confirmed at M1.
    return { prompt: instruction, image_input: imageUrls };
  }
}
