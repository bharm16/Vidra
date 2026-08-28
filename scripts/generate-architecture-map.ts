#!/usr/bin/env node
/**
 * Generate docs/architecture/architecture-map.json from the live codebase.
 *
 * Usage:
 *   npx tsx scripts/generate-architecture-map.ts          # print to stdout
 *   npx tsx scripts/generate-architecture-map.ts --write  # rewrite JSON file
 *   npx tsx scripts/generate-architecture-map.ts --check  # exit non-zero if stale
 *
 * Sections emitted (auto-derived):
 *   meta         — project identity, generated date, source-of-truth file list
 *   runtime      — Node version, module system, language mix
 *   routes       — every reachable HTTP endpoint (via TypeScript AST walker)
 *   featureFlags — every flag in the registry with requiresEnv / dependsOn edges
 *   dependencies — DI dependency edges from container.register() calls (B2)
 *
 * Sections NOT emitted (hand-curated, out of scope until Phase B3+):
 *   domains, diRegistration, clientFeatures, clientPages, boundaries,
 *   externalSystems, operations, techStack, repository
 *
 * Future expansion:
 *   Phase B3 — replace `*` method wildcards with concrete HTTP methods
 *   Phase B4 — wire CI drift gate
 */

import fs from "node:fs";
import path from "node:path";

import { getFlagEnvNames } from "../server/src/config/feature-flags.ts";
import { extractRoutes, REPO_ROOT } from "./lib/route-map-walker.ts";
import {
  extractDependencies,
  type DependencyEdge,
} from "./lib/di-graph-walker.ts";

const OUTPUT = path.join(
  REPO_ROOT,
  "docs",
  "architecture",
  "architecture-map.json",
);

interface ArchitectureMap {
  meta: {
    project: string;
    tagline: string;
    stage: string;
    sourceOfTruth: string[];
  };
  runtime: Record<string, unknown>;
  routes: ReturnType<typeof extractRoutes>;
  featureFlags: ReturnType<typeof getFlagEnvNames>;
  dependencies: DependencyEdge[];
}

export function buildArchitectureMap(): ArchitectureMap {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"),
  ) as { engines?: { node?: string } };

  return {
    meta: {
      project: "Vidra",
      tagline:
        "Interactive editing canvas for AI video prompts with semantic span labeling, click-to-enhance suggestions, and fast previews.",
      stage: "pre-launch (zero users)",
      // Only the inputs buildArchitectureMap actually reads — the CI
      // freshness gate can only detect drift in these. (CLAUDE.md and
      // services.config.ts used to be listed here decoratively, which made
      // the gate's comment overpromise.)
      sourceOfTruth: [
        "server/src/config/feature-flags.ts",
        "server/src/config/services/",
        "server/src/routes/ + server/src/config/routes/ (via extractRoutes)",
        "package.json",
      ],
    },
    runtime: {
      node: pkg.engines?.node ?? ">=20",
      moduleSystem: "ESM",
      languages: ["TypeScript", "JavaScript (migration in progress)"],
      monorepo: true,
      workspaces: ["packages/*"],
    },
    routes: extractRoutes(),
    featureFlags: getFlagEnvNames(),
    dependencies: extractDependencies(
      path.join(REPO_ROOT, "server", "src", "config", "services"),
    ),
  };
}

function main(): void {
  const map = buildArchitectureMap();
  const json = JSON.stringify(map, null, 2);

  const args = new Set(process.argv.slice(2));

  if (args.has("--write")) {
    fs.writeFileSync(OUTPUT, json + "\n");
    console.log(`Wrote ${OUTPUT}`);
    return;
  }

  if (args.has("--check")) {
    if (!fs.existsSync(OUTPUT)) {
      process.stderr.write(
        "architecture-map.json missing. Run `npm run architecture:map:write`\n",
      );
      process.exit(1);
    }
    const existing = fs.readFileSync(OUTPUT, "utf8").trim();
    if (existing !== json) {
      process.stderr.write(
        "architecture-map.json is stale. Run `npm run architecture:map:write`\n",
      );
      process.exit(1);
    }
    return;
  }

  process.stdout.write(json + "\n");
}

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1]));

if (isMain) {
  main();
}
