import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { extractPatternSpans } from "../patterns";

const execute = promisify(execFile);

describe("focal-range extraction", () => {
  it.each([
    "f/2.8-f/5.6",
    "F / 2.8 - F / 5.6",
    "f/2 - 4",
    "f/2 - f 4",
    "f/2 - / 4",
    "f/2-4.5",
  ])("preserves the range and exact offsets for %s", (range) => {
    const text = `Use ${range} for this shot.`;
    const result = extractPatternSpans(text).find(
      (span) => span.role === "camera.focus" && span.text === range,
    );

    expect(result).toMatchObject({ text: range, start: 4, end: 4 + range.length });
    expect(text.slice(result?.start, result?.end)).toBe(range);
  });

  it("bounds failed whitespace ranges in an isolated process", async () => {
    const moduleUrl = new URL("../patterns.ts", import.meta.url).href;
    const script = `
      import { extractPatternSpans } from ${JSON.stringify(moduleUrl)};
      for (const prefix of ["f/2-", "f/2-f", "f/2-f/", "f/2-/"]) {
        const text = prefix + " ".repeat(50_000) + "X";
        const spans = extractPatternSpans(text);
        if (spans.some(span => span.text.includes("-"))) process.exit(1);
      }
      process.stdout.write("complete");
    `;

    // A regressed synchronous expression cannot hang the Vitest thread.
    const { stdout } = await execute(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", script],
      { timeout: 5_000, killSignal: "SIGKILL", maxBuffer: 4096 },
    );

    expect(stdout).toBe("complete");
  }, 7_000);
});
