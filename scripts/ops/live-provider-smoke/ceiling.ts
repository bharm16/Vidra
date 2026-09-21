/**
 * The smoke's cost ceiling, DERIVED — issue #140's load-bearing rule:
 *
 *   "The ceiling is derived from bounded request parameters and conservative
 *   cost assumptions, including permitted retries and fallbacks; a fixed call
 *   count is not proof of a dollar ceiling."
 *
 * Every input comes from a live source in the codebase, so the ceiling moves
 * when the bounded parameters move:
 *
 *   sketch frame     SKETCH_FRAME_COST_MILLICENTS (env.ts — the relay's own
 *                    deliberate per-frame overestimate) × 1 dispatch.
 *   studio turn LLM  ModelConfig.studio_turn's maxTokens × llmCosts' per-1K
 *                    rate for the configured model, with a conservative
 *                    input-token bound, × StudioPolicyEngine's
 *                    MAX_POLICY_ATTEMPTS (the real re-ask policy).
 *   studio edit      StudioModelRegistry.editDefault().costCentsPerCall —
 *                    refused (unknown bound) if the entry is not costVerified.
 *   first frame      a documented conservative per-image bound per t2i-capable
 *                    provider in the configured IMAGE_PREVIEW_PROVIDER_ORDER
 *                    (the plan's permitted fallbacks); an order naming a
 *                    provider with no bound is an unknown bound, not a guess.
 *
 * The sum × a safety factor, rounded up to whole cents, is the dollar
 * ceiling; the summed permitted calls are the request ceiling. A leg whose
 * bound cannot be derived makes the WHOLE derivation fail — the run then
 * reports non-verification rather than passing with a partially-known
 * ceiling.
 *
 * Pure module: no imports from server/src, no I/O. The one place that turns
 * live sources into inputs is `collectSmokeCeilingInputs`, which takes
 * everything it reads as parameters so unit tests can fake each source.
 */

import type { SmokeLegId } from "./types";

/**
 * Conservative bound on the studio turn's INPUT tokens (system prompt with
 * roster and rules, history, attachments). The template is ~6K tokens today;
 * 12K leaves 2× headroom, and at the fallback rate the overestimate is worth
 * about a third of a cent.
 */
export const STUDIO_TURN_INPUT_TOKEN_BOUND = 12_000;

/**
 * Conservative per-image USD bounds for the first-frame leg, by preview
 * provider id. Replicate lists black-forest-labs/flux-schnell at $0.003 per
 * image; the bound is 3× that. An id missing from this table is an UNKNOWN
 * bound — the derivation refuses rather than guessing.
 */
export const FIRST_FRAME_PROVIDER_COST_USD: Readonly<Record<string, number>> = {
  "replicate-flux-schnell": 0.01,
};

/**
 * Headroom over the summed leg bounds for the assumptions a per-leg model
 * cannot see: provider-side rate-limit retries inside one call, currency/
 * pricing drift between the bound and the invoice, and the run's own
 * overhead. Deliberately generous without making the ceiling meaningless.
 */
export const DEFAULT_SAFETY_FACTOR = 1.5;

/** The bounded cost model for one leg. */
export interface SmokeLegCost {
  leg: SmokeLegId;
  /** Bounded USD cost of ONE call of this leg. */
  unitCostUsd: number;
  /** Permitted calls: the primary call plus its own retries/fallbacks. */
  permittedCalls: number;
  /** Where the bound came from — verbatim into the run report. */
  derivation: string;
}

/** The derived, enforced ceiling. */
export interface DerivedSmokeCeiling {
  legs: readonly SmokeLegCost[];
  /** Sum of unit × calls × safety factor, rounded UP to whole USD cents. */
  ceilingUsd: number;
  /** Sum of permitted calls — the request ceiling. */
  ceilingCalls: number;
  /** The pre-rounding, pre-safety-factor sum, kept for the report. */
  preSafetySumUsd: number;
  safetyFactor: number;
}

export type SmokeCeilingDerivation =
  | { ok: true; ceiling: DerivedSmokeCeiling }
  | { ok: false; unknownBounds: readonly string[] };

/** Raw inputs — one field per live source, each independently fakeable. */
export interface SmokeCeilingInputs {
  /** env.ts sketchRelaySchema: the relay's own per-frame overestimate, millicents. */
  sketchFrameCostMillicents: number;
  studioTurn: {
    /** ModelConfig.studio_turn.model (client-side, for the llmCosts lookup). */
    model: string;
    /** ModelConfig.studio_turn.maxTokens — the completion bound. */
    maxOutputTokens: number;
    /** StudioPolicyEngine.MAX_POLICY_ATTEMPTS — the real re-ask policy. */
    policyAttempts: number;
    /** Conservative input-token bound (STUDIO_TURN_INPUT_TOKEN_BOUND). */
    inputTokenBound: number;
  };
  /** editDefault()'s entry; null when no edit-capable model resolves. */
  studioEdit: {
    slug: string;
    costCentsPerCall: number;
    costVerified: boolean;
  } | null;
  /** Ordered t2i-capable preview provider ids the first-frame plan can dispatch. */
  firstFrameProviderIds: readonly string[];
  safetyFactor: number;
}

/** One leg's bound, or the reason it could not be derived. */
type LegDerivation =
  | { ok: true; leg: SmokeLegCost }
  | { ok: false; unknown: string };

function deriveSketchFrameLeg(millicents: number): LegDerivation {
  if (!Number.isFinite(millicents) || millicents <= 0) {
    return {
      ok: false,
      unknown: `sketch frame: SKETCH_FRAME_COST_MILLICENTS is ${String(millicents)} — no positive per-frame bound`,
    };
  }
  return {
    ok: true,
    leg: {
      leg: "sketch-frame",
      unitCostUsd: millicents / 100_000,
      permittedCalls: 1,
      derivation: `SKETCH_FRAME_COST_MILLICENTS=${String(millicents)} (the relay's deliberate per-frame overestimate) × 1 dispatch (the relay does not retry)`,
    },
  };
}

/**
 * Cost of one studio_turn LLM attempt. Declared as a seam (rather than
 * imported from @config/llmCosts) so this module stays pure: the caller
 * injects the repo's own rate lookup.
 */
export type LlmCostLookup = (
  model: string,
  inputTokens: number,
  outputTokens: number,
) => number;

function deriveStudioTurnLeg(
  input: SmokeCeilingInputs["studioTurn"],
  llmCost: LlmCostLookup,
): LegDerivation {
  if (input.policyAttempts < 1 || input.maxOutputTokens < 1) {
    return {
      ok: false,
      unknown: `studio turn: inhuman policy bounds (attempts=${String(input.policyAttempts)}, maxTokens=${String(input.maxOutputTokens)})`,
    };
  }
  const perAttemptUsd = llmCost(
    input.model,
    input.inputTokenBound,
    input.maxOutputTokens,
  );
  if (!Number.isFinite(perAttemptUsd) || perAttemptUsd <= 0) {
    return {
      ok: false,
      unknown: `studio turn: llmCosts returned no usable rate for model "${input.model}"`,
    };
  }
  return {
    ok: true,
    leg: {
      leg: "studio-turn",
      unitCostUsd: perAttemptUsd,
      permittedCalls: input.policyAttempts,
      derivation: `${String(input.policyAttempts)} studio_turn asks (MAX_POLICY_ATTEMPTS) × [${String(input.inputTokenBound)} input tokens bound + maxTokens=${String(input.maxOutputTokens)}] at llmCosts' rate for "${input.model}" = $${perAttemptUsd.toFixed(6)}/attempt`,
    },
  };
}

function deriveStudioEditLeg(
  edit: SmokeCeilingInputs["studioEdit"],
): LegDerivation {
  if (!edit) {
    return {
      ok: false,
      unknown:
        "studio edit image: StudioModelRegistry has no edit-capable model — the edit turn cannot be costed",
    };
  }
  if (!edit.costVerified) {
    return {
      ok: false,
      unknown: `studio edit image: roster entry "${edit.slug}" is not costVerified — reserving against an unverified price is an unknown bound`,
    };
  }
  if (!Number.isFinite(edit.costCentsPerCall) || edit.costCentsPerCall <= 0) {
    return {
      ok: false,
      unknown: `studio edit image: roster entry "${edit.slug}" has no positive costCentsPerCall`,
    };
  }
  return {
    ok: true,
    leg: {
      leg: "studio-edit-image",
      unitCostUsd: edit.costCentsPerCall / 100,
      permittedCalls: 1,
      derivation: `StudioModelRegistry.editDefault() = "${edit.slug}" at ${String(edit.costCentsPerCall)}¢/call (costVerified) × 1 call (an edit turn's callCount)`,
    },
  };
}

function deriveFirstFrameLeg(
  providerIds: readonly string[],
): LegDerivation {
  if (providerIds.length === 0) {
    return {
      ok: false,
      unknown:
        "first frame: the provider plan has no text-to-image-capable provider — nothing to cost",
    };
  }
  let total = 0;
  for (const id of providerIds) {
    const bound = FIRST_FRAME_PROVIDER_COST_USD[id];
    if (bound === undefined || !Number.isFinite(bound) || bound <= 0) {
      return {
        ok: false,
        unknown: `first frame: preview provider "${id}" is in the permitted plan but has no per-image cost bound (FIRST_FRAME_PROVIDER_COST_USD) — refusing to guess`,
      };
    }
    total += bound;
  }
  return {
    ok: true,
    leg: {
      leg: "first-frame",
      unitCostUsd: total,
      permittedCalls: 1,
      derivation: `t2i plan [${providerIds.join(", ")}] at documented conservative per-image bounds × 1 request (ImageGenerationService may fall back within this plan; the bound already covers every provider it can reach)`,
    },
  };
}

/** Derive the whole ceiling. ANY unknown leg bound fails the derivation. */
export function deriveSmokeCeiling(
  inputs: SmokeCeilingInputs,
  llmCost: LlmCostLookup,
): SmokeCeilingDerivation {
  const derivations = [
    deriveSketchFrameLeg(inputs.sketchFrameCostMillicents),
    deriveStudioTurnLeg(inputs.studioTurn, llmCost),
    deriveStudioEditLeg(inputs.studioEdit),
    deriveFirstFrameLeg(inputs.firstFrameProviderIds),
  ];

  const unknownBounds = derivations
    .filter((d): d is { ok: false; unknown: string } => !d.ok)
    .map((d) => d.unknown);
  if (unknownBounds.length > 0) {
    return { ok: false, unknownBounds };
  }

  const legs = derivations
    .map((d) => (d.ok ? d.leg : null))
    .filter((leg): leg is SmokeLegCost => leg !== null);
  const preSafetySumUsd = legs.reduce(
    (sum, leg) => sum + leg.unitCostUsd * leg.permittedCalls,
    0,
  );
  const safetyFactor =
    Number.isFinite(inputs.safetyFactor) && inputs.safetyFactor >= 1
      ? inputs.safetyFactor
      : DEFAULT_SAFETY_FACTOR;
  // Whole cents, rounding up: a ceiling that shaves the fraction off could
  // let the run plan a spend just above it.
  const ceilingUsd = Math.ceil(preSafetySumUsd * safetyFactor * 100) / 100;
  const ceilingCalls = legs.reduce(
    (sum, leg) => sum + leg.permittedCalls,
    0,
  );

  return { ok: true, ceiling: { legs, ceilingUsd, ceilingCalls, preSafetySumUsd, safetyFactor } };
}

// ── Live sources ────────────────────────────────────────────────────────

/**
 * The live values `collectSmokeCeilingInputs` reads. Plain data so the
 * assembler is testable without importing server modules.
 */
export interface LiveCeilingSources {
  /** env.ts sketchRelaySchema values (config.fal on the DI container). */
  sketchFrameCostMillicents: number;
  /** ModelConfig.studio_turn — model id and completion bound. */
  studioTurnModel: string;
  studioTurnMaxOutputTokens: number;
  /** StudioPolicyEngine.MAX_POLICY_ATTEMPTS. */
  studioPolicyAttempts: number;
  /** StudioModelRegistry.editDefault(), null when it throws. */
  studioEditModel: {
    slug: string;
    costCentsPerCall: number;
    costVerified: boolean;
  } | null;
  /** IMAGE_PREVIEW_PROVIDER_ORDER, verbatim (undefined = unset). */
  imagePreviewProviderOrder: string | undefined;
}

/**
 * The t2i-capable subset of the preview provider roster. Kontext is
 * img2img-only (requiresInputImage), so a prompt-only first-frame request
 * can never reach it — the plan derivation skips it, exactly as
 * buildProviderPlan does.
 */
const T2I_CAPABLE_PREVIEW_PROVIDERS: ReadonlySet<string> = new Set([
  "replicate-flux-schnell",
]);

/**
 * Parse IMAGE_PREVIEW_PROVIDER_ORDER the way the image-generation DI config
 * does (comma-separated, deduped, unknown tokens dropped), then keep only the
 * t2i-capable providers — the first-frame request's real permitted plan.
 * Returns null for an unset order (auto plan: the roster's t2i-capable
 * providers, in roster order).
 */
export function resolveFirstFrameProviderPlan(
  rawOrder: string | undefined,
): readonly string[] | null {
  if (rawOrder === undefined || rawOrder.trim() === "") {
    return null;
  }
  const parsed: string[] = [];
  for (const token of rawOrder.split(",")) {
    const id = token.trim().toLowerCase();
    if (
      T2I_CAPABLE_PREVIEW_PROVIDERS.has(id) &&
      !parsed.includes(id)
    ) {
      parsed.push(id);
    }
  }
  return parsed;
}

/** Assemble the derivation inputs from live sources. */
export function collectSmokeCeilingInputs(
  sources: LiveCeilingSources,
): SmokeCeilingInputs {
  const plan = resolveFirstFrameProviderPlan(sources.imagePreviewProviderOrder);
  return {
    sketchFrameCostMillicents: sources.sketchFrameCostMillicents,
    studioTurn: {
      model: sources.studioTurnModel,
      maxOutputTokens: sources.studioTurnMaxOutputTokens,
      policyAttempts: sources.studioPolicyAttempts,
      inputTokenBound: STUDIO_TURN_INPUT_TOKEN_BOUND,
    },
    studioEdit: sources.studioEditModel,
    // Unset order → auto plan: every t2i-capable provider in the roster, in
    // roster order — the same set buildProviderPlan's auto branch would walk.
    firstFrameProviderIds: plan ?? [...T2I_CAPABLE_PREVIEW_PROVIDERS],
    safetyFactor: DEFAULT_SAFETY_FACTOR,
  };
}
