import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it("allows product entry points and rejects private imports, including type-only imports from external tests", async () => {
  const require = createRequire(import.meta.url);
  const rules = require("../../.dependency-cruiser.cjs");
  const directory = await mkdtemp(join(tmpdir(), "vidra-module-rules-"));
  try {
    const files: Record<string, string> = {
      "tsconfig.json": JSON.stringify({ compilerOptions: { module: "esnext", moduleResolution: "bundler" } }),
      "client/src/features/project-workspace/hooks/private.ts": "export const value = 1; export type Private = string;",
      "client/src/features/project-workspace/api.ts": "export { value } from './hooks/private';",
      "client/allowed.ts": "import { value } from './src/features/project-workspace/api'; export { value };",
      "client/rejected.ts": "import { value } from './src/features/project-workspace/hooks/private'; export { value };",
      "server/src/services/creation-requests/execution/private.ts": "export type Private = string;",
      "server/src/services/creation-requests/execution.ts": "export type { Private } from './execution/private';",
      "tests/allowed.ts": "import type { Private } from '../server/src/services/creation-requests/execution'; export type Value = Private;",
      "tests/rejected.ts": "import type { Private } from '../server/src/services/creation-requests/execution/private'; export type Value = Private;",
      "rules.cjs": `module.exports = ${JSON.stringify({ ...rules, options: { ...rules.options, tsConfig: { fileName: "tsconfig.json" } } })};`,
    };
    for (const [name, content] of Object.entries(files)) { const path = join(directory, name); await mkdir(resolve(path, ".."), { recursive: true }); await writeFile(path, content); }
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("../../node_modules/.bin/depcruise", import.meta.url)), "client", "server", "tests", "--config", "rules.cjs", "--output-type", "json"], { cwd: directory, encoding: "utf8" });
    const graph = JSON.parse(result.stdout) as { summary: { violations: Array<{ from: string; rule: { name: string } }> } };
    expect(graph.summary.violations.map(violation => [violation.from, violation.rule.name]).sort()).toEqual([
      ["client/rejected.ts", "workspace-through-entrypoints"], ["tests/rejected.ts", "creation-through-entrypoints"],
    ]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
