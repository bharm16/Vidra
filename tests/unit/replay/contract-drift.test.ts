import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { resolveAllFlags } from "@server/config/feature-flags";
import { validateCassette } from "@server/replay/contracts";
import { ReplayContractViolationError } from "@server/replay/errors";
import {
  REPLAY_CONTRACTS,
  type ReplayCassette,
} from "@shared/schemas/replay.schemas";

/**
 * The drift gate: a shared contract change made WITHOUT re-recording the
 * fixtures must fail loudly at validation time, never silently replay stale
 * shapes. The first block proves the mechanism against a simulated contract
 * evolution; the second block validates every committed fixture against the
 * LIVE contracts, so a real contract change breaks CI until the scenario pack
 * is re-recorded.
 */

function validSpanCassette(): ReplayCassette {
  return {
    formatVersion: 1,
    surface: "label-spans",
    scenario: "golden-path",
    recordedAt: "2026-07-02T00:00:00.000Z",
    entries: [
      {
        seam: "ai-model",
        key: "ai-model:drift-demo",
        contract: "span-labeling-payload",
        request: {
          operation: "span_labeling",
          systemPrompt: "label the spans",
          userMessage: "a cat sleeping on a windowsill",
          messages: null,
          stream: false,
        },
        response: {
          text: JSON.stringify({
            analysis_trace: "one subject, one location",
            spans: [
              { text: "a cat", role: "subject.identity", confidence: 0.9 },
              {
                text: "windowsill",
                role: "environment.location",
                confidence: 0.8,
              },
            ],
            meta: { version: "1", notes: "" },
          }),
          metadata: { provider: "qwen" },
        },
      },
    ],
  };
}

describe("replay contract drift", () => {
  it("a recorded fixture validates against the live contracts", () => {
    expect(() =>
      validateCassette(validSpanCassette(), "label-spans/golden-path.json"),
    ).not.toThrow();
  });

  it("a contract change without re-recording fails loudly", () => {
    // Simulated contract evolution: spans now require a `category` field
    // instead of `role` — exactly the kind of rename that caused mock drift
    // in the hand-mocked audit this system replaces.
    const evolvedContracts = {
      ...REPLAY_CONTRACTS,
      "span-labeling-payload": {
        encoding: "json" as const,
        schema: z
          .object({
            spans: z.array(
              z.object({
                text: z.string().min(1),
                category: z.string().min(1),
              }),
            ),
          })
          .passthrough(),
      },
    };

    const attempt = (): void => {
      validateCassette(
        validSpanCassette(),
        "label-spans/golden-path.json",
        evolvedContracts,
      );
    };

    expect(attempt).toThrow(ReplayContractViolationError);
    // The failure must be actionable: name the fixture and the remedy.
    expect(attempt).toThrow(/label-spans/);
    expect(attempt).toThrow(/golden-path/);
    expect(attempt).toThrow(/re-record/);
  });

  it("a contract change on the additive side also fails loudly", () => {
    const evolvedContracts = {
      ...REPLAY_CONTRACTS,
      "span-labeling-payload": {
        encoding: "json" as const,
        schema: z
          .object({
            spans: z.array(z.object({ text: z.string(), role: z.string() })),
            // New required top-level field the old recordings never captured.
            taxonomyVersion: z.string(),
          })
          .passthrough(),
      },
    };
    expect(() =>
      validateCassette(
        validSpanCassette(),
        "label-spans/golden-path.json",
        evolvedContracts,
      ),
    ).toThrow(ReplayContractViolationError);
  });
});

describe("committed replay fixtures", () => {
  const fixturesDir = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../server/src/replay/fixtures",
  );

  function listJsonFiles(dir: string): string[] {
    let dirents;
    try {
      dirents = readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const files: string[] = [];
    for (const dirent of dirents) {
      const path = join(dir, dirent.name);
      if (dirent.isDirectory()) {
        files.push(...listJsonFiles(path));
      } else if (dirent.isFile() && dirent.name.endsWith(".json")) {
        files.push(path);
      }
    }
    return files.sort();
  }

  it("every committed fixture satisfies the live shared contracts", () => {
    for (const path of listJsonFiles(fixturesDir)) {
      const raw = JSON.parse(readFileSync(path, "utf8"));
      expect(() => validateCassette(raw, path)).not.toThrow();
    }
  });
});

describe("REPLAY_MODE flag registration", () => {
  it("defaults to off and honors the env var", () => {
    expect(resolveAllFlags({} as NodeJS.ProcessEnv).flags.replayMode).toBe(
      "off",
    );
    expect(
      resolveAllFlags({ REPLAY_MODE: "replay" } as NodeJS.ProcessEnv).flags
        .replayMode,
    ).toBe("replay");
    expect(
      resolveAllFlags({ REPLAY_MODE: "record" } as NodeJS.ProcessEnv).flags
        .replayMode,
    ).toBe("record");
    // Unknown values fall back to the safe default.
    expect(
      resolveAllFlags({ REPLAY_MODE: "banana" } as NodeJS.ProcessEnv).flags
        .replayMode,
    ).toBe("off");
  });
});
