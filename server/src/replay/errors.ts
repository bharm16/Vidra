import type { z } from "zod";

/** Base class for all record/replay failures. Always fails loudly. */
export class ReplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplayError";
  }
}

/** Thrown in replay mode when no recorded entry matches the request key. */
export class ReplayCassetteMissError extends ReplayError {
  constructor({
    key,
    summary,
    loadedEntries,
  }: {
    key: string;
    summary: string;
    loadedEntries: number;
  }) {
    super(
      `Replay cassette miss: no recorded entry for ${summary} (key ${key}). ` +
        `${loadedEntries} entries are loaded. The request diverged from what was ` +
        `recorded (prompt/template change?) — re-record the scenario pack with ` +
        `REPLAY_MODE=record. See docs/architecture/replay-mode.md.`,
    );
    this.name = "ReplayCassetteMissError";
  }
}

/**
 * Thrown when a cassette entry fails validation against the live shared
 * contract — at record time (bad capture) or replay time (contract drift).
 */
export class ReplayContractViolationError extends ReplayError {
  constructor({
    surface,
    scenario,
    contract,
    key,
    detail,
    issues,
  }: {
    surface: string;
    scenario: string;
    contract: string;
    key: string;
    detail: string;
    issues?: z.ZodError | undefined;
  }) {
    const issueLines = issues
      ? issues.issues
          .map(
            (issue) =>
              `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`,
          )
          .join("\n")
      : "";
    super(
      `Replay contract violation [surface=${surface} scenario=${scenario} ` +
        `contract=${contract} key=${key}]: ${detail}` +
        (issueLines ? `\n${issueLines}` : "") +
        `\nThe fixture no longer satisfies the live shared contract — re-record ` +
        `the scenario pack (REPLAY_MODE=record) or revisit the contract change.`,
    );
    this.name = "ReplayContractViolationError";
  }
}
