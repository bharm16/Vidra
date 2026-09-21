/**
 * Credential preflight for the bounded live-provider smoke (issue #140):
 *
 *   "Missing credentials or unknown cost bounds produce an explicit
 *   non-verification result, never a passing partial run" and "The owner
 *   sets the missing CI secrets; the smoke reports which are absent."
 *
 * The requirement list is DERIVED from the same sources the live calls use,
 * so it cannot drift from them:
 *
 *   sketch frame      the fal relay's key resolution (FAL_KEY, with the
 *                     FAL_API_KEY alias and placeholder rules it enforces).
 *   studio turn LLM   the client ModelConfig.studio_turn names — openai →
 *                     OPENAI_API_KEY, gemini → GEMINI_API_KEY or
 *                     GOOGLE_API_KEY, qwen/groq → GROQ_API_KEY.
 *   studio edit image the Replicate runner (REPLICATE_API_TOKEN).
 *   first frame       the Replicate preview provider (REPLICATE_API_TOKEN).
 *
 * A value that is present but placeholder-shaped ("${...}", "$…",
 * "undefined", "null" — the same shapes the relay's resolver rejects) counts
 * as absent: the nightly must not spend against a templated secret that
 * failed to interpolate.
 *
 * Pure module: env comes in as a parameter, nothing is read at import time.
 */

import type {
  CredentialRequirement,
  MissingCredential,
  PreflightResult,
} from "./types";

/**
 * Placeholder shapes, mirroring server/src/utils/falApiKey.ts's
 * isFalKeyPlaceholder so every credential is held to the same bar.
 */
const TEMPLATE_PATTERN = /\$\{[^}]+\}/;

export function isPlaceholderCredentialValue(
  value: string | undefined,
): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return true;
  return (
    TEMPLATE_PATTERN.test(trimmed) ||
    trimmed.startsWith("$") ||
    trimmed === "undefined" ||
    trimmed === "null"
  );
}

/** The API key env vars each LLM client authenticates with. */
const LLM_CLIENT_CREDENTIALS: Readonly<Record<string, readonly string[]>> = {
  openai: ["OPENAI_API_KEY"],
  gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  qwen: ["GROQ_API_KEY"],
  groq: ["GROQ_API_KEY"],
};

export interface PreflightSources {
  /** ModelConfig.studio_turn.client — which client the studio leg routes to. */
  studioTurnClient: string;
  env: Readonly<Record<string, string | undefined>>;
}

/**
 * The full requirement list for the four legs. `credential` is the primary
 * name (the CI secret the owner sets); `alternatives` are every env var that
 * satisfies the requirement — one present value is enough.
 */
export function requiredCredentials(
  sources: PreflightSources,
): readonly CredentialRequirement[] {
  const client = sources.studioTurnClient.trim().toLowerCase();
  const studioTurnCredentials =
    LLM_CLIENT_CREDENTIALS[client] ?? LLM_CLIENT_CREDENTIALS["openai"] ?? [
      "OPENAI_API_KEY",
    ];
  return [
    // FAL_KEY with the relay's FAL_API_KEY alias (falApiKey.ts).
    {
      credential: "FAL_KEY",
      alternatives: ["FAL_KEY", "FAL_API_KEY"],
      legs: ["sketch-frame"],
    },
    {
      credential: studioTurnCredentials[0] ?? "OPENAI_API_KEY",
      alternatives: studioTurnCredentials,
      legs: ["studio-turn"],
    },
    {
      credential: "REPLICATE_API_TOKEN",
      alternatives: ["REPLICATE_API_TOKEN"],
      legs: ["studio-edit-image", "first-frame"],
    },
  ];
}

/**
 * Run the preflight. The result is complete even when some credentials are
 * missing — the run reports EVERYTHING absent, not just the first.
 */
export function runCredentialPreflight(
  sources: PreflightSources,
): PreflightResult {
  const requirements = requiredCredentials(sources);
  const missing: MissingCredential[] = [];

  for (const requirement of requirements) {
    const satisfied = requirement.alternatives.some(
      (name) => !isPlaceholderCredentialValue(sources.env[name]),
    );
    if (!satisfied) {
      missing.push({
        credential: requirement.credential,
        legs: requirement.legs,
      });
    }
  }

  return { required: requirements, missing };
}
