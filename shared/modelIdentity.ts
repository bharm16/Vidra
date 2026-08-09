// ============================================================================
// Model identity — the one place that answers "who makes this model, and
// which adapter can actually call it".
//
// Before this table those two facts were restated across eight hand-maintained
// maps using three provider vocabularies, and nothing checked they agreed. The
// divergences that produced are the reason this file exists:
//
//   - `runway` was a "provider" in the capability registry, the client model
//     list, the style adapter and a full prompt-optimizer strategy — but no
//     adapter can call it. Vidra could describe, price and optimize for a
//     provider it had no way to invoke. That is now `generation: []`, a fact
//     the type system carries rather than an accident.
//   - `wan` was listed as a "provider"; it is a model family whose adapter is
//     Replicate. `google` and `gemini` were two names for one relationship.
//
// Hence the split below: VENDOR is who makes the model (what the capability
// registry buckets by), ADAPTER is which client code can dispatch to it.
// Conflating them is what let the drift hide.
//
// PURE by contract: data and total functions only — no Node APIs, no I/O.
// Both client and server import it.
// ============================================================================

import {
  CANONICAL_PROMPT_MODEL_IDS,
  type CanonicalPromptModelId,
} from "./videoModels";

/**
 * Who makes the model. These are the capability-registry buckets
 * (`server/src/services/capabilities/registry.generated.json`), minus the
 * `generic` catch-all which is not a vendor.
 */
export const MODEL_VENDORS = [
  "openai",
  "google",
  "kling",
  "luma",
  "wan",
  "runway",
] as const;
export type ModelVendor = (typeof MODEL_VENDORS)[number];

/**
 * Which server adapter can dispatch a generation call. Mirrors
 * `VideoProviderId` in `server/src/services/video-generation/providers` —
 * the only set of providers that can actually be invoked.
 */
export const GENERATION_ADAPTERS = [
  "replicate",
  "openai",
  "luma",
  "kling",
  "gemini",
] as const;
export type GenerationAdapter = (typeof GENERATION_ADAPTERS)[number];

/**
 * One callable generation-side model.
 *
 * `id` is the literal string a provider SDK accepts. Note these are not all
 * compile-time constants: `WAN_2_5_I2V_MODEL` and `DRAFT_I2V_MODEL` can
 * override two of them at runtime (server/src/config/modelConfig.ts), which
 * is why `VideoModelId` widens to `string` and why the drift gate checks
 * every configured `VIDEO_MODELS` value against this table.
 */
export interface GenerationVariant {
  id: string;
  adapter: GenerationAdapter;
  /** Key into GENERATION_PRICING. */
  pricingKey: string;
}

export interface ModelIdentity {
  canonicalId: CanonicalPromptModelId;
  vendor: ModelVendor;
  /**
   * Every spelling the capability registry uses for this model. A list, not a
   * single id: `wan-2.2` legitimately owns both `wan-2.2` and `wan-2.5`, and
   * `sora-2` owns `sora-2-pro`. Legacy spellings (`veo-4`, `kling-26`) are
   * load-bearing — several tests and a regression suite assert they resolve —
   * so they are recorded here rather than removed.
   */
  capabilityIds: readonly string[];
  /**
   * Callable generation variants, most-preferred first. EMPTY means the model
   * is describable (it has prompt constraints, a capability schema and a
   * prompt strategy) but has no adapter — it cannot be generated with.
   */
  generation: readonly GenerationVariant[];
}

const REPLICATE = (id: string, pricingKey: string): GenerationVariant => ({
  id,
  adapter: "replicate",
  pricingKey,
});

export const MODEL_IDENTITIES: Record<CanonicalPromptModelId, ModelIdentity> = {
  "runway-gen45": {
    canonicalId: "runway-gen45",
    vendor: "runway",
    capabilityIds: ["runway-gen45"],
    // No adapter exists. Describable, not callable — see the header note.
    generation: [],
  },
  "luma-ray3": {
    canonicalId: "luma-ray3",
    vendor: "luma",
    capabilityIds: ["luma-ray3"],
    generation: [{ id: "luma-ray3", adapter: "luma", pricingKey: "luma-ray3" }],
  },
  "kling-2.1": {
    canonicalId: "kling-2.1",
    vendor: "kling",
    capabilityIds: ["kling-2.1", "kling-26"],
    generation: [
      {
        id: "kling-v2-1-master",
        adapter: "kling",
        pricingKey: "kling-v2-1-master",
      },
    ],
  },
  "sora-2": {
    canonicalId: "sora-2",
    vendor: "openai",
    capabilityIds: ["sora-2", "sora-2-pro"],
    generation: [
      { id: "sora-2", adapter: "openai", pricingKey: "sora-2" },
      { id: "sora-2-pro", adapter: "openai", pricingKey: "sora-2-pro" },
    ],
  },
  "veo-3": {
    canonicalId: "veo-3",
    vendor: "google",
    capabilityIds: ["veo-3", "veo-4"],
    generation: [
      { id: "google/veo-3", adapter: "gemini", pricingKey: "google/veo-3" },
    ],
  },
  "wan-2.2": {
    canonicalId: "wan-2.2",
    vendor: "wan",
    capabilityIds: ["wan-2.2", "wan-2.5"],
    generation: [
      REPLICATE("wan-video/wan-2.2-t2v-fast", "wan-2.2"),
      REPLICATE("wan-video/wan-2.2-i2v-fast", "wan-video/wan-2.2-i2v-fast"),
      REPLICATE("wan-video/wan-2.5-i2v", "wan-video/wan-2.5-i2v"),
      REPLICATE("wan-video/wan-2.5-i2v-fast", "wan-2.5"),
    ],
  },
};

/**
 * Callable generation models with no prompt-side canonical model.
 *
 * They are dispatchable and priced, but carry no word-budget constraints,
 * capability schema or prompt strategy — so they cannot appear in
 * `MODEL_IDENTITIES`, whose key domain is the prompt vocabulary. Recording
 * them here is what lets the drift gate tell "unclaimed" apart from "missing".
 */
export const UNCLAIMED_GENERATION_MODELS: readonly GenerationVariant[] = [
  REPLICATE("genmo/mochi-1-final", "genmo/mochi-1-final"),
  REPLICATE("minimax/video-02", "minimax/video-02"),
];

// ─── Derived indices ────────────────────────────────────────────────────────
// Everything below is computed from the table above. Nothing here restates a
// fact; if a lookup is missing an entry, the table is what to edit.

const IDENTITY_LIST: readonly ModelIdentity[] = CANONICAL_PROMPT_MODEL_IDS.map(
  (id) => MODEL_IDENTITIES[id],
);

/** Every callable generation model id → the adapter that dispatches it. */
export const GENERATION_ID_TO_ADAPTER: Record<string, GenerationAdapter> =
  Object.fromEntries(
    [
      ...IDENTITY_LIST.flatMap((identity) => identity.generation),
      ...UNCLAIMED_GENERATION_MODELS,
    ].map((variant) => [variant.id, variant.adapter]),
  );

/** Every capability-registry spelling → the canonical prompt model id. */
export const CAPABILITY_ID_TO_CANONICAL: Record<
  string,
  CanonicalPromptModelId
> = Object.fromEntries(
  IDENTITY_LIST.flatMap((identity) =>
    identity.capabilityIds.map((id) => [id, identity.canonicalId] as const),
  ),
);

/** Canonical prompt model id → the vendor bucket the capability registry uses. */
export const CANONICAL_TO_VENDOR: Record<CanonicalPromptModelId, ModelVendor> =
  Object.fromEntries(
    IDENTITY_LIST.map((identity) => [identity.canonicalId, identity.vendor]),
  ) as Record<CanonicalPromptModelId, ModelVendor>;

/** Capability-registry spelling → vendor bucket. */
export const CAPABILITY_ID_TO_VENDOR: Record<string, ModelVendor> =
  Object.fromEntries(
    IDENTITY_LIST.flatMap((identity) =>
      identity.capabilityIds.map((id) => [id, identity.vendor] as const),
    ),
  );

/**
 * Whether a canonical model can actually be generated with.
 *
 * The single owner of the "describable but not callable" fact, which was
 * previously a hand-written `null` in one availability service.
 */
export function isGenerable(canonicalId: CanonicalPromptModelId): boolean {
  return MODEL_IDENTITIES[canonicalId].generation.length > 0;
}

/** The preferred generation id for a canonical model, or undefined if none. */
export function primaryGenerationId(
  canonicalId: CanonicalPromptModelId,
): string | undefined {
  return MODEL_IDENTITIES[canonicalId].generation[0]?.id;
}

/** Every pricing key this table claims, for the drift gate to reconcile. */
export function declaredPricingKeys(): readonly string[] {
  return [
    ...IDENTITY_LIST.flatMap((identity) =>
      identity.generation.map((variant) => variant.pricingKey),
    ),
    ...UNCLAIMED_GENERATION_MODELS.map((variant) => variant.pricingKey),
  ];
}
