import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
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
 * The regression-test quality gate — CI's `regression-quality` job and the
 * pre-commit hook's second check — reported success while scanning zero files.
 *
 * Its worktree exclusion was matched as a bare glob substring — a leading
 * wildcard, then `.claude/worktrees`, then a trailing wildcard — rather than
 * being anchored to the root being scanned.
 *
 * `.claude/worktrees` holds other agents' checkouts of this repo. When the
 * script ran from inside one of those checkouts, $ROOT itself contained that
 * segment, so the pattern matched every candidate, `find` returned nothing, and
 * the empty-set branch printed "No regression test files to scan" and exited 0.
 *
 * A gate that passes having checked nothing is worse than no gate: it reports
 * the same green as a real pass. Two changes close it — the exclusion is
 * anchored to $ROOT, and a whole-repo scan that matches nothing is now an error
 * rather than a pass. Scoped mode keeps exiting 0 on an empty set, because a
 * commit that touches no regression test genuinely has nothing to gate.
 */

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const SCRIPT = path.join(REPO_ROOT, "scripts/check-regression-test-quality.sh");

const tempRoots: string[] = [];

afterAll(() => {
  for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true });
});

function runGate(scriptPath: string, args: string[] = []) {
  const result = spawnSync("bash", [scriptPath, ...args], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function scannedTotal(output: string): number {
  const match = /Scanned (\d+) server-side .*?; (\d+) client-side/s.exec(
    output,
  );
  if (!match?.[1] || !match[2]) return 0;
  return Number(match[1]) + Number(match[2]);
}

function trackedRegressionCount(): number {
  return execFileSync("git", ["ls-files"], { cwd: REPO_ROOT, encoding: "utf8" })
    .split("\n")
    .filter((file) => file.includes(".regression.test.")).length;
}

/**
 * The violation the gate looks for, assembled from parts.
 *
 * The gate scans file text, so spelling this call out literally here would make
 * this very file a violation and turn the whole-repo scan red. Which is itself
 * evidence the gate reads what it claims to read.
 */
const INTERNAL_MOCK_CALL = [
  "vi",
  ".mock",
  '("../services/SomeInternalService");',
].join("");

/**
 * A checkout-shaped tree holding one server-side regression test that mocks an
 * internal module — the exact violation this gate exists to catch.
 */
function buildFixture(treeName: string): string {
  const parent = mkdtempSync(path.join(tmpdir(), "regression-quality-"));
  tempRoots.push(parent);

  const tree = path.join(parent, treeName);
  mkdirSync(path.join(tree, "scripts"), { recursive: true });
  mkdirSync(path.join(tree, "server/src"), { recursive: true });

  writeFileSync(
    path.join(tree, "server/src/thing.regression.test.ts"),
    `import { vi } from "vitest";\n${INTERNAL_MOCK_CALL}\n`,
  );
  copyFileSync(
    SCRIPT,
    path.join(tree, "scripts/check-regression-test-quality.sh"),
  );

  return path.join(tree, "scripts/check-regression-test-quality.sh");
}

describe("regression-test quality gate", () => {
  it("scans every regression test this repo tracks", () => {
    // At least, not exactly: a regression test written but not yet committed is
    // scanned too, and should be. What this rules out is the defect — a scan
    // that silently covers a fraction of the tree, or none of it.
    const { status, output } = runGate(SCRIPT);

    expect(status).toBe(0);
    expect(scannedTotal(output)).toBeGreaterThanOrEqual(
      trackedRegressionCount(),
    );
  });

  it("catches an internal-module mock in the tree it is pointed at, even inside a worktree path", () => {
    const scriptPath = buildFixture(path.join(".claude/worktrees/agent-x"));
    const { status, output } = runGate(scriptPath);

    expect(status).toBe(1);
    expect(output).not.toContain("No regression test files to scan");
  });

  it("catches the same mock in an ordinary tree", () => {
    // The control: the violation is caught because it is a violation, not
    // because of anything about the path it sits under.
    const { status } = runGate(buildFixture("tree"));

    expect(status).toBe(1);
  });

  it("fails a whole-repo scan that matches nothing rather than reporting success", () => {
    const parent = mkdtempSync(
      path.join(tmpdir(), "regression-quality-empty-"),
    );
    tempRoots.push(parent);
    mkdirSync(path.join(parent, "scripts"), { recursive: true });
    const scriptPath = path.join(
      parent,
      "scripts/check-regression-test-quality.sh",
    );
    copyFileSync(SCRIPT, scriptPath);

    const { status, output } = runGate(scriptPath);

    expect(status).toBe(1);
    expect(output).toContain("no regression test files found");
  });

  it("still passes a scoped scan whose staged set holds no regression test", () => {
    // The pre-commit hook hands over the whole staged set. A commit touching no
    // regression test has nothing to gate, and must not be blocked.
    const { status, output } = runGate(SCRIPT, ["package.json"]);

    expect(status).toBe(0);
    expect(output).toContain("No regression test files to scan");
  });
});
