import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CassetteStore } from "@server/replay/CassetteStore";
import { ReplayCassetteMissError, ReplayError } from "@server/replay/errors";
import { RecordReplayStudioImageRunner } from "@server/replay/RecordReplayStudioImageRunner";
import type {
  LiveStudioImageRunner,
  StudioImageCall,
  StudioImageCallResult,
} from "@services/studio/providers/types";

/**
 * The studio-image seam has no recorded fixtures, so `npm run test:replay`
 * never exercises this wrapper — a delegation regression here would pass
 * every gate. These tests are that coverage.
 */

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "studio-image-seam-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

const CALL: StudioImageCall = {
  model: "recraft-ai/recraft-v4.1",
  input: { prompt: "a fox in a snowstorm", size: "1024x1024" },
  userId: "user-1",
  timeoutMs: 30_000,
};

const RESULT: StudioImageCallResult = {
  imageUrl: "https://replicate.delivery/fox.webp",
  durationMs: 1234,
};

function fakeRunner(
  overrides: Partial<LiveStudioImageRunner> = {},
): LiveStudioImageRunner {
  return {
    isAvailable: () => true,
    run: vi.fn(async (): Promise<StudioImageCallResult> => RESULT),
    ...overrides,
  };
}

describe("RecordReplayStudioImageRunner", () => {
  it("records through the live runner, then replays with zero network", async () => {
    const dir = makeTempDir();
    const inner = fakeRunner();

    const recordStore = new CassetteStore({ fixturesDir: dir });
    recordStore.beginScenario("studio-turn", "studio-image-roundtrip");
    const recorder = new RecordReplayStudioImageRunner({
      mode: "record",
      store: recordStore,
      inner,
    });

    await expect(recorder.run(CALL)).resolves.toEqual(RESULT);
    expect(inner.run).toHaveBeenCalledTimes(1);
    recordStore.flush();

    // Replay against a runner that would throw if it were ever consulted.
    const replayInner = fakeRunner({
      run: vi.fn(async (): Promise<StudioImageCallResult> => {
        throw new Error("live runner must not be called in replay mode");
      }),
    });
    const replayStore = new CassetteStore({ fixturesDir: dir });
    replayStore.loadAll();
    const replayer = new RecordReplayStudioImageRunner({
      mode: "replay",
      store: replayStore,
      inner: replayInner,
    });

    await expect(replayer.run(CALL)).resolves.toEqual(RESULT);
    expect(replayInner.run).not.toHaveBeenCalled();
  });

  it("keys the recording on model + input, so a changed input misses loudly", async () => {
    const dir = makeTempDir();
    const recordStore = new CassetteStore({ fixturesDir: dir });
    recordStore.beginScenario("studio-turn", "studio-image-miss");
    await new RecordReplayStudioImageRunner({
      mode: "record",
      store: recordStore,
      inner: fakeRunner(),
    }).run(CALL);
    recordStore.flush();

    const replayStore = new CassetteStore({ fixturesDir: dir });
    replayStore.loadAll();
    const replayer = new RecordReplayStudioImageRunner({
      mode: "replay",
      store: replayStore,
      inner: fakeRunner(),
    });

    await expect(
      replayer.run({ ...CALL, input: { prompt: "a DIFFERENT subject" } }),
    ).rejects.toThrow(ReplayCassetteMissError);
  });

  it("replays a call whose userId and timeoutMs differ from the recording", async () => {
    // Identity and tuning are not what was asked of the model, so they stay
    // out of the cassette key — see the request mapper in the wrapper.
    const dir = makeTempDir();
    const recordStore = new CassetteStore({ fixturesDir: dir });
    recordStore.beginScenario("studio-turn", "studio-image-key-scope");
    await new RecordReplayStudioImageRunner({
      mode: "record",
      store: recordStore,
      inner: fakeRunner(),
    }).run(CALL);
    recordStore.flush();

    const replayStore = new CassetteStore({ fixturesDir: dir });
    replayStore.loadAll();
    const replayer = new RecordReplayStudioImageRunner({
      mode: "replay",
      store: replayStore,
      inner: fakeRunner(),
    });

    await expect(
      replayer.run({ ...CALL, userId: "someone-else", timeoutMs: 5_000 }),
    ).resolves.toEqual(RESULT);
  });

  it("refuses to record against an unavailable live runner", () => {
    expect(
      () =>
        new RecordReplayStudioImageRunner({
          mode: "record",
          store: new CassetteStore({ fixturesDir: makeTempDir() }),
          inner: fakeRunner({ isAvailable: () => false }),
        }),
    ).toThrow(ReplayError);
  });

  it("does not consult availability in replay mode", () => {
    const isAvailable = vi.fn(() => false);
    expect(
      () =>
        new RecordReplayStudioImageRunner({
          mode: "replay",
          store: new CassetteStore({ fixturesDir: makeTempDir() }),
          inner: fakeRunner({ isAvailable }),
        }),
    ).not.toThrow();
    expect(isAvailable).not.toHaveBeenCalled();
  });
});
