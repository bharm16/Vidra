import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Seams that are published, and must stay the only spelling of their fact.
 *
 * Three architecture reviews found the same shape five times: a canonical —
 * `DATASET_KEYS`, `respond.ok`, `intake.handle`, `shared/utils/typeGuards`,
 * the declared-event pattern — that was correct, in the right place, and
 * bypassed. Callers hand-wrote the string instead of importing it, so the
 * canonical drifted from load-bearing into decorative and the copies diverged.
 *
 * Nothing in the type system prevents that: `querySelector`, `dispatchEvent`
 * and `res.json` all take strings or `any`, so the compiler cannot see across
 * these couplings. This is the check that can.
 *
 * Tests are deliberately excluded — a test naming the literal is pinning the
 * wire format, which is the point.
 */

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const SOURCE_EXTENSIONS = [".ts", ".tsx"];

function collectSources(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      collectSources(fullPath, out);
      continue;
    }
    if (entry.name.includes(".test.")) continue;
    if (SOURCE_EXTENSIONS.includes(path.extname(entry.name))) {
      out.push(fullPath);
    }
  }
  return out;
}

interface Seam {
  /** What the fact is, for the failure message. */
  what: string;
  /** The literal that must not be hand-written. */
  literal: string;
  /** Repo-relative path of the module allowed to spell it. */
  owner: string;
  /** What a caller should import instead. */
  instead: string;
}

const SEAMS: Seam[] = [
  {
    what: "the camera's focus attribute",
    literal: '"data-canvas-focus"',
    owner: "client/src/components/canvas/CanvasViewport.tsx",
    instead: "CANVAS_FOCUS_ATTR from @/components/canvas/CanvasViewport",
  },
  {
    what: "the highlight class",
    literal: '".value-word"',
    owner: "client/src/features/span-highlighting/config/spanSelectors.ts",
    instead:
      "HIGHLIGHT_SELECTOR / HIGHLIGHT_CLASS from @features/span-highlighting/config/spanSelectors",
  },
  {
    what: "the span id attribute",
    literal: '"data-span-id"',
    owner: "client/src/features/span-highlighting/config/spanSelectors.ts",
    instead:
      "spanIdSelector() from @features/span-highlighting/config/spanSelectors",
  },
  {
    what: "the workspace-reset broadcast",
    literal: '"po:workspace-reset"',
    owner: "client/src/features/prompt-optimizer/events.ts",
    instead:
      "dispatchWorkspaceReset / addWorkspaceResetListener from @features/prompt-optimizer/events",
  },
];

describe("published seams are the only spelling of their fact", () => {
  const sources = collectSources(path.join(repoRoot, "client/src"), []);

  it.each(SEAMS)("$what — $literal", (seam) => {
    const offenders = sources
      .filter((file) => path.relative(repoRoot, file) !== seam.owner)
      .filter((file) => readFileSync(file, "utf8").includes(seam.literal))
      .map((file) => path.relative(repoRoot, file));

    expect(
      offenders,
      `${seam.literal} is ${seam.what}; it belongs to ${seam.owner}. Import ${seam.instead} instead of writing the literal.`,
    ).toEqual([]);
  });

  /**
   * `shared/utils/typeGuards` is the canonical `isRecord`. Three copies lived
   * in one directory of the span-labeling wire boundary, each having dropped
   * the canonical's `!Array.isArray` clause.
   */
  it("isRecord is defined once, in shared/utils/typeGuards", () => {
    const offenders = sources
      .filter((file) =>
        readFileSync(file, "utf8").includes("function isRecord"),
      )
      .map((file) => path.relative(repoRoot, file));

    expect(
      offenders,
      "Import isRecord from @shared/utils/typeGuards rather than redeclaring it.",
    ).toEqual([]);
  });
});
