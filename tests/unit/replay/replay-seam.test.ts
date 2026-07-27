import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CassetteStore } from "@server/replay/CassetteStore";
import {
  ReplayCassetteMissError,
  ReplayContractViolationError,
  ReplayError,
} from "@server/replay/errors";
import { imagePreviewRequestKey } from "@server/replay/requestKey";
import { ReplaySeam } from "@server/replay/ReplaySeam";
import type { ReplayImagePreviewRequest } from "@shared/schemas/replay.schemas";

/**
 * The record/replay protocol lives in ONE module, so it is proved once here
 * against a stubbed live call rather than re-proved per adapter. The adapters
 * (aiService, image preview, studio image) only supply a request mapper, a key
 * function and a contract name — everything below is what they share.
 */

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "replay-seam-protocol-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

const REQUEST: ReplayImagePreviewRequest = {
  prompt: "a lighthouse keeper reading by lamplight",
  aspectRatio: "16:9",
  inputImageUrl: null,
  seed: null,
  speedMode: null,
};

const RESULT = {
  imageUrl: "https://example.test/frame.png",
  model: "black-forest-labs/flux-schnell",
  durationMs: 1234,
  aspectRatio: "16:9",
};

function seamFor(mode: "record" | "replay", store: CassetteStore) {
  return new ReplaySeam({
    seam: "image-preview",
    mode,
    store,
    keyOf: imagePreviewRequestKey,
  });
}

function callThrough(
  seam: ReplaySeam<"image-preview">,
  live: () => Promise<typeof RESULT>,
) {
  return seam.through({
    request: REQUEST,
    summary: "protocol probe",
    scenario: "protocol",
    contract: "image-preview-result",
    live,
    toRecorded: (result) => ({ ...result }),
  });
}

describe("ReplaySeam protocol", () => {
  it("records the live call, then replays it with the live call untouched", async () => {
    const dir = makeTempDir();
    const live = vi.fn(async () => RESULT);

    const recordStore = new CassetteStore({ fixturesDir: dir });
    recordStore.beginScenario("first-frame-preview", "protocol");
    const recorded = await callThrough(seamFor("record", recordStore), live);
    expect(recorded).toEqual(RESULT);
    expect(live).toHaveBeenCalledTimes(1);
    recordStore.flush();

    const replayStore = new CassetteStore({ fixturesDir: dir });
    replayStore.loadAll();
    const replayed = await callThrough(seamFor("replay", replayStore), live);
    expect(replayed).toEqual(RESULT);
    // Zero network: replay never reaches the live callable.
    expect(live).toHaveBeenCalledTimes(1);
  });

  it("hands back a clone, so a caller cannot mutate the loaded cassette", async () => {
    const dir = makeTempDir();
    const recordStore = new CassetteStore({ fixturesDir: dir });
    recordStore.beginScenario("first-frame-preview", "protocol");
    await callThrough(seamFor("record", recordStore), async () => RESULT);
    recordStore.flush();

    const replayStore = new CassetteStore({ fixturesDir: dir });
    replayStore.loadAll();
    const seam = seamFor("replay", replayStore);

    const first = (await callThrough(seam, async () => RESULT)) as {
      imageUrl: string;
    };
    first.imageUrl = "mutated";

    const second = (await callThrough(seam, async () => RESULT)) as {
      imageUrl: string;
    };
    expect(second.imageUrl).toBe(RESULT.imageUrl);
  });

  it("misses loudly when the request diverges from the recording", async () => {
    const dir = makeTempDir();
    const recordStore = new CassetteStore({ fixturesDir: dir });
    recordStore.beginScenario("first-frame-preview", "protocol");
    await callThrough(seamFor("record", recordStore), async () => RESULT);
    recordStore.flush();

    const replayStore = new CassetteStore({ fixturesDir: dir });
    replayStore.loadAll();
    const seam = seamFor("replay", replayStore);

    await expect(
      seam.through({
        request: { ...REQUEST, prompt: "a prompt that was never recorded" },
        summary: "protocol probe",
        scenario: "protocol",
        contract: "image-preview-result",
        live: async () => RESULT,
        toRecorded: (result) => ({ ...result }),
      }),
    ).rejects.toThrow(ReplayCassetteMissError);
  });

  it("rejects a live response that violates the contract at capture time", async () => {
    const recordStore = new CassetteStore({ fixturesDir: makeTempDir() });
    recordStore.beginScenario("first-frame-preview", "protocol");

    await expect(
      callThrough(
        seamFor("record", recordStore),
        async () => ({ ...RESULT, imageUrl: "" }) as typeof RESULT,
      ),
    ).rejects.toThrow(ReplayContractViolationError);
  });

  it("refuses to serve a recording made at a different seam", async () => {
    const dir = makeTempDir();
    // A cassette whose entry carries the image-preview key but was recorded at
    // the aiService seam — the discriminant check is the only thing standing
    // between that and a silently wrong replay.
    mkdirSync(join(dir, "optimize"), { recursive: true });
    writeFileSync(
      join(dir, "optimize", "cross-seam.json"),
      JSON.stringify({
        formatVersion: 1,
        surface: "optimize",
        scenario: "cross-seam",
        recordedAt: "2026-07-27T00:00:00.000Z",
        entries: [
          {
            seam: "ai-model",
            key: imagePreviewRequestKey(REQUEST),
            contract: "llm-text",
            request: {
              operation: "optimize_standard",
              systemPrompt: "optimize this",
              userMessage: null,
              messages: null,
              stream: false,
            },
            response: { text: "an optimized prompt", metadata: {} },
          },
        ],
      }),
      "utf8",
    );

    const replayStore = new CassetteStore({ fixturesDir: dir });
    replayStore.loadAll();

    await expect(
      callThrough(seamFor("replay", replayStore), async () => RESULT),
    ).rejects.toThrow(ReplayError);
    await expect(
      callThrough(seamFor("replay", replayStore), async () => RESULT),
    ).rejects.toThrow(/not a image-preview recording/);
  });
});
