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
