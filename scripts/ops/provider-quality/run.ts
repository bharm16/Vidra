#!/usr/bin/env tsx
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { evaluateProviderContracts } from "./evaluate";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--report" || !args[1]) {
  console.error(
    "Usage: npx tsx scripts/ops/provider-quality/run.ts --report <output.json> (offline only)",
  );
  process.exitCode = 2;
} else {
  const reportPath = resolve(args[1]);
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const report = await evaluateProviderContracts(revision);
  report.workingTreeStatus = execFileSync(
    "git",
    ["status", "--porcelain", "--untracked-files=normal"],
    { encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const passed = report.paths.filter(
    (path) => path.contract === "passed",
  ).length;
  const failed = report.paths.filter(
    (path) => path.contract === "failed",
  ).length;
  const pending = report.paths.filter(
    (path) => path.contract === "not-run",
  ).length;
  const knownDiagnostics = report.paths.filter(
    (path) => path.diagnosticCode === "luma-model-mismatch",
  ).length;
  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        passed,
        failed,
        pending,
        knownDiagnostics,
        unexpectedFailures: failed - knownDiagnostics,
        reportPath,
        live: "not-verified",
        quality: "not-evaluated",
      },
      null,
      2,
    ),
  );
  process.exitCode = failed > 0 ? 1 : 0;
}
