import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ReplayCassetteEntry } from "@shared/schemas/replay.schemas";
import type { VideoJobRecord } from "@services/video-generation/jobs/types";
import {
  BudgetedCassetteStore,
  finishRecording,
  MIN_EXPECTED_ENTRIES,
  recordCrossModePack,
  SpendBudgetExceededError,
  type RecorderHarness,
} from "@scripts/replay/crossModeRecorder";
import {
  CROSS_MODE_PROMPT,
  CROSS_MODE_SKETCH_FRAME,
  CROSS_MODE_STUDIO_EDIT_MESSAGE,
  CROSS_MODE_STUDIO_OPENING_MESSAGE,
  CROSS_MODE_STUDIO_SECOND_EDIT_MESSAGE,
  CROSS_MODE_STUDIO_UNRELATED_MESSAGE,
} from "@scripts/replay/goldenScenarios";

/**
 * The cross-mode recorder's gates, unit-tested with the provider boundary
 * faked: the real run's captures are seam record() calls, so the fake harness
 * simulates a seamed server by recording entries as it answers. What is under
 * test is the driver — canonical bodies in, spend budget enforced, behavior
 * invariants checked, provenance required, synthetic entries kept and stale
 * evidence dropped — never the seams themselves.
 */

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "cross-mode-recorder-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

const LIVE_OUTPUT = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgICAgI=";
const STUDIO_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgMDAwM=";

function provenance(model: string): ReplayCassetteEntry["provenance"] {
  return {
    operation: "studio_turn",
    provider: "openai",
    model,
    parameters: {},
    origin: "live",
    capture: {
      replayMode: "record",
      recordedAt: new Date().toISOString(),
      formatVersion: 1,
    },
  };
}

function aiModelEntry(): ReplayCassetteEntry {
  return {
    seam: "ai-model",
    key: `ai-model:${Math.random().toString(36).slice(2)}`,
    contract: "llm-text",
    request: {
      operation: "studio_turn",
      systemPrompt: "decide the turn",
      userMessage: null,
      messages: null,
      stream: true,
    },
    response: { text: '{"action":"generate"}', metadata: {} },
    provenance: provenance("effective-model-from-config"),
  };
}

function studioImageEntry(): ReplayCassetteEntry {
  return {
    seam: "studio-image",
    key: `studio-image:${Math.random().toString(36).slice(2)}`,
    contract: "studio-image-result",
    request: { model: "google/nano-banana-2", input: { prompt: "p" } },
    response: { imageUrl: STUDIO_IMAGE, durationMs: 1 },
    provenance: {
      operation: "studio_image_run",
      provider: "replicate",
      model: "google/nano-banana-2",
      parameters: {},
      origin: "live",
      capture: {
        replayMode: "record",
        recordedAt: new Date().toISOString(),
        formatVersion: 1,
      },
    },
  };
}

function sketchFrameEntry(): ReplayCassetteEntry {
  return {
    seam: "sketch-frame",
    key: `sketch-frame:${Math.random().toString(36).slice(2)}`,
    contract: "sketch-frame-result",
    request: {
      endpoint: "https://fal.run/fal-ai/z-image/turbo/image-to-image",
      prompt: "p",
      imageDigest: "d",
      strength: 0.75,
      steps: 4,
      seed: 1,
    },
    response: { images: [{ url: LIVE_OUTPUT }] },
    provenance: {
      operation: "sketch_frame",
      provider: "fal.run",
      model: "fal-ai/z-image/turbo/image-to-image",
      parameters: {},
      origin: "live",
      capture: {
        replayMode: "record",
        recordedAt: new Date().toISOString(),
        formatVersion: 1,
      },
    },
  };
}

interface FakeTurn {
  action: string;
  imageCount: number;
  /** Entries captured as the server's seams would, while answering the turn. */
  captures: ReplayCassetteEntry[];
}

interface FakeHarnessOptions {
  turns?: FakeTurn[];
  recordFrame?: boolean;
}

/**
 * A scripted harness. It plays the walkthrough's server: answers the
 * canonical requests (and asserts the bodies it receives ARE canonical) and
 * simulates the seamed boundaries by recording entries into the store the
 * way the real seams do.
 */
function fakeHarness(
  store: BudgetedCassetteStore,
  options: FakeHarnessOptions = {},
): RecorderHarness & { bodies: Array<{ path: string; body: unknown }>; clipJobs: string[] } {
  const turns: FakeTurn[] =
    options.turns ??
    [
      { action: "clarify", imageCount: 0, captures: [aiModelEntry()] },
      {
        action: "edit",
        imageCount: 1,
        captures: [aiModelEntry(), studioImageEntry()],
      },
      {
        action: "generate",
        imageCount: 4,
        captures: [
          aiModelEntry(),
          // One corrective re-ask, exactly like the committed pack's fifth
          // studio_turn entry.
          aiModelEntry(),
          studioImageEntry(),
          studioImageEntry(),
          studioImageEntry(),
          studioImageEntry(),
        ],
      },
      {
        action: "edit",
        imageCount: 1,
        captures: [aiModelEntry(), studioImageEntry()],
      },
    ];
  const bodies: Array<{ path: string; body: unknown }> = [];
  const clipJobs: string[] = [];
  let turnIndex = 0;

  const CANONICAL_MESSAGES = [
    CROSS_MODE_STUDIO_OPENING_MESSAGE,
    CROSS_MODE_STUDIO_EDIT_MESSAGE,
    CROSS_MODE_STUDIO_UNRELATED_MESSAGE,
    CROSS_MODE_STUDIO_SECOND_EDIT_MESSAGE,
  ];

  return {
    bodies,
    clipJobs,
    guard: { networkCalls: ["https://fal.run/fal-ai/z-image/turbo/image-to-image"] },
    studioProjects: {
      pinBridgedAttachmentId() {
        /* identity only; the driver reads nothing back */
      },
      pinTurnImageIds() {
        /* identity only */
      },
    },
    jobs: {
      seed(job: VideoJobRecord) {
        clipJobs.push(`seeded:${job.id}`);
      },
    },
    async post(path, body) {
      bodies.push({ path, body });
      if (path === "/api/fal/i2i") {
        expect(body).toEqual(CROSS_MODE_SKETCH_FRAME);
        if (options.recordFrame !== false) store.record(sketchFrameEntry());
        return { status: 200, json: { images: [{ url: LIVE_OUTPUT }] } };
      }
      if (path === "/api/sketch/accept") {
        expect((body as { liveOutputDataUri: string }).liveOutputDataUri).toBe(
          LIVE_OUTPUT,
        );
        return {
          status: 201,
          json: {
            data: {
              sessionId: "sess-1",
              promptVersionId: "v1",
              generationId: "take-sketch",
              createdSession: true,
            },
          },
        };
      }
      if (path === "/api/studio/projects/from-session-picture") {
        return { status: 201, json: { data: { id: "proj-1" } } };
      }
      if (path.endsWith("/use-in-session")) {
        const imageId = path.split("/images/")[1]?.split("/")[0];
        return {
          status: 201,
          json: {
            data: {
              generationId: `take-from-${imageId ?? "unknown"}`,
              ancestorGenerationId: null,
            },
          },
        };
      }
      throw new Error(`unexpected POST ${path}`);
    },
    async patch(path, body) {
      bodies.push({ path, body });
      if (path === "/api/sessions/sess-1/versions") {
        return { status: 200, json: {} };
      }
      throw new Error(`unexpected PATCH ${path}`);
    },
    async get(path) {
      if (path.includes("/turns/")) {
        const turn = turns[turnIndex - 1];
        const images = Array.from({ length: turn?.imageCount ?? 0 }, (_, i) => ({
          status: "succeeded",
          image: { id: `img-${i}` },
        }));
        return {
          status: 200,
          json: {
            data: {
              status: "completed",
              decision: { action: turn?.action ?? "clarify" },
              calls: images,
            },
          },
        };
      }
      if (path.startsWith("/api/sessions/")) {
        return {
          status: 200,
          json: {
            data: {
              prompt: {
                versions: [
                  { versionId: "v1", prompt: CROSS_MODE_PROMPT },
                ],
              },
            },
          },
        };
      }
      if (path.startsWith("/api/preview/video/jobs/")) {
        return {
          status: 200,
          json: { status: "completed", attachment: { state: "attached" } },
        };
      }
      throw new Error(`unexpected GET ${path}`);
    },
    async postNdjson(path, body) {
      bodies.push({ path, body });
      if (path === "/api/studio/projects/proj-1/turns") {
        expect((body as { message: string }).message).toBe(
          CANONICAL_MESSAGES[turnIndex],
        );
        for (const capture of turns[turnIndex]?.captures ?? []) {
          store.record(capture);
        }
        const turnId = `turn-${turnIndex}`;
        turnIndex += 1;
        return [`{"type":"accepted","turnId":"${turnId}"}`];
      }
      throw new Error(`unexpected POST (ndjson) ${path}`);
    },
    async runClipJob(job: VideoJobRecord) {
      clipJobs.push(`ran:${job.id}`);
    },
  };
}

function makeStore(dir: string, maxLiveCalls = 64): BudgetedCassetteStore {
  return new BudgetedCassetteStore(maxLiveCalls, {
    fixturesDir: join(dir, "fixtures"),
  });
}

function runRecorder(
  harness: RecorderHarness,
  store: BudgetedCassetteStore,
  fixturesDir: string,
): Promise<unknown> {
  return recordCrossModePack({
    harness,
    store,
    fixturesDir,
    userId: "api-key:recorder",
    poll: { intervalMs: 1, timeoutMs: 1_000 },
  });
}

describe("BudgetedCassetteStore", () => {
  it("aborts the capture that would exceed the stated spend", () => {
    const store = makeStore(makeTempDir(), 2);
    store.beginScenario("cross-mode", "sketch-to-clip");
    store.record(sketchFrameEntry());
    store.record(aiModelEntry());
    expect(() => store.record(aiModelEntry())).toThrow(SpendBudgetExceededError);
    expect(() => store.record(aiModelEntry())).toThrow(/--max-live-calls/);
  });
});

describe("recordCrossModePack", () => {
  it("drives the canonical walkthrough and flushes a provenance-carrying pack", async () => {
    const dir = makeTempDir();
    const store = makeStore(dir);
    const harness = fakeHarness(store);

    const outcome = (await runRecorder(
      harness,
      store,
      join(dir, "fixtures"),
    )) as { written: string[]; capturedCount: number };

    expect(store.capturedEntries.length).toBeGreaterThanOrEqual(
      MIN_EXPECTED_ENTRIES,
    );
    expect(outcome.capturedCount).toBe(store.capturedEntries.length);
    expect(outcome.written).toHaveLength(1);
    expect(existsSync(outcome.written[0] ?? "")).toBe(true);
    // The seeded clip ran through the harness's controlled provider leg.
    expect(harness.clipJobs).toContain("seeded:cross-mode-clip-job");
    expect(harness.clipJobs).toContain("ran:cross-mode-clip-job");

    const pack = JSON.parse(
      readFileSync(outcome.written[0] ?? "", "utf8"),
    ) as { surface: string; scenario: string; entries: ReplayCassetteEntry[] };
    expect(pack.surface).toBe("cross-mode");
    expect(pack.scenario).toBe("sketch-to-clip");
    for (const entry of pack.entries) {
      expect(entry.provenance).toBeDefined();
      expect(entry.provenance?.origin).toBe("live");
    }
  });

  it("fails the run when the live model fumbles a canonical behavior", async () => {
    const dir = makeTempDir();
    const store = makeStore(dir);
    const harness = fakeHarness(store, {
      turns: [
        { action: "clarify", imageCount: 0, captures: [] },
        { action: "diagnose", imageCount: 0, captures: [] },
      ],
    });

    await expect(runRecorder(harness, store, join(dir, "fixtures"))).rejects.toThrow(
      /fumbled a behavior/,
    );
    expect(store.capturedEntries.length).toBeGreaterThan(0);
  });

  it("the spend budget aborts a runaway run mid-flight", async () => {
    const dir = makeTempDir();
    // Budget 3: the frame and the first two captures fit; the third turn's
    // capture is the (N+1)th and must abort the run, unflushed.
    const store = makeStore(dir, 3);
    const harness = fakeHarness(store);

    await expect(runRecorder(harness, store, join(dir, "fixtures"))).rejects.toThrow(
      SpendBudgetExceededError,
    );
    expect(store.capturedEntries).toHaveLength(3);
  });

  it("carries labelled-synthetic entries and drops stale unlabelled ones", async () => {
    const dir = makeTempDir();
    const fixturesDir = join(dir, "fixtures");
    const packDir = join(fixturesDir, "cross-mode");
    mkdirSync(packDir, { recursive: true });
    const staleKey = "ai-model:stale-unlabelled";
    const syntheticKey = "ai-model:deliberate-failure";
    writeFileSync(
      join(packDir, "sketch-to-clip.json"),
      JSON.stringify({
        formatVersion: 1,
        surface: "cross-mode",
        scenario: "sketch-to-clip",
        recordedAt: "2026-09-17T00:00:00.000Z",
        entries: [
          {
            seam: "ai-model",
            key: staleKey,
            contract: "llm-text",
            request: {
              operation: "studio_turn",
              systemPrompt: "s",
              userMessage: null,
              messages: null,
              stream: true,
            },
            response: { text: "old answer", metadata: {} },
          },
          {
            seam: "ai-model",
            key: syntheticKey,
            contract: "llm-text",
            request: {
              operation: "studio_turn",
              systemPrompt: "s",
              userMessage: null,
              messages: null,
              stream: true,
            },
            response: { text: "authored failure case", metadata: {} },
            provenance: {
              operation: "studio_turn",
              provider: "openai",
              model: "authored",
              parameters: {},
              origin: "synthetic",
              capture: {
                replayMode: "record",
                recordedAt: "2026-09-17T00:00:00.000Z",
                formatVersion: 1,
              },
            },
          },
        ],
      }),
    );

    const store = makeStore(dir);
    const harness = fakeHarness(store);
    const logs: string[] = [];
    const outcome = (await recordCrossModePack({
      harness,
      store,
      fixturesDir,
      userId: "api-key:recorder",
      poll: { intervalMs: 1, timeoutMs: 1_000 },
      log: (message) => logs.push(message),
    })) as { written: string[]; carriedSyntheticCount: number; droppedStaleCount: number };

    expect(outcome.carriedSyntheticCount).toBe(1);
    expect(outcome.droppedStaleCount).toBe(1);
    const pack = JSON.parse(
      readFileSync(outcome.written[0] ?? "", "utf8"),
    ) as { entries: ReplayCassetteEntry[] };
    expect(pack.entries.some((entry) => entry.key === syntheticKey)).toBe(true);
    expect(pack.entries.some((entry) => entry.key === staleKey)).toBe(false);
    expect(logs.some((line) => line.includes("carried synthetic entry"))).toBe(true);
    expect(logs.some((line) => line.includes("dropped stale entry"))).toBe(true);
  });
});

describe("finishRecording gates", () => {
  it("refuses to flush a run below the canonical floor", () => {
    const dir = makeTempDir();
    const store = makeStore(dir);
    store.beginScenario("cross-mode", "sketch-to-clip");
    store.record(sketchFrameEntry());

    expect(() =>
      finishRecording({
        store,
        fixturesDir: join(dir, "fixtures"),
        surface: "cross-mode",
        scenario: "sketch-to-clip",
        egressHosts: [],
        egressDestinations: [],
      }),
    ).toThrow(/half-run/);
    expect(existsSync(join(dir, "fixtures", "cross-mode"))).toBe(false);
  });

  it("refuses to flush a captured entry that carries no provenance", () => {
    const dir = makeTempDir();
    const store = makeStore(dir);
    store.beginScenario("cross-mode", "sketch-to-clip");
    const entry = aiModelEntry();
    delete (entry as { provenance?: unknown }).provenance;
    for (let i = 0; i < MIN_EXPECTED_ENTRIES; i += 1) {
      store.record(entry);
    }

    expect(() =>
      finishRecording({
        store,
        fixturesDir: join(dir, "fixtures"),
        surface: "cross-mode",
        scenario: "sketch-to-clip",
        egressHosts: [],
        egressDestinations: [],
      }),
    ).toThrow(/provenance/);
  });
});
