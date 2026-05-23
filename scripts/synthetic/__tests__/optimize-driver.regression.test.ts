import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function driverSource(): Promise<string> {
  const path = join(__dirname, "..", "drivers", "optimize.driver.ts");
  return readFile(path, "utf8");
}

describe("optimize.driver — Sub-project C3 alignment regression", () => {
  // Sub-project C3 (2026-05-22): the synthetic harness must mirror prod.
  // The constitutional-review feature is dormant per its own JSDoc — no
  // production caller sets useConstitutionalAI: true. Setting it true here
  // made the synthetic harness measure a non-production code path, which
  // invalidated Sub-projects D/C/B2 measurements that ran through the
  // constitutional-review pipeline.
  //
  // This test guards against a regression that would re-enable
  // constitutional review in the synthetic harness without first verifying
  // a corresponding prod activation (per the JSDoc's "To re-enable"
  // instructions in workflows/constitutionalReview.ts).

  it("does not pass useConstitutionalAI: true (matches prod's dormant feature)", async () => {
    const src = await driverSource();
    // Match only the code-statement form: leading whitespace + literal +
    // trailing comma (excludes comment prose that explains the previous
    // behavior). Captures the actual property assignment, not narrative.
    const codeAssignment = /\n\s+useConstitutionalAI:\s*true\s*,/;
    expect(src).not.toMatch(codeAssignment);
  });

  it("explicitly passes useConstitutionalAI: false (documents intent)", async () => {
    const src = await driverSource();
    expect(src).toContain("useConstitutionalAI: false");
  });
});
