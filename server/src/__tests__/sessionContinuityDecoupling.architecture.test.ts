import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Generic sessions stay independent of the retired continuity execution domain.
 * Historical serialization contracts live in `server/src/domain/`.
 */

const REPO_ROOT = process.cwd();
const SESSIONS_DIR = resolve(REPO_ROOT, "server/src/services/sessions");

type Violation = { file: string; import: string };

const IMPORT_REGEX = /import\s+(?:type\s+)?[^'"]*from\s+['"]([^'"]+)['"]/g;
const EXPORT_FROM_REGEX = /export\s+(?:type\s+)?[^'"]*from\s+['"]([^'"]+)['"]/g;
const BARE_IMPORT_REGEX = /import\s+['"]([^'"]+)['"]/g;

const isSourceFile = (path: string): boolean =>
  (path.endsWith(".ts") || path.endsWith(".tsx")) && !path.endsWith(".d.ts");

const collectFiles = (dir: string): string[] => {
  const out: string[] = [];
  const stack: string[] = [dir];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    const entries = readdirSync(current);
    for (const entry of entries) {
      const full = join(current, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        stack.push(full);
      } else if (stat.isFile() && isSourceFile(full)) {
        out.push(full);
      }
    }
  }
  return out;
};

const readImports = (file: string): string[] => {
  const source = readFileSync(file, "utf8");
  const specifiers: string[] = [];
  for (const regex of [IMPORT_REGEX, EXPORT_FROM_REGEX, BARE_IMPORT_REGEX]) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(source)) !== null) {
      if (match[1]) specifiers.push(match[1]);
    }
  }
  return specifiers;
};

const collectViolations = (
  scanDir: string,
  forbiddenPrefix: string,
): Violation[] => {
  const files = collectFiles(scanDir);
  const violations: Violation[] = [];
  for (const file of files) {
    for (const spec of readImports(file)) {
      if (spec.startsWith(forbiddenPrefix)) {
        violations.push({ file, import: spec });
      }
    }
  }
  return violations;
};

describe("sessions <-> continuity decoupling", () => {
  it("services/sessions/ imports nothing from @services/continuity", () => {
    const violations = collectViolations(SESSIONS_DIR, "@services/continuity");
    expect(violations).toEqual([]);
  });
});
