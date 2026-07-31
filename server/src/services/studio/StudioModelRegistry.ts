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
    // $0.25/image, verified on the model page 2026-07-25.
    costCentsPerCall: 25,
    costVerified: true,
    latencyHintSeconds: 14,
    aspectRatios: COMMON_ASPECT_RATIOS,
    defaultAspectRatio: "1:1",
  },
  {
    slug: "nano-banana-2",
    displayName: "Nano Banana 2",
    replicateId: "google/nano-banana-2",
    capabilities: ["general", "edit"],
    // $0.067/image at the pinned 1K resolution (2K $0.101, 4K $0.151),
    // verified 2026-07-25. ceil → 7¢ reserved.
    costCentsPerCall: 7,
    costVerified: true,
    latencyHintSeconds: 25,
    aspectRatios: COMMON_ASPECT_RATIOS,
    defaultAspectRatio: "1:1",
    pinnedInput: { resolution: "1K" },
  },
  {
    slug: "nano-banana-2-lite",
    displayName: "Nano Banana 2 Lite",
    replicateId: "google/nano-banana-2-lite",
    capabilities: ["general", "edit"],
    // $0.034/image flat (no resolution knob — always 1K), verified
    // 2026-07-25. ceil → 4¢ reserved.
    costCentsPerCall: 4,
    costVerified: true,
    latencyHintSeconds: 4,
    aspectRatios: COMMON_ASPECT_RATIOS,
    defaultAspectRatio: "1:1",
  },
  {
    slug: "nano-banana-pro",
    displayName: "Nano Banana Pro",
    replicateId: "google/nano-banana-pro",
    capabilities: ["general", "edit"],
    // $0.15/image at 1K and 2K (4K $0.30), verified 2026-07-25. Pinned to
    // 2K — the model's default and the best quality at the 15¢ price.
    costCentsPerCall: 15,
    costVerified: true,
    latencyHintSeconds: 30,
    aspectRatios: COMMON_ASPECT_RATIOS,
    defaultAspectRatio: "1:1",
    pinnedInput: { resolution: "2K" },
  },
  {
    slug: "gpt-image-2",
    displayName: "GPT Image 2",
    replicateId: "openai/gpt-image-2",
    capabilities: ["general", "edit"],
    // Priced by the `quality` input: high/auto $0.128, medium $0.047,
    // low $0.012 — verified 2026-07-25. Pinned to high (same price as
    // auto, deterministic quality). ceil → 13¢ reserved.
    costCentsPerCall: 13,
    costVerified: true,
    latencyHintSeconds: 45,
    aspectRatios: COMMON_ASPECT_RATIOS,
    defaultAspectRatio: "1:1",
    pinnedInput: { quality: "high" },
  },
] as const;

/**
 * The standard editor Auto-mode edit turns run on. Deliberately NOT the
 * cheapest edit-capable entry — see editDefault for the ruling.
 */
const DEFAULT_EDIT_SLUG: StudioModelSlug = "nano-banana-2";

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
   * capable"). Edit is the one carve-out: see editDefault.
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
   * Auto mode for EDIT actions. An edit is a precision operation — the
   * instruction typically demands "change X, keep everything else
   * identical" — and the cheapest editor (the speed-tier lite model)
   * repaints instead of preserving: a recolor request came back with a
   * different pose. Auto edits therefore route to the standard editor;
   * the lite tier stays reachable by pinning it. This is a deliberate,
   * narrow amendment to the "Auto routing = cheapest capable" ruling.
   */
  editDefault(): StudioModelEntry {
    return this.getModel(DEFAULT_EDIT_SLUG);
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

  /** Per-call budget for a utility, same rule as models (latency × 3, clamped). */
  timeoutMsForUtility(operation: StudioUtilityOperation): number {
    const entry = this.getUtility(operation);
    const raw = entry.latencyHintSeconds * TIMEOUT_MULTIPLIER * 1000;
    return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, raw));
  }

  /**
   * Replicate input for a prompt-less utility call. Both Recraft utilities
   * take exactly one `image` URI (plan: "Utilities").
   */
  buildUtilityInput(
    operation: StudioUtilityOperation,
    imageUrl: string,
  ): Record<string, unknown> {
    this.getUtility(operation);
    return { image: imageUrl };
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
    // pinnedInput pins by-property pricing tiers (resolution/quality) so
    // the reserved cost is exact — never omit it.
    const pinned = entry.pinnedInput ?? {};

    if (entry.replicateId.startsWith("recraft-ai/")) {
      return { prompt, aspect_ratio: resolvedRatio, ...pinned };
    }
    if (entry.replicateId.startsWith("google/")) {
      // png, not webp: nano-banana-2-lite only accepts jpg/png (live 422,
      // 2026-07-24) — png is the value the whole google family accepts.
      return {
        prompt,
        aspect_ratio: resolvedRatio,
        output_format: "png",
        ...pinned,
      };
    }
    // openai/gpt-image-2 — quality tier pinned via pinnedInput.
    return { prompt, aspect_ratio: resolvedRatio, ...pinned };
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
    const pinned = entry.pinnedInput ?? {};
    if (entry.replicateId.startsWith("google/")) {
      return {
        prompt: instruction,
        image_input: imageUrls,
        // Family-wide value — the lite tier rejects webp (live 422).
        output_format: "png",
        ...pinned,
      };
    }
    // openai/gpt-image-2 — quality tier pinned via pinnedInput.
    return { prompt: instruction, image_input: imageUrls, ...pinned };
  }
}
