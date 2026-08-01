import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import preset from "@promptstudio/system/tailwind.preset";

/**
 * Design-system stacking + focus contract (issue #49).
 *
 * The named z-index scale in @promptstudio/system is the only stacking
 * mechanism in client/src, and --ring (driven by --focus-ring-*) is the
 * single focus-ring treatment. These tests pin the scale ordering and
 * scan client sources so arbitrary z values / bespoke focus rings cannot
 * drift back in.
 */

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const systemSrc = path.join(repoRoot, "packages/promptstudio-system/src");
const tokensCss = readFileSync(path.join(systemSrc, "tokens.css"), "utf8");
const baseCss = readFileSync(path.join(systemSrc, "base.css"), "utf8");

function zTokenValue(name: string): number {
  const needle = `--z-${name}:`;
  const start = tokensCss.indexOf(needle);
  expect(start, `tokens.css should define ${needle}`).toBeGreaterThan(-1);
  const end = tokensCss.indexOf(";", start);
  const raw = tokensCss.slice(start + needle.length, end).trim();
  const value = Number(raw);
  expect(Number.isFinite(value), `${needle} should be numeric`).toBe(true);
  return value;
}

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

function collectClientSources(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectClientSources(fullPath, out);
    } else if (SOURCE_EXTENSIONS.includes(path.extname(entry.name))) {
      out.push(fullPath);
    }
  }
  return out;
}

describe("z-index scale", () => {
  it("orders the full ladder base < raised < sticky < overlay < drawer < modal < toast < tooltip", () => {
    const pairs: Array<[string, string]> = [
      ["base", "raised"],
      ["raised", "sticky"],
      ["sticky", "overlay"],
      ["overlay", "drawer"],
      ["drawer", "modal"],
      ["modal", "toast"],
      ["toast", "tooltip"],
    ];
    for (const [below, above] of pairs) {
      expect(
        zTokenValue(below),
        `${below} should sit below ${above}`,
      ).toBeLessThan(zTokenValue(above));
    }
  });

  it("exposes every consumed layer as a Tailwind utility backed by its token", () => {
    const zIndex =
      (
        preset as {
          theme?: { extend?: { zIndex?: Record<string, string> } };
        }
      ).theme?.extend?.zIndex ?? {};

    const layers = ["sticky", "overlay", "drawer", "modal", "toast", "tooltip"];
    for (const layer of layers) {
      expect(zIndex[layer], `preset zIndex.${layer}`).toBe(`var(--z-${layer})`);
    }
  });

  it("client sources contain no arbitrary z utilities or inline zIndex", () => {
    const offenders: string[] = [];
    for (const file of collectClientSources(
      path.join(repoRoot, "client/src"),
      [],
    )) {
      const content = readFileSync(file, "utf8");
      if (content.includes("z-[") || content.includes("zIndex:")) {
        offenders.push(path.relative(repoRoot, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("focus ring", () => {
  it("drives the single global focus treatment from the ring tokens", () => {
    expect(tokensCss).toContain("--focus-ring-width:");
    expect(tokensCss).toContain("--focus-ring-color:");
    expect(tokensCss).toContain("--ring:");
    expect(baseCss).toContain(
      "outline: var(--focus-ring-width) solid var(--ring)",
    );
  });

  it("client sources roll no bespoke focus rings", () => {
    const offenders: string[] = [];
    for (const file of collectClientSources(
      path.join(repoRoot, "client/src"),
      [],
    )) {
      const content = readFileSync(file, "utf8");
      if (
        content.includes("focus:ring") ||
        content.includes("focus-visible:ring") ||
        content.includes("focus:outline") ||
        content.includes("focus-visible:outline")
      ) {
        offenders.push(path.relative(repoRoot, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
