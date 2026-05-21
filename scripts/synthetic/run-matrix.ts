/**
 * Sub-project E: synthetic matrix orchestrator.
 *
 * Spawns one subprocess per variant (subprocess isolation pattern — see
 * spec § 1 for rationale). Subprocesses run the existing run-harness.ts
 * with env vars merged from the variant preset and a --variant-tag flag
 * matching the preset name. Sequential execution; one variant erroring
 * doesn't abort the matrix.
 *
 * Usage:
 *   npm run synthetic:matrix -- --list-variants
 *   npm run synthetic:matrix -- --only suggestions --variants qwen,gemini
 *
 * See docs/superpowers/specs/2026-05-21-synthetic-model-matrix-design.md
 * § 2.4 for the data flow.
 */

import "dotenv/config";
import { spawn } from "node:child_process";

import {
  VARIANTS,
  getVariant,
  validateAllPresets,
  SURFACES,
  type Surface,
  type VariantPreset,
} from "./variants.js";

export interface MatrixArgs {
  surface: Surface;
  variantNames: string[];
  listOnly: boolean;
}

const VALID_SURFACES = new Set<Surface>(SURFACES);

export function parseMatrixArgs(argv: string[]): MatrixArgs {
  let surface: Surface | null = null;
  let variantNames: string[] = [];
  let listOnly = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--list-variants") {
      listOnly = true;
    } else if (arg === "--only") {
      const value = argv[++i];
      if (!value) throw new Error("--only requires a value");
      if (!VALID_SURFACES.has(value as Surface)) {
        throw new Error(
          `--only must be one of: ${[...VALID_SURFACES].join(", ")} (got: ${value})`,
        );
      }
      surface = value as Surface;
    } else if (arg === "--variants") {
      const value = argv[++i];
      if (!value) throw new Error("--variants requires a value");
      variantNames = value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
  }

  if (listOnly) {
    return { surface: surface ?? "suggestions", variantNames, listOnly };
  }

  if (!surface) {
    throw new Error("--only is required (e.g., --only suggestions)");
  }
  if (variantNames.length === 0) {
    throw new Error("--variants is required (e.g., --variants qwen,gemini)");
  }

  return { surface, variantNames, listOnly };
}

export function resolveVariants(
  names: string[],
  surface: Surface,
): VariantPreset[] {
  if (names.length === 0) {
    throw new Error("no variants specified");
  }
  const resolved: VariantPreset[] = [];
  for (const name of names) {
    const preset = getVariant(name, surface);
    if (!preset) {
      const available = VARIANTS.filter((v) => v.surface === surface).map(
        (v) => v.name,
      );
      throw new Error(
        `unknown variant '${name}' for surface '${surface}'. Available: ${available.join(", ")}.`,
      );
    }
    resolved.push(preset);
  }
  return resolved;
}

export function buildChildEnv(
  base: NodeJS.ProcessEnv,
  presetEnv: Record<string, string>,
): NodeJS.ProcessEnv {
  return { ...base, ...presetEnv };
}

function listVariants(): void {
  console.log("Available variants:\n");
  const bySurface: Record<Surface, VariantPreset[]> = {
    suggestions: [],
    optimize: [],
    "span-labeling": [],
  };
  for (const v of VARIANTS) {
    bySurface[v.surface].push(v);
  }
  for (const surface of SURFACES) {
    console.log(`  ${surface}:`);
    for (const v of bySurface[surface]) {
      console.log(`    ${v.name.padEnd(15)} ${v.description}`);
    }
    console.log("");
  }
}

interface VariantResult {
  preset: VariantPreset;
  exitCode: number;
}

/**
 * The harness uses "span-labels" (dash, plural-ish) as its --only token,
 * but the variant registry uses "span-labeling" (the surface name in
 * telemetry / observability code). Translate at the spawn boundary so
 * the registry stays aligned with the telemetry naming.
 */
function surfaceToHarnessName(surface: Surface): string {
  if (surface === "span-labeling") return "span-labels";
  return surface;
}

async function runVariant(preset: VariantPreset): Promise<VariantResult> {
  const args = [
    "run",
    "synthetic",
    "--",
    "--only",
    surfaceToHarnessName(preset.surface),
    "--variant-tag",
    preset.name,
  ];
  const env = buildChildEnv(process.env, preset.env);
  console.log(
    `\n=== [matrix] running variant: ${preset.name} (${preset.surface}) ===`,
  );
  return new Promise((resolve) => {
    const child = spawn("npm", args, {
      env,
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      resolve({ preset, exitCode: code ?? 1 });
    });
  });
}

async function main(): Promise<void> {
  validateAllPresets();
  const args = parseMatrixArgs(process.argv.slice(2));

  if (args.listOnly) {
    listVariants();
    return;
  }

  const presets = resolveVariants(args.variantNames, args.surface);
  const estimatedCost = presets.length * 0.3;
  console.log(
    `[matrix] running ${presets.length} variants for surface=${args.surface} (sequential). Estimated cost: ~$${estimatedCost.toFixed(2)}.`,
  );

  const results: VariantResult[] = [];
  for (const preset of presets) {
    results.push(await runVariant(preset));
  }

  console.log("\n=== [matrix] summary ===");
  for (const r of results) {
    const status = r.exitCode === 0 ? "OK" : `FAILED (exit ${r.exitCode})`;
    console.log(`  ${r.preset.name.padEnd(15)} ${status}`);
  }
  const anyFailed = results.some((r) => r.exitCode !== 0);
  process.exit(anyFailed ? 1 : 0);
}

const invokedAsScript = import.meta.url === `file://${process.argv[1]}`;
if (invokedAsScript) {
  main().catch((err) => {
    console.error("[matrix] fatal:", err);
    process.exit(1);
  });
}
