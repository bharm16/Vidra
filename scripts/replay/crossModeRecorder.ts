/**
 * The cross-mode cassette recorder's core (issue #139).
 *
 * Drives the cross-mode walkthrough's canonical scenario inputs — imported
 * from `goldenScenarios.ts` and nowhere else, so a recorded request is
 * byte-identical to what the replay integration suite produces — against the
 * real app booted by the shared harness in RECORD mode, then flushes the
 * contract-validated cassette.
 *
 * Three gates stand between a live run and a written fixture:
 *
 * 1. **Spend budget** — the store refuses the capture that would exceed
 *    `maxLiveCalls`, aborting the run mid-flight. A run that would exceed the
 *    ceiling fails rather than trimming itself, so a silent half-run can never
 *    read as a pass.
 * 2. **Behavior invariants** — each studio turn's decision must match the
 *    canonical action before anything is flushed; a recording where the model
 *    fumbled a behavior never becomes a fixture (the studio recorder's rule).
 * 3. **Provenance** — every captured entry must carry capture provenance.
 *
 * Deliberate failure cases in a previous pack are carried over only when they
 * are labelled `synthetic`; anything else that this run did not re-record is
 * dropped loudly instead of being served as stale live evidence.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeCameraDirection } from "@/features/workspace-shell/utils/cameraDirection";
import {
  CROSS_MODE_ACCEPT_KEY,
  CROSS_MODE_CAMERA_DIRECTION,
  CROSS_MODE_CAMERA_DIRECTION_2,
  CROSS_MODE_PROMPT,
  CROSS_MODE_SCENARIO,
  CROSS_MODE_SKETCH_DATA_URI,
  CROSS_MODE_SKETCH_FRAME,
  CROSS_MODE_SKETCH_INPUTS,
  CROSS_MODE_STUDIO_EDIT_MESSAGE,
  CROSS_MODE_STUDIO_OPENING_MESSAGE,
  CROSS_MODE_STUDIO_SECOND_EDIT_MESSAGE,
  CROSS_MODE_STUDIO_UNRELATED_MESSAGE,
  CROSS_MODE_SURFACE,
} from "./goldenScenarios.ts";
import type { ReplayCassetteEntry } from "@shared/schemas/replay.schemas";
import type { VideoJobRecord } from "@services/video-generation/jobs/types";
import { CassetteStore } from "@server/replay/CassetteStore";

/**
 * The walkthrough's live calls: 1 sketch frame + at least one `studio_turn`
 * per message + 6 studio image runs. Re-asks only add. The default ceiling
 * leaves headroom above the expected 11-15 without admitting a runaway loop;
 * `--max-live-calls` overrides it.
 */
export const DEFAULT_MAX_LIVE_CALLS = 20;

/** Floor of entries the canonical path must capture: 1 frame + 4 turns + 6 images. */
export const MIN_EXPECTED_ENTRIES = 11;

/** The bridged attachment's pinned id — the walkthrough's identity device. */
export const BRIDGED_ATTACHMENT_ID = "att-bridged-session-picture";
const CAMERA_VERSION_ID = "v-cross-mode-camera";
const CLIP_JOB_ID = "cross-mode-clip-job";

export class SpendBudgetExceededError extends Error {
  constructor(
    readonly maxLiveCalls: number,
  ) {
    super(
      `Live-call budget exceeded: the run captured its ${maxLiveCalls} allowed ` +
        `provider response and another call arrived. Raise --max-live-calls only ` +
        `deliberately — the budget is the stated spend ceiling, and a run that ` +
        `would exceed it must fail rather than trim itself.`,
    );
    this.name = "SpendBudgetExceededError";
  }
}

/**
 * The cassette store with the run's spend meter on it: every seam capture is
 * one billable provider response (ai-model call, studio image run, or sketch
 * frame), which is exactly the unit the budget should count.
 */
export class BudgetedCassetteStore extends CassetteStore {
  private readonly captured: ReplayCassetteEntry[] = [];

  constructor(
    private readonly maxLiveCalls: number,
    options: { fixturesDir?: string } = {},
  ) {
    super(options);
  }

  override record(entry: ReplayCassetteEntry): void {
    if (this.captured.length >= this.maxLiveCalls) {
      throw new SpendBudgetExceededError(this.maxLiveCalls);
    }
    this.captured.push(entry);
    super.record(entry);
  }

  get capturedEntries(): readonly ReplayCassetteEntry[] {
    return this.captured;
  }
}

/** The part of the cross-mode harness the recorder drives. Structural, so
 * unit tests can script it without booting the app. */
export interface RecorderHarness {
  readonly guard: { readonly networkCalls: readonly string[] };
  readonly studioProjects: {
    pinBridgedAttachmentId(projectId: string, attachmentId: string): void;
    pinTurnImageIds(projectId: string, turnId: string, prefix: string): void;
  };
  readonly jobs: { seed(job: VideoJobRecord): void };
  post(path: string, body: unknown): Promise<RecorderResponse>;
  patch(path: string, body: unknown): Promise<RecorderResponse>;
  get(path: string): Promise<RecorderResponse>;
  postNdjson(path: string, body: unknown): Promise<string[]>;
  runClipJob(job: VideoJobRecord): Promise<void>;
}

export interface RecorderResponse {
  status: number;
  json: Record<string, unknown>;
}

export interface CrossModeRecordOutcome {
  written: string[];
  capturedCount: number;
  carriedSyntheticCount: number;
  droppedStaleCount: number;
  /** Deduped hosts the run reached on the real network. */
  egressHosts: string[];
  /** Every non-loopback destination, in call order — the run's egress log. */
  egressDestinations: readonly string[];
}

export interface CrossModeRecordDeps {
  harness: RecorderHarness;
  store: BudgetedCassetteStore;
  /** The fixtures dir, for finding the previous pack's synthetic entries. */
  fixturesDir: string;
  /** The API-key principal the walkthrough runs as. */
  userId: string;
  poll?: { intervalMs?: number; timeoutMs?: number };
  log?: (message: string) => void;
}

interface StudioTurnView {
  status: string;
  decision: { action: string };
  calls: Array<{ status: string; image?: { id: string } | undefined }>;
}

/** Abort the run: the walkthrough left its canonical shape. */
function drop(what: string, actual: unknown): never {
  throw new Error(
    `Cross-mode recording aborted at ${what}: ${
      JSON.stringify(actual)?.slice(0, 400)
    }`,
  );
}

/** The canonical message → expected decision, in order. The edit on the FIRST
 * message-turn boundary is exactly what issue #110 opened: edit is available
 * from the project's first turn because the bridged picture is a valid
 * source — the recorded studio leg exercises that boundary. */
const STUDIO_SCRIPT: ReadonlyArray<{
  message: string;
  pinPrefix?: string;
  expectAction: string;
}> = [
  {
    message: CROSS_MODE_STUDIO_OPENING_MESSAGE,
    expectAction: "clarify",
  },
  {
    message: CROSS_MODE_STUDIO_EDIT_MESSAGE,
    pinPrefix: "edit",
    expectAction: "edit",
  },
  {
    message: CROSS_MODE_STUDIO_UNRELATED_MESSAGE,
    pinPrefix: "fresh",
    expectAction: "generate",
  },
  {
    message: CROSS_MODE_STUDIO_SECOND_EDIT_MESSAGE,
    pinPrefix: "warmed",
    expectAction: "edit",
  },
];

export async function recordCrossModePack(
  deps: CrossModeRecordDeps,
): Promise<CrossModeRecordOutcome> {
  const { harness, store, fixturesDir, userId } = deps;
  const log = deps.log ?? (() => undefined);
  const pollIntervalMs = deps.poll?.intervalMs ?? 500;
  const pollTimeoutMs = deps.poll?.timeoutMs ?? 300_000;

  store.beginScenario(CROSS_MODE_SURFACE, CROSS_MODE_SCENARIO);

  // 1. The sketch frame — the relay's one upstream call.
  log(`→ sketch frame: POST /api/fal/i2i`);
  const frame = await harness.post("/api/fal/i2i", CROSS_MODE_SKETCH_FRAME);
  if (frame.status !== 200) drop("the sketch frame", frame);
  const frameImages = frame.json.images as Array<{ url: string }> | undefined;
  const liveOutput = frameImages?.[0]?.url;
  if (!liveOutput) drop("the sketch frame response", frame.json);
  log(`✓ sketch frame captured (${String(liveOutput).slice(0, 48)}…)`);

  // 2. Use this — admits the shown live output as the session's first take.
  log(`→ Use this: POST /api/sketch/accept`);
  const accepted = await harness.post("/api/sketch/accept", {
    liveOutputDataUri: liveOutput,
    sketchSnapshotDataUri: CROSS_MODE_SKETCH_DATA_URI,
    inputs: CROSS_MODE_SKETCH_INPUTS,
    idempotencyKey: CROSS_MODE_ACCEPT_KEY,
  });
  if (accepted.status !== 201) drop("the sketch acceptance", accepted);
  const acceptData = accepted.json.data as
    | { sessionId: string; promptVersionId: string; generationId: string }
    | undefined;
  if (!acceptData) drop("the sketch acceptance body", accepted.json);
  const sessionId = acceptData.sessionId;
  const sketchTakeId = acceptData.generationId;
  log(`✓ session ${sessionId} created from the accepted picture`);

  // 3. The session picture opens a studio project that records its origin.
  log(`→ bridge: POST /api/studio/projects/from-session-picture`);
  const bridged = await harness.post("/api/studio/projects/from-session-picture", {
    sessionId,
    generationId: sketchTakeId,
  });
  if (bridged.status !== 201) drop("the studio bridge", bridged);
  const projectId = (bridged.json.data as { id: string } | undefined)?.id;
  if (!projectId) drop("the studio bridge body", bridged.json);
  harness.studioProjects.pinBridgedAttachmentId(projectId, BRIDGED_ATTACHMENT_ID);
  log(`✓ studio project ${projectId} bridged`);

  // 4. The studio conversation. Every decision is checked against the
  //    canonical action before anything can be flushed.
  const producedIds: Record<string, string> = {};
  for (const step of STUDIO_SCRIPT) {
    log(`→ studio turn: "${step.message}"`);
    const events = await harness.postNdjson(
      `/api/studio/projects/${projectId}/turns`,
      { message: step.message },
    );
    const acceptedEvent = events
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((event) => event.type === "accepted");
    const turnId = acceptedEvent?.turnId as string | undefined;
    if (!turnId) drop(`the "${step.message}" turn`, events);

    const pollOnce = (): Promise<StudioTurnView> =>
      pollStudioTurn(harness, projectId, turnId, {
        intervalMs: pollIntervalMs,
        timeoutMs: pollTimeoutMs,
      });
    let turn = await pollOnce();
    if (step.pinPrefix) {
      // Identity, not behavior: rename this turn's produced images to
      // `<prefix>-<n>` so the next turn's prompt is reproducible, then read
      // the settled ids back.
      harness.studioProjects.pinTurnImageIds(projectId, turnId, step.pinPrefix);
      turn = await pollOnce();
    }
    // Behavior gate: a recording where the model fumbled the canonical
    // behavior never becomes a fixture.
    if (turn.decision.action !== step.expectAction) {
      throw new Error(
        `Studio turn "${step.message}" decided "${turn.decision.action}" but the ` +
          `canonical scenario requires "${step.expectAction}" — the live model ` +
          `fumbled a behavior, so nothing was flushed`,
      );
    }
    if (step.pinPrefix) {
      const imageId = turn.calls.find((call) => call.image)?.image?.id;
      if (!imageId) drop(`the "${step.message}" turn images`, turn);
      producedIds[step.pinPrefix] = imageId;
    }
    log(`✓ studio turn → ${turn.decision.action}`);
  }

  // 5. Use this in the session — the return legs, in the walkthrough's order.
  const imageIdFor = (prefix: string): string => {
    const id = producedIds[prefix];
    if (!id) drop(`the pinned "${prefix}" images`, producedIds);
    return id;
  };
  const returnIds: string[] = [];
  for (const prefix of ["warmed", "fresh", "edit"]) {
    const imageId = imageIdFor(prefix);
    const returned = await harness.post(
      `/api/studio/projects/${projectId}/images/${imageId}/use-in-session`,
      {},
    );
    if (returned.status !== 201) drop(`the return of ${imageId}`, returned);
    returnIds.push(
      (returned.json.data as { generationId: string }).generationId,
    );
    log(`✓ ${imageId} returned to the session as ${returnIds[returnIds.length - 1]}`);
  }
  const refinedTakeId = returnIds[returnIds.length - 1];
  if (!refinedTakeId) drop("the studio return legs", returnIds);

  // 6. Camera direction as words — the client's writer, the session's keeper.
  log(`→ camera direction: PATCH /api/sessions/${sessionId}/versions`);
  const session = await harness.get(`/api/sessions/${sessionId}`);
  if (session.status !== 200) drop("the session read", session);
  const dto = session.json.data as {
    prompt?: {
      versions?: Array<{
        versionId: string;
        prompt: string;
        generations?: unknown[];
      }>;
    };
  };
  const versions = dto.prompt?.versions ?? [];
  const current = versions[versions.length - 1];
  if (!current || current.prompt !== CROSS_MODE_PROMPT) {
    drop("the session words", current);
  }
  const first = writeCameraDirection({
    prompt: current.prompt,
    direction: CROSS_MODE_CAMERA_DIRECTION,
  });
  if (first.outcome !== "written") drop("the camera write", first);
  const second = writeCameraDirection({
    prompt: first.prompt,
    direction: CROSS_MODE_CAMERA_DIRECTION_2,
    previousDirection: CROSS_MODE_CAMERA_DIRECTION,
  });
  if (second.outcome !== "written") drop("the second camera write", second);
  const patched = await harness.patch(`/api/sessions/${sessionId}/versions`, {
    versions: [
      ...versions,
      {
        versionId: CAMERA_VERSION_ID,
        label: "v2",
        prompt: second.prompt,
        timestamp: new Date().toISOString(),
        generations: [],
      },
    ],
  });
  if (patched.status !== 200) drop("the camera words patch", patched);
  log(`✓ camera words kept as ${CAMERA_VERSION_ID}`);

  // 7. The clip — a controlled provider, so it spends nothing; it proves the
  //    recorded pack supports the path's end (attachment as a take).
  log(`→ clip: processVideoJob ${CLIP_JOB_ID}`);
  const clipJob: VideoJobRecord = {
    id: CLIP_JOB_ID,
    status: "processing",
    userId,
    sessionId,
    promptVersionId: CAMERA_VERSION_ID,
    sourceGenerationId: refinedTakeId,
    request: {
      prompt: second.prompt,
      options: { model: "wan", aspectRatio: "16:9" },
    },
    creditsReserved: 0,
    attempts: 1,
    maxAttempts: 3,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
  };
  harness.jobs.seed(clipJob);
  await harness.runClipJob(clipJob);
  const jobView = await harness.get(`/api/preview/video/jobs/${CLIP_JOB_ID}`);
  if (jobView.status !== 200 || jobView.json.status !== "completed") {
    drop("the clip job", jobView.json);
  }
  log(`✓ clip completed and attached`);

  return finishRecording({
    store,
    fixturesDir,
    scenario: CROSS_MODE_SCENARIO,
    surface: CROSS_MODE_SURFACE,
    egressHosts: [...new Set(harness.guard.networkCalls.map(hostOf))].sort(),
    egressDestinations: harness.guard.networkCalls,
    log,
  });
}

/**
 * The gates between a captured run and a written pack: provenance on every
 * entry, the canonical floor, synthetic carry-over, then flush.
 */
export function finishRecording(gates: {
  store: BudgetedCassetteStore;
  fixturesDir: string;
  surface: string;
  scenario: string;
  egressHosts: string[];
  egressDestinations: readonly string[];
  log?: (message: string) => void;
}): CrossModeRecordOutcome {
  const log = gates.log ?? (() => undefined);
  const captured = gates.store.capturedEntries;

  if (captured.length < MIN_EXPECTED_ENTRIES) {
    throw new Error(
      `Only ${captured.length} provider responses were captured; the canonical ` +
        `walkthrough must produce at least ${MIN_EXPECTED_ENTRIES}. A shorter run ` +
        `is a half-run, and a half-run must not read as a pass.`,
    );
  }

  const missingProvenance = captured.filter(
    (entry) => entry.provenance === undefined,
  );
  if (missingProvenance.length > 0) {
    throw new Error(
      `${missingProvenance.length} captured entr(y/ies) carry no provenance — ` +
        `every recorded entry must name its operation, provider, model, ` +
        `parameters and capture run. Nothing was flushed.`,
    );
  }

  // Carry over the previous pack's deliberate failure cases, labelled
  // synthetic; anything stale and unlabelled is dropped loudly.
  let carriedSyntheticCount = 0;
  let droppedStaleCount = 0;
  const previousPath = join(
    gates.fixturesDir,
    gates.surface,
    `${gates.scenario}.json`,
  );
  if (existsSync(previousPath)) {
    const previous = JSON.parse(readFileSync(previousPath, "utf8")) as {
      entries?: Array<ReplayCassetteEntry>;
    };
    const capturedKeys = new Set(captured.map((entry) => entry.key));
    for (const entry of previous.entries ?? []) {
      if (capturedKeys.has(entry.key)) continue;
      if (entry.provenance?.origin === "synthetic") {
        gates.store.record(entry);
        carriedSyntheticCount += 1;
        log(`+ carried synthetic entry ${entry.key.slice(0, 40)}…`);
      } else {
        droppedStaleCount += 1;
        log(
          `- dropped stale entry ${entry.key.slice(0, 40)}… — it was not ` +
            `re-recorded and is not labelled synthetic, so it cannot stay in ` +
            `the pack as live evidence`,
        );
      }
    }
  }

  const written = gates.store.flush();
  return {
    written,
    capturedCount: captured.length,
    carriedSyntheticCount,
    droppedStaleCount,
    egressHosts: gates.egressHosts,
    egressDestinations: gates.egressDestinations,
  };
}

async function pollStudioTurn(
  harness: RecorderHarness,
  projectId: string,
  turnId: string,
  poll: { intervalMs: number; timeoutMs: number },
): Promise<StudioTurnView> {
  const deadline = Date.now() + poll.timeoutMs;
  for (;;) {
    const view = await harness.get(
      `/api/studio/projects/${projectId}/turns/${turnId}`,
    );
    if (view.status !== 200) {
      throw new Error(`Studio turn ${turnId} read failed: ${view.status}`);
    }
    const turn = view.json.data as StudioTurnView;
    if (turn.status === "failed") {
      throw new Error(
        `Studio turn ${turnId} failed live: ${JSON.stringify(turn).slice(0, 400)}`,
      );
    }
    if (turn.status !== "running") return turn;
    if (Date.now() > deadline) {
      throw new Error(`Studio turn ${turnId} never settled`);
    }
    await new Promise((resolve) => setTimeout(resolve, poll.intervalMs));
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
