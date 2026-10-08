/**
 * Client-side feature flags.
 *
 * Frozen UI names remain as metadata for the flag documentation generator.
 * Their frontend entry points have been retired (#177); runtime values are
 * permanently false even when an old deployment supplies a VITE_FEATURE flag.
 */

interface ClientFlagDef<T> {
  envName: string;
  default: T;
  description: string;
  /** If true, this flag has no in-app "off" path beyond the legacy code branch. */
  migrationFlag?: boolean;
}

const FLAG_DEFS = {
  // ── ADR-0002 frozen-stack surfaces ──────────────────────────────
  // Retired frontend registrations. Environment variables cannot restore them;
  // revival requires a reviewed frontend implementation and product decision.
  BILLING_UI: {
    envName: "VITE_FEATURE_BILLING_UI",
    default: false,
    description:
      "Credits badge, per-generation pricing, billing/pricing pages, low-balance warnings. Frozen: validation-phase generation is a hard-capped passthrough (ADR-0002).",
  } satisfies ClientFlagDef<boolean>,
  CONTINUITY_UI: {
    envName: "VITE_FEATURE_CONTINUITY_UI",
    default: false,
    description:
      "Continuity session hydration and continue-scene affordances. Frozen: multi-shot stack (ADR-0002).",
  } satisfies ClientFlagDef<boolean>,
  CONVERGENCE_UI: {
    envName: "VITE_FEATURE_CONVERGENCE_UI",
    default: false,
    description:
      "Camera-motion picker and depth-warp preview (/api/motion/depth). Frozen: convergence pipeline (ADR-0002).",
  } satisfies ClientFlagDef<boolean>,
  SEQUENCE_EDITOR_UI: {
    envName: "VITE_FEATURE_SEQUENCE_EDITOR_UI",
    default: false,
    description:
      "Shot strip, pipeline status, and scene-proxy panels in the results layout. Frozen: multi-shot stack (ADR-0002).",
  } satisfies ClientFlagDef<boolean>,
  MODEL_INTELLIGENCE_UI: {
    envName: "VITE_FEATURE_MODEL_INTELLIGENCE_UI",
    default: false,
    description:
      "Retired model-analysis recommendation calls, telemetry and showroom. Manual supported-model selection remains active.",
  } satisfies ClientFlagDef<boolean>,
} as const;

export const FEATURES = {
  BILLING_UI: false,
  CONTINUITY_UI: false,
  CONVERGENCE_UI: false,
  SEQUENCE_EDITOR_UI: false,
  MODEL_INTELLIGENCE_UI: false,
} as const;

/** Metadata used by the flag documentation generator. Runtime code should read FEATURES. */
export const CLIENT_FLAG_METADATA = FLAG_DEFS;
