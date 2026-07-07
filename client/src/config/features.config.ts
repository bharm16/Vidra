/**
 * Client-side feature flags.
 *
 * Flags are declared here with metadata so they appear in the generated
 * flag documentation. The legacy pre-canvas layout branch remains exercised
 * by PromptOptimizerWorkspaceView.test.tsx — keep both branches alive until
 * the layout migration is formally concluded.
 */

interface ClientFlagDef<T> {
  envName: string;
  default: T;
  description: string;
  /** If true, this flag has no in-app "off" path beyond the legacy code branch. */
  migrationFlag?: boolean;
}

const FLAG_DEFS = {
  CANVAS_FIRST_LAYOUT: {
    envName: "VITE_FEATURE_CANVAS_FIRST_LAYOUT",
    default: true,
    description:
      "Renders the canvas-first workspace. Set to 'false' to fall back to the legacy sidebar layout.",
    migrationFlag: true,
  } satisfies ClientFlagDef<boolean>,
  // ── ADR-0002 frozen-stack surfaces ──────────────────────────────
  // These gate the client UI for stacks ADR-0002 froze. Default off during
  // the authoring-loop validation phase; thawing a stack means flipping its
  // default here in a reviewed change, not setting env vars in prod.
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
      "Model recommendation calls and dropdown hints on the canvas. Premature per ADR-0002: v1 hardcodes the best model.",
  } satisfies ClientFlagDef<boolean>,
  SPACE_LINEAGE: {
    envName: "VITE_FEATURE_SPACE_LINEAGE",
    default: false,
    description:
      "Renders the workspace's takes as the space — the lineage network (ADR-0012/0013). Persisted lineage (survives reload), live-node camera, leaf-only removal, take-restore, and the node context menu have shipped; off by default pending the in-app visual pass and the remaining menu actions (Animate/Re-roll/Share/Download/New clip).",
  } satisfies ClientFlagDef<boolean>,
} as const;

function resolveBoolFlag(envName: string, fallback: boolean): boolean {
  // import.meta.env is Vite-specific; guard so this module stays importable
  // from Node tooling (e.g. the flag documentation generator).
  const env =
    typeof import.meta !== "undefined"
      ? (import.meta as { env?: Record<string, string | undefined> }).env
      : undefined;
  const raw = env?.[envName];
  if (raw === "false") return false;
  if (raw === "true") return true;
  return fallback;
}

export const FEATURES = {
  CANVAS_FIRST_LAYOUT: resolveBoolFlag(
    FLAG_DEFS.CANVAS_FIRST_LAYOUT.envName,
    FLAG_DEFS.CANVAS_FIRST_LAYOUT.default,
  ),
  BILLING_UI: resolveBoolFlag(
    FLAG_DEFS.BILLING_UI.envName,
    FLAG_DEFS.BILLING_UI.default,
  ),
  CONTINUITY_UI: resolveBoolFlag(
    FLAG_DEFS.CONTINUITY_UI.envName,
    FLAG_DEFS.CONTINUITY_UI.default,
  ),
  CONVERGENCE_UI: resolveBoolFlag(
    FLAG_DEFS.CONVERGENCE_UI.envName,
    FLAG_DEFS.CONVERGENCE_UI.default,
  ),
  SEQUENCE_EDITOR_UI: resolveBoolFlag(
    FLAG_DEFS.SEQUENCE_EDITOR_UI.envName,
    FLAG_DEFS.SEQUENCE_EDITOR_UI.default,
  ),
  MODEL_INTELLIGENCE_UI: resolveBoolFlag(
    FLAG_DEFS.MODEL_INTELLIGENCE_UI.envName,
    FLAG_DEFS.MODEL_INTELLIGENCE_UI.default,
  ),
  SPACE_LINEAGE: resolveBoolFlag(
    FLAG_DEFS.SPACE_LINEAGE.envName,
    FLAG_DEFS.SPACE_LINEAGE.default,
  ),
} as const;

/** Metadata used by the flag documentation generator. Runtime code should read FEATURES. */
export const CLIENT_FLAG_METADATA = FLAG_DEFS;
