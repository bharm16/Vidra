import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isAttribute } from "#shared/taxonomy";

interface GoldenPrompt {
  id: string;
  text: string;
  groundTruth: {
    spans: Array<{ text: string; start: number; end: number; role: string }>;
  };
}

describe("Golden set integrity", () => {
  it("keeps every ground-truth span aligned to its text and leaf taxonomy", () => {
    const directory = join(
      process.cwd(),
      "server/src/llm/span-labeling/evaluation/golden-set",
    );
    const failures: string[] = [];
    let promptCount = 0;

    for (const file of readdirSync(directory).filter((name) =>
      name.endsWith(".json"),
    )) {
      const fixture = JSON.parse(
        readFileSync(join(directory, file), "utf8"),
      ) as {
        prompts: GoldenPrompt[];
      };
      for (const prompt of fixture.prompts) {
        promptCount += 1;
        for (const span of prompt.groundTruth.spans) {
          if (
            !isAttribute(span.role) ||
            span.start < 0 ||
            span.end > prompt.text.length ||
            span.start >= span.end ||
            prompt.text.slice(span.start, span.end) !== span.text
          ) {
            failures.push(`${file}/${prompt.id}: ${JSON.stringify(span)}`);
          }
        }
      }
    }

    expect(promptCount).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  });
});
