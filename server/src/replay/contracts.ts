import {
  REPLAY_CONTRACTS,
  ReplayCassetteSchema,
  type ReplayCassette,
  type ReplayCassetteEntry,
  type ReplayContract,
  type ReplayContractName,
} from "@shared/schemas/replay.schemas";
import { ReplayContractViolationError } from "./errors";

/**
 * Which payload contract each aiService operation's recorded response must
 * satisfy. Exact-match on the ModelConfig operation name; operations not
 * listed fall back to the envelope-only "llm-text" contract.
 */
const OPERATION_CONTRACTS: Record<string, ReplayContractName> = {
  span_labeling: "span-labeling-payload",
  span_labeling_gemini: "span-labeling-payload",
  enhance_suggestions: "suggestions-payload",
  custom_suggestions: "suggestions-payload",
  optimize_standard: "optimize-text",
  i2v_motion_ideas: "motion-ideas-payload",
};

export function contractForOperation(operation: string): ReplayContractName {
  return OPERATION_CONTRACTS[operation] ?? "llm-text";
}

export type ReplayContractRegistry = Record<ReplayContractName, ReplayContract>;

interface EntryContext {
  surface: string;
  scenario: string;
}

/**
 * Validate one cassette entry's response payload against the LIVE contract
 * registry. Runs at record time (rejects bad captures) and at replay time
 * (rejects fixtures the contracts have drifted away from).
 *
 * The registry is injectable so the drift regression test can prove that a
 * mutated contract makes previously-valid fixtures fail loudly.
 */
export function validateEntryPayload(
  entry: ReplayCassetteEntry,
  context: EntryContext,
  contracts: ReplayContractRegistry = REPLAY_CONTRACTS,
): void {
  const contract = contracts[entry.contract];
  if (!contract) {
    throw new ReplayContractViolationError({
      ...context,
      contract: entry.contract,
      key: entry.key,
      detail: `unknown contract name "${entry.contract}" — not in the live registry`,
    });
  }

  let payload: unknown;
  if (contract.encoding === "object") {
    payload = entry.response;
  } else if (contract.encoding === "text") {
    payload = entry.seam === "ai-model" ? entry.response.text : entry.response;
  } else {
    const text =
      entry.seam === "ai-model"
        ? entry.response.text
        : JSON.stringify(entry.response);
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ReplayContractViolationError({
        ...context,
        contract: entry.contract,
        key: entry.key,
        detail: "recorded response text is not parseable JSON",
      });
    }
  }

  const result = contract.schema.safeParse(payload);
  if (!result.success) {
    throw new ReplayContractViolationError({
      ...context,
      contract: entry.contract,
      key: entry.key,
      detail: "recorded payload does not satisfy the live contract",
      issues: result.error,
    });
  }
}

/**
 * Validate a whole cassette file: envelope shape first, then every entry's
 * payload against the live contracts. Returns the typed cassette.
 */
export function validateCassette(
  raw: unknown,
  sourceLabel: string,
  contracts: ReplayContractRegistry = REPLAY_CONTRACTS,
): ReplayCassette {
  const envelope = ReplayCassetteSchema.safeParse(raw);
  if (!envelope.success) {
    throw new ReplayContractViolationError({
      surface: "unknown",
      scenario: sourceLabel,
      contract: "cassette-envelope",
      key: "n/a",
      detail: `cassette file failed envelope validation (${sourceLabel})`,
      issues: envelope.error,
    });
  }

  const cassette = envelope.data;
  for (const entry of cassette.entries) {
    validateEntryPayload(
      entry,
      { surface: cassette.surface, scenario: cassette.scenario },
      contracts,
    );
  }
  return cassette;
}
