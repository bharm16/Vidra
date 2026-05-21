/**
 * Variant preset registry for the synthetic matrix orchestrator.
 *
 * Each preset names a (surface, model) combination via env-var overrides
 * that modelConfig.ts already honors. The matrix orchestrator (run-matrix.ts)
 * spawns one subprocess per preset with the env merged into process.env;
 * the subprocess's drivers read modelConfig.ts as usual, but get the routed
 * model from the preset.
 *
 * See docs/superpowers/specs/2026-05-21-synthetic-model-matrix-design.md
 * § 2.1 for the design rationale.
 */

export type Surface = "suggestions" | "optimize" | "span-labeling";

export interface VariantPreset {
  /** Short identifier — used in CLI flags AND as the modelVariant tag. */
  name: string;
  /** Which surface this preset configures. */
  surface: Surface;
  /** Env vars to set in the subprocess running under this preset. */
  env: Record<string, string>;
  /** Human-readable. Printed by `--list-variants`. */
  description: string;
}

/**
 * Whitelist of env-var keys a preset may set. Matches the per-operation
 * provider/model env vars exposed by server/src/config/modelConfig.ts plus
 * the per-provider model overrides read by scripts/synthetic/utils/aiService.ts.
 */
export const VALID_ENV_KEYS = [
  "ENHANCE_PROVIDER",
  "ENHANCE_MODEL",
  "OPTIMIZE_PROVIDER",
  "OPTIMIZE_MODEL",
  "SPAN_PROVIDER",
  "SPAN_MODEL",
  "OPENAI_MODEL",
  "QWEN_MODEL",
  "GEMINI_MODEL",
  "GROQ_MODEL",
] as const;

export const VARIANTS: VariantPreset[] = [
  // -- suggestions --
  {
    name: "qwen",
    surface: "suggestions",
    env: { ENHANCE_PROVIDER: "qwen", ENHANCE_MODEL: "qwen/qwen3-32b" },
    description: "Qwen 3 32B via Groq (current prod default)",
  },
  {
    name: "gemini",
    surface: "suggestions",
    env: { ENHANCE_PROVIDER: "gemini", ENHANCE_MODEL: "gemini-2.5-flash" },
    description: "Gemini 2.5 Flash for suggestions",
  },
  {
    name: "openai-mini",
    surface: "suggestions",
    env: {
      ENHANCE_PROVIDER: "openai",
      ENHANCE_MODEL: "gpt-4o-mini-2024-07-18",
    },
    description: "GPT-4o-mini for suggestions",
  },

  // -- optimize --
  {
    name: "openai",
    surface: "optimize",
    env: { OPTIMIZE_PROVIDER: "openai", OPTIMIZE_MODEL: "gpt-4o-2024-08-06" },
    description: "GPT-4o for optimize (current prod default)",
  },
  {
    name: "openai-mini",
    surface: "optimize",
    env: {
      OPTIMIZE_PROVIDER: "openai",
      OPTIMIZE_MODEL: "gpt-4o-mini-2024-07-18",
    },
    description: "GPT-4o-mini for optimize (cheaper)",
  },
  {
    name: "qwen",
    surface: "optimize",
    env: { OPTIMIZE_PROVIDER: "qwen", OPTIMIZE_MODEL: "qwen/qwen3-32b" },
    description: "Qwen 3 32B for optimize",
  },

  // -- span-labeling --
  {
    name: "gemini",
    surface: "span-labeling",
    env: { SPAN_PROVIDER: "gemini", SPAN_MODEL: "gemini-2.5-flash" },
    description: "Gemini 2.5 Flash (current prod default)",
  },
  {
    name: "gemini-pro",
    surface: "span-labeling",
    env: { SPAN_PROVIDER: "gemini", SPAN_MODEL: "gemini-2.5-pro" },
    description: "Gemini 2.5 Pro (slower, possibly higher quality)",
  },
];

const VALID_ENV_KEY_SET = new Set<string>(VALID_ENV_KEYS);
const VALID_SURFACES = new Set<Surface>([
  "suggestions",
  "optimize",
  "span-labeling",
]);

/**
 * Asserts every preset in VARIANTS satisfies the authoring invariants.
 * Throws on the first violation with a message that identifies the
 * offending preset by name + surface.
 */
export function validateAllPresets(): void {
  const seen = new Set<string>();
  for (const preset of VARIANTS) {
    if (!VALID_SURFACES.has(preset.surface)) {
      throw new Error(
        `Variant '${preset.name}' has unknown surface '${preset.surface}'. Must be one of: ${[...VALID_SURFACES].join(", ")}.`,
      );
    }
    const dedupKey = `${preset.surface}:${preset.name}`;
    if (seen.has(dedupKey)) {
      throw new Error(
        `Variant '${preset.name}' is duplicated within surface '${preset.surface}'.`,
      );
    }
    seen.add(dedupKey);
    for (const key of Object.keys(preset.env)) {
      if (!VALID_ENV_KEY_SET.has(key)) {
        throw new Error(
          `Variant '${preset.name}' (surface '${preset.surface}') sets env var '${key}' which is not in the whitelist. Allowed: ${VALID_ENV_KEYS.join(", ")}.`,
        );
      }
    }
  }
}

/**
 * Find a preset by (name, surface). Returns undefined when not found.
 * Used by the matrix orchestrator to resolve --variants entries against
 * the registry filtered by --only.
 */
export function getVariant(
  name: string,
  surface: Surface,
): VariantPreset | undefined {
  return VARIANTS.find((p) => p.name === name && p.surface === surface);
}
