import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

/**
 * `npm run test:regression:list` inventories this checkout's regression tests.
 * It reported 565 files when the repo tracked 207.
 *
 * Two independent defects, both invisible because the script is human-facing —
 * no CI job and no git hook calls it, so a 2.7x overcount never failed anything:
 *
 *  1. ROOT was `dirname($0)/../..`. From `scripts/` that is the repo's PARENT
 *     (~/Desktop), so the walk swept every sibling checkout on the machine and
 *     `REL` stripped a prefix that no longer matched — paths printed as
 *     `prompt-builder/...`.
 *  2. No `.claude/worktrees` exclusion, which the sibling
 *     check-regression-test-quality.sh has carried since the phantom-violation
 *     post-mortem at its lines 70-73. Two foreign worktrees live in this repo.
 *
 * The exclusion is anchored to $ROOT rather than matched as a bare glob
 * substring: the unanchored form prunes everything when the script is run from
 * inside a worktree, reporting zero files instead of that tree's 167.
 */

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const SCRIPT = path.join(REPO_ROOT, "scripts/audit-regression-tests.sh");

const tempRoots: string[] = [];

afterAll(() => {
  for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true });
});

function runAudit(scriptPath: string): string {
  return execFileSync("bash", [scriptPath], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

/**
 * The inventory runs from the header to the `---` rule; `  <relative-path>`
 * lines are files and `    → <text>` lines are their describe blocks. The
 * numbered advice printed after the rule is indented the same as a file path,
 * so the rule is the boundary that matters.
 */
function reportedPaths(output: string): string[] {
  const lines = output.split("\n");
  const rule = lines.indexOf("---");

  return (rule === -1 ? lines : lines.slice(0, rule))
    .filter((line) => /^ {2}\S/.test(line) && !line.trimStart().startsWith("→"))
    .map((line) => line.trim());
}

function trackedRegressionFiles(): string[] {
  return execFileSync("git", ["ls-files"], { cwd: REPO_ROOT, encoding: "utf8" })
    .split("\n")
    .filter((file) => file.includes(".regression.test."));
}

/**
 * A self-contained checkout-shaped tree, so the invariants hold independently of
 * whatever this machine happens to have on disk.
 *
 *   <parent>/outside.regression.test.ts        ← ROOT bug would sweep this in
 *   <parent>/tree/scripts/<script under test>
 *   <parent>/tree/kept.regression.test.ts
 *   <parent>/tree/node_modules/pkg/dep.regression.test.ts
 *   <parent>/tree/.claude/worktrees/other/foreign.regression.test.ts
 */
function buildFixture(treeName: string): { scriptPath: string } {
  const parent = mkdtempSync(path.join(tmpdir(), "audit-regression-"));
  tempRoots.push(parent);

  const tree = path.join(parent, treeName);
  for (const dir of [
    path.join(tree, "scripts"),
    path.join(tree, "node_modules/pkg"),
    path.join(tree, ".claude/worktrees/other"),
  ]) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(
    path.join(parent, "outside.regression.test.ts"),
    'describe("outside", () => {});',
  );
  writeFileSync(
    path.join(tree, "kept.regression.test.ts"),
    'describe("kept", () => {});',
  );
  writeFileSync(
    path.join(tree, "node_modules/pkg/dep.regression.test.ts"),
    'describe("dep", () => {});',
  );
  writeFileSync(
    path.join(tree, ".claude/worktrees/other/foreign.regression.test.ts"),
    'describe("foreign", () => {});',
  );

  const scriptPath = path.join(tree, "scripts/audit-regression-tests.sh");
  copyFileSync(SCRIPT, scriptPath);
  return { scriptPath };
}

describe("regression test inventory", () => {
  it("reports a non-empty inventory", () => {
    expect(reportedPaths(runAudit(SCRIPT)).length).toBeGreaterThan(0);
  });

  it("reports every regression test this repo tracks", () => {
    // A superset, not an equality: a regression test written but not yet
    // committed belongs in the inventory, and is exactly what the audit is for.
    const reported = new Set(reportedPaths(runAudit(SCRIPT)));
    const missing = trackedRegressionFiles().filter(
      (file) => !reported.has(file),
    );

    expect(missing).toEqual([]);
  });

  it("never reports a path from a nested checkout or a dependency tree", () => {
    const offenders = reportedPaths(runAudit(SCRIPT)).filter(
      (file) =>
        file.includes(".claude/worktrees/") || file.includes("node_modules/"),
    );

    expect(offenders).toEqual([]);
  });

  it("reports every path relative to this checkout, so each one resolves", () => {
    // The original defect printed `prompt-builder/<path>` — a real file, named
    // relative to the wrong root, so it resolved to nothing from here.
    const unresolvable = reportedPaths(runAudit(SCRIPT)).filter(
      (file) =>
        path.isAbsolute(file) || !existsSync(path.join(REPO_ROOT, file)),
    );

    expect(unresolvable).toEqual([]);
  });
});

describe("regression test inventory, on a synthetic checkout", () => {
  it("audits its own tree and nothing above, beside, or nested within it", () => {
    const { scriptPath } = buildFixture("tree");

    expect(reportedPaths(runAudit(scriptPath))).toEqual([
      "kept.regression.test.ts",
    ]);
  });

  it("still audits a tree that is itself inside a .claude/worktrees path", () => {
    // The exclusion must be anchored to the tree being audited. Matched as a
    // bare `*/.claude/worktrees/*` substring it prunes the whole walk here and
    // reports nothing — which is how a worktree checkout silently self-erases.
    const { scriptPath } = buildFixture(
      path.join(".claude/worktrees/some-agent"),
    );

    expect(reportedPaths(runAudit(scriptPath))).toEqual([
      "kept.regression.test.ts",
    ]);
  });
});
