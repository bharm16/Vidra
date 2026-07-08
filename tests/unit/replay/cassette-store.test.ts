import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CassetteStore } from "@server/replay/CassetteStore";
import {
  ReplayCassetteMissError,
  ReplayContractViolationError,
  ReplayError,
} from "@server/replay/errors";
import type { ReplayCassetteEntry } from "@shared/schemas/replay.schemas";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "replay-cassettes-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

function suggestionsEntry(
  overrides: Partial<{ text: string; key: string }> = {},
): ReplayCassetteEntry {
  return {
    seam: "ai-model",
    key: overrides.key ?? "ai-model:test-key-1",
    contract: "suggestions-payload",
    request: {
      operation: "enhance_suggestions",
      systemPrompt: "generate suggestions",
      userMessage: "a cat on a windowsill",
      messages: null,
      stream: false,
    },
    response: {
      text:
        overrides.text ?? '[{"text":"slow dolly-in"},{"text":"curtains sway"}]',
      metadata: { provider: "groq" },
    },
  };
}

describe("CassetteStore", () => {
  it("round-trips: record → flush → load → lookup", () => {
    const dir = makeTempDir();
    const writer = new CassetteStore({ fixturesDir: dir });
    writer.beginScenario("suggestions", "unit-roundtrip");
    writer.record(suggestionsEntry());
    const written = writer.flush();
    expect(written).toHaveLength(1);
    expect(written[0]).toContain(join("suggestions", "unit-roundtrip.json"));

    const reader = new CassetteStore({ fixturesDir: dir });
    const { files, entries } = reader.loadAll();
    expect(files).toBe(1);
    expect(entries).toBe(1);
    const hit = reader.lookup("ai-model:test-key-1");
    expect(hit?.seam).toBe("ai-model");
    if (hit?.seam === "ai-model") {
      expect(hit.response.text).toContain("slow dolly-in");
    }
  });

  it("rejects recording before a scenario is declared", () => {
    const store = new CassetteStore({ fixturesDir: makeTempDir() });
    expect(() => store.record(suggestionsEntry())).toThrow(ReplayError);
  });

  it("rejects a capture whose payload violates the live contract", () => {
    const store = new CassetteStore({ fixturesDir: makeTempDir() });
    store.beginScenario("suggestions", "bad-capture");
    expect(() =>
      store.record(suggestionsEntry({ text: '{"nope":true}' })),
    ).toThrow(ReplayContractViolationError);
  });

  it("fails loudly when a fixture on disk was tampered into invalidity", () => {
    const dir = makeTempDir();
    const writer = new CassetteStore({ fixturesDir: dir });
    writer.beginScenario("suggestions", "tampered");
    writer.record(suggestionsEntry());
    const [path] = writer.flush();

    const cassette = JSON.parse(readFileSync(path as string, "utf8"));
    cassette.entries[0].response.text = "[]";
    writeFileSync(path as string, JSON.stringify(cassette), "utf8");

    const reader = new CassetteStore({ fixturesDir: dir });
    expect(() => reader.loadAll()).toThrow(ReplayContractViolationError);
  });

  it("fails loudly on fixtures that are not JSON at all", () => {
    const dir = makeTempDir();
    const writer = new CassetteStore({ fixturesDir: dir });
    writer.beginScenario("suggestions", "corrupt");
    writer.record(suggestionsEntry());
    const [path] = writer.flush();
    writeFileSync(path as string, "not json {", "utf8");

    const reader = new CassetteStore({ fixturesDir: dir });
    expect(() => reader.loadAll()).toThrow(ReplayError);
  });

  it("lookupOrThrow reports an actionable miss", () => {
    const store = new CassetteStore({ fixturesDir: makeTempDir() });
    store.loadAll();
    expect(() =>
      store.lookupOrThrow("ai-model:unknown", 'operation "span_labeling"'),
    ).toThrow(ReplayCassetteMissError);
    expect(() =>
      store.lookupOrThrow("ai-model:unknown", 'operation "span_labeling"'),
    ).toThrow(/REPLAY_MODE=record/);
  });

  it("loads an empty directory as zero entries (no throw)", () => {
    const store = new CassetteStore({ fixturesDir: makeTempDir() });
    expect(store.loadAll()).toEqual({ files: 0, entries: 0 });
  });
});
