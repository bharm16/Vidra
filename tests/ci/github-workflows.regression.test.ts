import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Two ways a workflow dies before it runs a single step. Both surface in the
 * Actions UI as a 0s run with the message "This run likely failed because of a
 * workflow file issue" — no logs, no failing step, nothing that reads as a test
 * result. `ci.yml` and `test.yml` failed that way on every push to main from
 * 2026-07-25 to 2026-08-06 and no gate noticed, because the only thing that
 * catches it is GitHub itself, after a push.
 */

const WORKFLOW_DIR = ".github/workflows";

function repoPath(relativePath: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../..", relativePath);
}

function workflowFiles(): string[] {
  return readdirSync(repoPath(WORKFLOW_DIR))
    .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
    .sort();
}

function readWorkflow(file: string): string {
  return readFileSync(repoPath(`${WORKFLOW_DIR}/${file}`), "utf8");
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

describe("GitHub workflow startup validity", () => {
  it("finds workflows to check", () => {
    expect(workflowFiles().length).toBeGreaterThan(0);
  });

  it("never reads the secrets context from an `if:` expression", () => {
    // GitHub does not expose `secrets` to `if:`, at job or step level. A
    // workflow that reads it there is rejected outright. The supported shape is
    // to bind the secret to `env:` and compare against `env.NAME`, which is what
    // security-scan.yml does.
    const offenders: string[] = [];

    for (const file of workflowFiles()) {
      readWorkflow(file)
        .split("\n")
        .forEach((line, index) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("if:") && trimmed.includes("secrets.")) {
            offenders.push(`${file}:${index + 1} → ${trimmed}`);
          }
        });
    }

    expect(offenders).toEqual([]);
  });

  it("never indents mapping keys under a single-line `run:`", () => {
    // A single-line `run:` scalar takes no child keys. When a step is inserted
    // in the middle of a neighbouring step's `env:` block, the orphaned entries
    // land under that `run:` and the file stops being valid YAML. Block scalars
    // (`run: |`, `run: >`) legitimately own the indented lines beneath them.
    const offenders: string[] = [];

    for (const file of workflowFiles()) {
      const lines = readWorkflow(file).split("\n");

      lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith("run:")) return;

        const value = trimmed.slice("run:".length).trim();
        if (value === "" || value.startsWith("|") || value.startsWith(">")) {
          return; // block scalar — the indented body belongs to it
        }

        const next = lines
          .slice(index + 1)
          .find((candidate) => candidate.trim() !== "");
        if (next && indentOf(next) > indentOf(line)) {
          offenders.push(
            `${file}:${index + 2} → "${next.trim()}" is indented under a single-line run:`,
          );
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  it("never backslash-escapes quotes inside a `run:` command", () => {
    // A YAML plain scalar does not process escapes, so `\"` reaches the shell
    // as a literal backslash followed by a quote. The shell then splits on the
    // whitespace the quotes were meant to protect.
    //
    // `firebase emulators:exec ... \"npm run test:integration\"` arrived as
    // `\"npm`, `run`, `test:integration\"` — three arguments where one was
    // intended. firebase answered "Too many arguments", so the emulator never
    // started and the integration job failed without running a single test.
    // The job looked like a real failing suite; it had executed nothing.
    const offenders: string[] = [];

    for (const file of workflowFiles()) {
      readWorkflow(file)
        .split("\n")
        .forEach((line, index) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("run:") && trimmed.includes('\\"')) {
            offenders.push(`${file}:${index + 1} → ${trimmed}`);
          }
        });
    }

    expect(offenders).toEqual([]);
  });
});

/**
 * Bug 2026-08-09: `accessibility-tests` and `lighthouse-performance` were both
 * red on main for one reason, and it was not an accessibility defect —
 * `axe-core Error: Unable to parse color "oklch(0.279 0 0)"`. The action was
 * pinned to v10 (Lighthouse 10.1.0, April 2023), whose axe-core predates
 * modern colour functions, while the design system emits thousands of oklch()
 * declarations. The audit ERRORED, its score became null, and the assertion
 * failed on the null.
 *
 * Two invariants keep that from coming back, and they matter in opposite
 * directions: the config must not let individual audits block (the preset),
 * and the runner must be new enough to actually compute the scores being
 * asserted. Reverting either one alone reproduces a failure — with the old
 * runner the accessibility category is NaN, which passes while measuring
 * nothing.
 */
describe("Lighthouse gate", () => {
  const LIGHTHOUSE_CONFIG = ".lighthouserc.json";
  const MIN_ACTION_MAJOR = 12;

  function lighthouseConfig(): {
    ci?: { assert?: { preset?: string; assertions?: Record<string, unknown> } };
  } {
    return JSON.parse(readFileSync(repoPath(LIGHTHOUSE_CONFIG), "utf8"));
  }

  it("declares no preset, so no individual audit can block", () => {
    // Every category in this config is "warn" — the file's plain intent is
    // that Lighthouse advises rather than blocks. A preset re-introduces ~100
    // individual audits at ERROR underneath that, so the config would read as
    // advisory and behave as blocking.
    expect(lighthouseConfig().ci?.assert?.preset).toBeUndefined();
  });

  it("still asserts all four category scores", () => {
    // Dropping the preset must not quietly drop the real assertions with it.
    const assertions = lighthouseConfig().ci?.assert?.assertions ?? {};
    for (const category of [
      "performance",
      "accessibility",
      "best-practices",
      "seo",
    ]) {
      expect(Object.keys(assertions)).toContain(`categories:${category}`);
    }
  });

  it("pins a Lighthouse runner new enough to parse oklch()", () => {
    const offenders: string[] = [];

    for (const file of workflowFiles()) {
      const lines = readWorkflow(file).split("\n");
      lines.forEach((line, index) => {
        const match = line.match(/treosh\/lighthouse-ci-action@v(\d+)/);
        if (!match) return;
        const major = Number(match[1]);
        if (major < MIN_ACTION_MAJOR) {
          offenders.push(`${file}:${index + 1} uses v${major}`);
        }
      });
    }

    expect(
      offenders,
      `lighthouse-ci-action must be >= v${MIN_ACTION_MAJOR}; older bundles ship an axe-core that cannot parse oklch()`,
    ).toEqual([]);
  });
});
