import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * `npm run arch:check` (commit-protocol check 3) printed
 *   - ToolSidebar/types imports outside ToolSidebar: 0
 *   All forbidden import checks passed.
 * while two files imported it — one of them production.
 *
 * The fence grepped the single literal `@components/ToolSidebar/types`, but
 * `@components/*` and `@/components/*` are both declared aliases for
 * client/src/components. Code written with the second spelling walked straight
 * through a gate whose whole job was to stop it, and the gate said green.
 *
 * A fence that names one spelling of a path is only as good as the reviewer's
 * memory of the alias table, so this pins the fence against the alias table
 * itself: every spelling tsconfig declares for the guarded module must be one
 * the fence can see.
 *
 * Second hole, same shape one directory shallower: the fence guards a path, so
 * anything that re-exports the guarded types is a way around it. The ToolSidebar
 * barrel re-exported DraftModel, KeyframeTile and VideoTier — types
 * @features/generation-controls owns and exports directly — so
 * `from "@/components/ToolSidebar"` reached them with the gate still green.
 * Pinned below by provenance rather than by a list of names: whatever
 * ToolSidebar/types.ts passes through from another feature is exactly what the
 * barrel may not re-export.
 */

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const FENCE_SCRIPT = path.join(REPO_ROOT, "scripts/arch-forbidden-imports.sh");

/** The module the fence guards, and the directory allowed to import it. */
const GUARDED_MODULE = "client/src/components/ToolSidebar/types";
const GUARDED_OWNER = path.join(REPO_ROOT, "client/src/components/ToolSidebar");

/** Every tsconfig whose `paths` a client import may legally be written against. */
const TSCONFIGS = ["tsconfig.json", "client/tsconfig.json"];

function readPathAliases(relativeConfig: string): {
  aliases: Record<string, string[]>;
  baseUrl: string;
} {
  const absolute = path.join(REPO_ROOT, relativeConfig);
  const { config, error } = ts.parseConfigFileTextToJson(
    absolute,
    readFileSync(absolute, "utf8"),
  );

  if (error) throw new Error(`could not parse ${relativeConfig}`);

  const compilerOptions = (
    config as { compilerOptions?: Record<string, unknown> }
  )?.compilerOptions;

  return {
    aliases: (compilerOptions?.paths as Record<string, string[]>) ?? {},
    baseUrl: path.resolve(
      path.dirname(absolute),
      (compilerOptions?.baseUrl as string) ?? ".",
    ),
  };
}

/**
 * Every specifier the guarded module can legally be written as. An alias
 * `@x/*` → `some/dir/*` contributes a spelling whenever the guarded module sits
 * under `some/dir`.
 */
function declaredSpellingsOfGuardedModule(): string[] {
  const guardedAbsolute = path.join(REPO_ROOT, GUARDED_MODULE);
  const spellings = new Set<string>();

  for (const config of TSCONFIGS) {
    const { aliases, baseUrl } = readPathAliases(config);

    for (const [alias, targets] of Object.entries(aliases)) {
      if (!alias.endsWith("/*")) continue;

      for (const target of targets) {
        if (!target.endsWith("/*")) continue;

        const targetRoot = path.resolve(baseUrl, target.slice(0, -2));
        const remainder = path.relative(targetRoot, guardedAbsolute);
        if (remainder.startsWith("..") || path.isAbsolute(remainder)) continue;

        spellings.add(`${alias.slice(0, -1)}${remainder}`);
      }
    }
  }

  return [...spellings].sort();
}

/** The pattern the fence actually greps with, read out of the script. */
function fencePattern(): string {
  const assignment = readFileSync(FENCE_SCRIPT, "utf8")
    .split("\n")
    .find((line) => line.startsWith("toolsidebar_types_pattern="));

  if (!assignment)
    throw new Error("fence no longer declares toolsidebar_types_pattern");

  return assignment.slice(assignment.indexOf("=") + 1).replaceAll("'", "");
}

const GUARDED_MODULE_FILE = `${GUARDED_MODULE}.ts`;
const BARREL_FILE = "client/src/components/ToolSidebar/index.ts";

/**
 * The names a module re-exports, with the specifier each came from. Read off
 * the AST rather than matched in text, so an added export cannot hide behind
 * formatting.
 */
function reExportedNames(
  relativeFile: string,
): { name: string; from: string }[] {
  const absolute = path.join(REPO_ROOT, relativeFile);
  const source = ts.createSourceFile(
    absolute,
    readFileSync(absolute, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );

  const exports: { name: string; from: string }[] = [];

  source.forEachChild((node) => {
    if (!ts.isExportDeclaration(node)) return;

    const clause = node.exportClause;
    if (!clause || !ts.isNamedExports(clause)) return;

    const specifier = node.moduleSpecifier;
    if (!specifier || !ts.isStringLiteral(specifier)) return;

    for (const element of clause.elements) {
      exports.push({ name: element.name.text, from: specifier.text });
    }
  });

  return exports;
}

/**
 * The types the guarded module does not own — it passes them through from
 * another feature. These are the ones a re-export can leak.
 */
function foreignTypesInGuardedModule(): string[] {
  return reExportedNames(GUARDED_MODULE_FILE)
    .filter((entry) => entry.from.includes("features/"))
    .map((entry) => entry.name)
    .sort();
}

function clientSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" ? [] : clientSourceFiles(full);
    }
    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")
      ? [full]
      : [];
  });
}

describe("forbidden-import fence: ToolSidebar domain types", () => {
  it("declares at least the two alias spellings that reach the guarded module", () => {
    // Guards the derivation itself — a silent zero here would make every
    // assertion below vacuously true.
    expect(declaredSpellingsOfGuardedModule()).toEqual([
      "@/components/ToolSidebar/types",
      "@components/ToolSidebar/types",
    ]);
  });

  it("can see every alias spelling tsconfig declares for the guarded module", () => {
    const pattern = new RegExp(fencePattern());
    const invisible = declaredSpellingsOfGuardedModule().filter(
      (spelling) => !pattern.test(`from "${spelling}"`),
    );

    expect(invisible).toEqual([]);
  });

  it("is not satisfied by any client file outside ToolSidebar importing the guarded module", () => {
    const spellings = declaredSpellingsOfGuardedModule();
    const offenders: string[] = [];

    for (const file of clientSourceFiles(path.join(REPO_ROOT, "client/src"))) {
      if (!path.relative(GUARDED_OWNER, file).startsWith("..")) continue;

      const source = readFileSync(file, "utf8");
      if (spellings.some((spelling) => source.includes(spelling))) {
        offenders.push(path.relative(REPO_ROOT, file));
      }
    }

    expect(offenders).toEqual([]);
  });

  it("passes its own gate", () => {
    const output = execFileSync("bash", [FENCE_SCRIPT], { encoding: "utf8" });

    expect(output).toContain("All forbidden import checks passed.");
  });
});

describe("ToolSidebar barrel: domain type ownership", () => {
  it("passes through foreign types in the guarded module", () => {
    // Derivation guard. If this ever reads empty, every assertion below passes
    // for the wrong reason.
    expect(foreignTypesInGuardedModule()).toEqual([
      "DraftModel",
      "GenerationOverrides",
      "KeyframeTile",
      "SidebarUploadedImage",
      "StartImage",
      "VideoTier",
    ]);
  });

  it("never re-exports a type another feature owns", () => {
    const foreign = new Set(foreignTypesInGuardedModule());
    const leaked = reExportedNames(BARREL_FILE)
      .filter((entry) => foreign.has(entry.name))
      .map((entry) => entry.name);

    expect(leaked).toEqual([]);
  });

  it("still exports the domain types ToolSidebar does own", () => {
    // The cheap way to satisfy the rule above is to stop exporting anything.
    const exported = reExportedNames(BARREL_FILE).map((entry) => entry.name);

    expect(exported).toContain("ToolSidebarSessionsDomain");
  });
});
