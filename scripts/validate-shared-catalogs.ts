#!/usr/bin/env node
/**
 * Drift detector for hand-maintained shared catalogs.
 *
 * The shared/ layer carries three hand-maintained catalogs that the server
 * also knows about:
 *   - CANONICAL_PROMPT_MODEL_IDS + PROMPT_MODEL_ALIASES + PROMPT_MODEL_CONSTRAINTS (videoModels.ts)
 *   - GENERATION_PRICING (generationPricing.ts)
 *
 * This script checks internal consistency AND cross-checks server fallback
 * values that were meant to mirror shared. It's a lightweight safety net
 * (no API changes required) — run in CI to catch drift before deploy.
 *
 * Usage:
 *   npx tsx scripts/validate-shared-catalogs.ts          # report + exit 0 if clean
 *   npx tsx scripts/validate-shared-catalogs.ts --strict # exit 1 on any issue
 */

import {
  CANONICAL_PROMPT_MODEL_IDS,
  PROMPT_MODEL_ALIASES,
  PROMPT_MODEL_CONSTRAINTS,
} from "../shared/videoModels.ts";
import {
  GENERATION_PRICING,
  getGenerationCreditsPerSecond,
} from "../shared/generationPricing.ts";
import {
  CAPABILITY_ID_TO_VENDOR,
  GENERATION_ADAPTERS,
  GENERATION_ID_TO_ADAPTER,
  MODEL_IDENTITIES,
  declaredPricingKeys,
} from "../shared/modelIdentity.ts";
import { ModelConfig, VIDEO_MODELS } from "../server/src/config/modelConfig.ts";
import {
  REGISTERED_LLM_CLIENTS,
  isRegisteredLlmClient,
} from "../server/src/config/llmClients.ts";
import { MANUAL_CAPABILITIES_REGISTRY } from "../server/src/services/capabilities/manualRegistry.ts";
import generatedRegistry from "../server/src/services/capabilities/registry.generated.json" with { type: "json" };

interface Finding {
  severity: "error" | "warn";
  category: string;
  message: string;
}

const findings: Finding[] = [];

function err(category: string, message: string): void {
  findings.push({ severity: "error", category, message });
}

function warn(category: string, message: string): void {
  findings.push({ severity: "warn", category, message });
}

// ─── Check 1: every canonical model has a self-alias ────────────────
for (const canonical of CANONICAL_PROMPT_MODEL_IDS) {
  if (PROMPT_MODEL_ALIASES[canonical] !== canonical) {
    err(
      "aliases",
      `Canonical model "${canonical}" is missing a self-alias in PROMPT_MODEL_ALIASES (or points elsewhere).`,
    );
  }
}

// ─── Check 2: every canonical model has constraints ─────────────────
for (const canonical of CANONICAL_PROMPT_MODEL_IDS) {
  if (!(canonical in PROMPT_MODEL_CONSTRAINTS)) {
    err(
      "constraints",
      `Canonical model "${canonical}" is missing an entry in PROMPT_MODEL_CONSTRAINTS.`,
    );
  }
}

// ─── Check 3: no PROMPT_MODEL_CONSTRAINTS keys that aren't canonical ─
for (const key of Object.keys(PROMPT_MODEL_CONSTRAINTS)) {
  if (!(CANONICAL_PROMPT_MODEL_IDS as readonly string[]).includes(key)) {
    err(
      "constraints",
      `PROMPT_MODEL_CONSTRAINTS has an entry for "${key}" which is not in CANONICAL_PROMPT_MODEL_IDS.`,
    );
  }
}

// ─── Check 4: alias targets are all canonical ───────────────────────
for (const [alias, target] of Object.entries(PROMPT_MODEL_ALIASES)) {
  if (!(CANONICAL_PROMPT_MODEL_IDS as readonly string[]).includes(target)) {
    err(
      "aliases",
      `Alias "${alias}" points to "${target}" which is not a canonical model id.`,
    );
  }
}

// ─── Check 5: every canonical model has pricing (direct or via alias) ─
for (const canonical of CANONICAL_PROMPT_MODEL_IDS) {
  const direct = getGenerationCreditsPerSecond(canonical);
  if (direct == null) {
    // Check if any alias maps to this canonical id AND has pricing
    const pricedAlias = Object.entries(PROMPT_MODEL_ALIASES).find(
      ([aliasKey, target]) =>
        target === canonical &&
        aliasKey !== canonical &&
        getGenerationCreditsPerSecond(aliasKey) != null,
    );
    if (!pricedAlias) {
      warn(
        "pricing",
        `Canonical model "${canonical}" has no direct pricing in GENERATION_PRICING and no priced alias. UI will fall back to hardcoded defaults.`,
      );
    }
  }
}

// ─── Check 6: every pricing key is resolvable ───────────────────────
// A key is reachable either through the PROMPT vocabulary (an alias or a
// canonical id) or through the GENERATION vocabulary (a variant declared in
// the identity table). Checking only the first is why `sora-2-pro`,
// `minimax/video-02` and `genmo/mochi-1-final` looked unreachable: they are
// callable generation models that no prompt-side model claims.
const resolvableKeys = new Set<string>([
  ...CANONICAL_PROMPT_MODEL_IDS,
  ...Object.keys(PROMPT_MODEL_ALIASES),
  ...declaredPricingKeys(),
  // Known non-video pricing keys that are intentionally outside the model registry:
  "flux-kontext",
  "storyboard",
]);
for (const priceKey of Object.keys(GENERATION_PRICING)) {
  if (!resolvableKeys.has(priceKey)) {
    warn(
      "pricing",
      `GENERATION_PRICING has an entry for "${priceKey}" which is not in the canonical set or alias table. It is effectively unreachable via prompt flow.`,
    );
  }
}

// ─── Identity checks ────────────────────────────────────────────────
// These exist because "which provider runs this model" was restated across
// eight hand-maintained tables in three vocabularies with nothing checking
// they agreed. shared/modelIdentity.ts is now the answer key; the checks
// below hold every other table to it.

const capabilityBuckets: Record<string, Record<string, unknown>> = {};
for (const [bucket, models] of Object.entries(MANUAL_CAPABILITIES_REGISTRY)) {
  capabilityBuckets[bucket] = { ...models };
}
for (const [bucket, models] of Object.entries(
  generatedRegistry as Record<string, Record<string, unknown>>,
)) {
  capabilityBuckets[bucket] = { ...capabilityBuckets[bucket], ...models };
}

// ─── Check 7: every declared capability id exists in the registry ───
for (const identity of Object.values(MODEL_IDENTITIES)) {
  for (const capabilityId of identity.capabilityIds) {
    const bucket = capabilityBuckets[identity.vendor];
    if (!bucket || !(capabilityId in bucket)) {
      err(
        "identity",
        `MODEL_IDENTITIES["${identity.canonicalId}"] claims capability id "${capabilityId}" under vendor "${identity.vendor}", but the capability registry has no such entry.`,
      );
    }
  }
}

// ─── Check 8: every registry model is claimed by exactly one identity ─
for (const [bucket, models] of Object.entries(capabilityBuckets)) {
  if (bucket === "generic") continue;
  for (const modelId of Object.keys(models)) {
    const vendor = CAPABILITY_ID_TO_VENDOR[modelId];
    if (!vendor) {
      err(
        "identity",
        `Capability registry declares "${modelId}" under "${bucket}", but no entry in MODEL_IDENTITIES claims it. Add it to capabilityIds, or drop it from the registry.`,
      );
    } else if (vendor !== bucket) {
      err(
        "identity",
        `Capability registry files "${modelId}" under vendor "${bucket}", but MODEL_IDENTITIES says its vendor is "${vendor}".`,
      );
    }
  }
}

// ─── Check 9: adapters named by the identity table are real ─────────
for (const [generationId, adapter] of Object.entries(
  GENERATION_ID_TO_ADAPTER,
)) {
  if (!(GENERATION_ADAPTERS as readonly string[]).includes(adapter)) {
    err(
      "identity",
      `Generation model "${generationId}" names adapter "${adapter}", which is not a GenerationAdapter.`,
    );
  }
}

// ─── Check 10: every configured VIDEO_MODELS value has an adapter ───
// This is the check that would have caught the standing env-override hole:
// WAN_2_5_I2V_MODEL and DRAFT_I2V_MODEL can point VIDEO_MODELS at a model id
// the identity table has never heard of, and provider resolution then falls
// through to Replicate by default rather than failing.
for (const [key, configuredId] of Object.entries(VIDEO_MODELS)) {
  if (!GENERATION_ID_TO_ADAPTER[configuredId]) {
    warn(
      "identity",
      `VIDEO_MODELS.${key} is configured as "${configuredId}", which has no entry in the identity table. Provider resolution will fall back to "replicate" for it.`,
    );
  }
}

// ─── Check 11: declared pricing keys exist ──────────────────────────
for (const pricingKey of declaredPricingKeys()) {
  if (!(pricingKey in GENERATION_PRICING)) {
    err(
      "identity",
      `The identity table declares pricing key "${pricingKey}", which is absent from GENERATION_PRICING.`,
    );
  }
}

// ─── Check 12: every ModelConfig client is actually registered ──────
// `llm_judge_general` shipped naming `anthropic`, which has no adapter, no DI
// registration and no key. It did not fail loudly — the router remapped it —
// so the declared judge model simply never ran. This is the check that would
// have caught it.
for (const [operation, entry] of Object.entries(ModelConfig)) {
  if (!isRegisteredLlmClient(entry.client)) {
    err(
      "routing",
      `ModelConfig.${operation} names client "${entry.client}", which is not a registered LLM client (${REGISTERED_LLM_CLIENTS.join(", ")}). The router will silently remap it, so the declared model never runs.`,
    );
  }

  const fallback = (entry as { fallbackTo?: string }).fallbackTo;
  if (fallback && !isRegisteredLlmClient(fallback)) {
    err(
      "routing",
      `ModelConfig.${operation} declares fallbackTo "${fallback}", which is not a registered LLM client (${REGISTERED_LLM_CLIENTS.join(", ")}).`,
    );
  }
}

// ─── Report ─────────────────────────────────────────────────────────
const strict = process.argv.includes("--strict");
const errors = findings.filter((f) => f.severity === "error");
const warns = findings.filter((f) => f.severity === "warn");

if (findings.length === 0) {
  process.stdout.write("Shared catalogs are consistent. ✓\n");
  process.exit(0);
}

const byCategory = new Map<string, Finding[]>();
for (const f of findings) {
  const bucket = byCategory.get(f.category) ?? [];
  bucket.push(f);
  byCategory.set(f.category, bucket);
}

for (const [category, entries] of byCategory) {
  process.stdout.write(`\n[${category}]\n`);
  for (const f of entries) {
    const tag = f.severity === "error" ? "ERROR" : "WARN ";
    process.stdout.write(`  ${tag}  ${f.message}\n`);
  }
}

process.stdout.write(
  `\nSummary: ${errors.length} error(s), ${warns.length} warning(s).\n`,
);

if (errors.length > 0 || (strict && warns.length > 0)) {
  process.exit(1);
}
process.exit(0);
