import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CROSS_MODE_ACCEPT_KEY,
  CROSS_MODE_STUDIO_EDIT_MESSAGE,
  CROSS_MODE_STUDIO_OPENING_MESSAGE,
  CROSS_MODE_STUDIO_SECOND_EDIT_MESSAGE,
  CROSS_MODE_STUDIO_UNRELATED_MESSAGE,
  CROSS_MODE_STUDIO_VARIANT_DATA_URIS,
  CROSS_MODE_LIVE_OUTPUT_DATA_URI,
  CROSS_MODE_PROMPT,
  CROSS_MODE_SKETCH_DATA_URI,
  CROSS_MODE_SKETCH_FRAME,
  CROSS_MODE_SKETCH_INPUTS,
} from "@scripts/replay/goldenScenarios";
import {
  CROSS_MODE_CAMERA_DIRECTION,
  CROSS_MODE_CAMERA_DIRECTION_2,
} from "@scripts/replay/goldenScenarios";
import { writeCameraDirection } from "@/features/workspace-shell/utils/cameraDirection";
import { processVideoJob } from "@services/video-generation/jobs/processVideoJob";
import { resumePendingAttachments } from "@services/video-generation/jobs/resumePendingAttachments";
import type { SessionService } from "@services/sessions/SessionService";
import type { VideoJobRecord } from "@services/video-generation/jobs/types";
import {
  CROSS_MODE_USER_ID,
  startCrossModeHarness,
  type ApiResponse,
  type CrossModeHarness,
} from "./helpers/cross-mode/harness";

/**
 * The cross-mode golden path (issue #90) — ADR-0022's milestone, proved.
 *
 * A creator starts from a sketch, presses Use this, refines the picture in the
 * studio, returns it to the session, adds camera direction as words, makes a
 * clip, and comes back after a refresh to the same session with every take,
 * origin, edge and associated word intact.
 *
 * It runs offline. Every boundary it touches has a deterministic adapter, and
 * the outbound guard fails the run if one is missed — see
 * `docs/architecture/cross-mode-golden-path.md` for the table.
 *
 * What this suite is NOT: a second copy of the unit coverage each contributing
 * ticket already carries. It composes them and asserts the seams line up.
 */

interface Walkthrough {
  sessionId: string;
  promptVersionId: string;
  sketchTakeId: string;
  studioProjectId: string;
  studioEditImageId: string;
  studioUnrelatedImageId: string;
  refinedTakeId: string;
  unrelatedTakeId: string;
  secondEditTakeId: string;
  cameraVersionId: string;
  cameraPrompt: string;
  clipJobId: string;
}

/** The bridged picture's id, pinned so the studio's prompt is reproducible. */
const BRIDGED_ATTACHMENT_ID = "att-bridged-session-picture";

const walkthrough: Walkthrough = {
  sessionId: "",
  promptVersionId: "",
  sketchTakeId: "",
  studioProjectId: "",
  studioEditImageId: "",
  studioUnrelatedImageId: "",
  refinedTakeId: "",
  unrelatedTakeId: "",
  secondEditTakeId: "",
  cameraVersionId: "",
  cameraPrompt: "",
  clipJobId: "",
};

describe("Cross-mode golden path (integration)", () => {
  let harness: CrossModeHarness;

  beforeAll(async () => {
    harness = await startCrossModeHarness();
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  it("the sketch relay answers from the recorded cassette, with no upstream", async () => {
    const { status, json } = await harness.post(
      "/api/fal/i2i",
      CROSS_MODE_SKETCH_FRAME,
    );

    expect(status).toBe(200);
    const images = json.images as Array<{ url: string }>;
    expect(images[0]?.url).toBe(CROSS_MODE_LIVE_OUTPUT_DATA_URI);
    harness.guard.assertNoOutboundCalls();
  });

  it("Use this admits the shown live output as a sketchpad take in a new session", async () => {
    const { status, json } = await harness.post("/api/sketch/accept", {
      liveOutputDataUri: CROSS_MODE_LIVE_OUTPUT_DATA_URI,
      sketchSnapshotDataUri: CROSS_MODE_SKETCH_DATA_URI,
      inputs: CROSS_MODE_SKETCH_INPUTS,
      idempotencyKey: CROSS_MODE_ACCEPT_KEY,
    });

    expect(status).toBe(201);
    const data = json.data as {
      sessionId: string;
      promptVersionId: string;
      generationId: string;
      createdSession: boolean;
    };
    expect(data.createdSession).toBe(true);
    walkthrough.sessionId = data.sessionId;
    walkthrough.promptVersionId = data.promptVersionId;
    walkthrough.sketchTakeId = data.generationId;

    const session = await harness.sessions.get(data.sessionId);
    const version = session?.prompt?.versions?.[0];
    const take = version?.generations?.[0] as
      | Record<string, unknown>
      | undefined;

    expect(take?.id).toBe(data.generationId);
    // ADR-0022 decision 1: the origin is recorded at admission.
    expect(take?.origin).toBe("sketchpad");
    // Decision 2: production provenance is the inputs of THIS output…
    expect(take?.productionProvenance).toMatchObject({
      state: "known",
      instruction: CROSS_MODE_PROMPT,
      sketch: {
        seed: CROSS_MODE_SKETCH_INPUTS.seed,
        strength: CROSS_MODE_SKETCH_INPUTS.strength,
        steps: CROSS_MODE_SKETCH_INPUTS.steps,
      },
    });
    // …and the associated words are the version's own text.
    expect(take?.prompt).toBe(CROSS_MODE_PROMPT);
    // Decision 3: the drawing is a recorded source input; a sketch is not a
    // take, so the picture hangs from its words-version.
    expect(take?.ancestorGenerationId).toBeNull();
    const sources = take?.sourceInputs as Array<Record<string, unknown>>;
    expect(sources.map((input) => input.kind)).toEqual(["sketch", "sketch"]);

    // ADR-0011 D4: the admitted picture is armed as the first frame.
    expect(session?.prompt?.keyframes?.[0]?.generationId).toBe(
      data.generationId,
    );
    harness.guard.assertNoOutboundCalls();
  });

  it("the session picture opens a studio project that records its origin", async () => {
    const { status, json } = await harness.post(
      "/api/studio/projects/from-session-picture",
      {
        sessionId: walkthrough.sessionId,
        generationId: walkthrough.sketchTakeId,
      },
    );

    expect(status).toBe(201);
    const project = json.data as {
      id: string;
      origin?: {
        sessionId: string;
        promptVersionId: string;
        bridgedImageId: string;
        sourceInput: { kind: string; generationId?: string };
      };
    };
    // ADR-0022 decision 4: the project records where it came from — session,
    // words-version and take identity — so the return leg never has to guess.
    expect(project.origin?.sessionId).toBe(walkthrough.sessionId);
    expect(project.origin?.promptVersionId).toBe(walkthrough.promptVersionId);
    expect(project.origin?.sourceInput.kind).toBe("take");
    expect(project.origin?.sourceInput.generationId).toBe(
      walkthrough.sketchTakeId,
    );
    walkthrough.studioProjectId = project.id;

    // Browsing is read-only: opening the studio leaves the take untouched.
    const session = await harness.sessions.get(walkthrough.sessionId);
    expect(session?.prompt?.versions?.[0]?.generations).toHaveLength(1);

    harness.studioProjects.pinBridgedAttachmentId(
      project.id,
      BRIDGED_ATTACHMENT_ID,
    );
    harness.guard.assertNoOutboundCalls();
  });

  it("the studio's first turn asks rather than guessing", async () => {
    // Behavior 1: a deliberately vague opening ("make this better") clarifies
    // rather than guessing. edit/transform ARE available on this first turn —
    // the bridged picture is a valid source (ADR-0022 decision 4, issue #110) —
    // so clarify here is behavior 1's own choice, not a limit of the first
    // turn. The first-turn edit rule itself is proved in
    // StudioService.first-turn-edit.regression.test.ts.
    const turn = await runStudioTurn(CROSS_MODE_STUDIO_OPENING_MESSAGE);
    expect(turn.decision.action).toBe("clarify");
    expect(turn.calls).toHaveLength(0);
    harness.guard.assertNoOutboundCalls();
  });

  it("a studio edit of the bridged picture produces an image from it", async () => {
    const turn = await runStudioTurn(CROSS_MODE_STUDIO_EDIT_MESSAGE, "edit");
    expect(turn.decision.action).toBe("edit");
    const image = turn.calls.find((call) => call.image)?.image;
    expect(image?.id).toBe("edit-0");
    walkthrough.studioEditImageId = image?.id ?? "";
    harness.guard.assertNoOutboundCalls();
  });

  it("an unrelated studio generation produces images that consumed nothing", async () => {
    const turn = await runStudioTurn(
      CROSS_MODE_STUDIO_UNRELATED_MESSAGE,
      "fresh",
    );
    expect(turn.decision.action).toBe("generate");
    const produced = turn.calls
      .filter((call) => call.status === "succeeded")
      .map((call) => call.image?.id);
    expect(produced).toEqual(["fresh-0", "fresh-1", "fresh-2", "fresh-3"]);
    walkthrough.studioUnrelatedImageId = produced[0] ?? "";
    harness.guard.assertNoOutboundCalls();
  });

  it("an edit of a picture the session never saw earns no refine edge", async () => {
    // ADR-0022 decision 3: only a DIRECT consumption of the bridged picture
    // earns the edge. This turn consumed a studio image with no take identity
    // at all, so the honest answer is "no picture ancestor" — never the
    // positional guess ("whichever source was listed first") the decision
    // exists to forbid.
    const turn = await runStudioTurn(
      CROSS_MODE_STUDIO_SECOND_EDIT_MESSAGE,
      "warmed",
    );
    expect(turn.decision.action).toBe("edit");
    expect(turn.calls.find((call) => call.image)?.image?.id).toBe("warmed-0");

    const { status, json } = await harness.post(
      `/api/studio/projects/${walkthrough.studioProjectId}/images/warmed-0/use-in-session`,
      {},
    );
    expect(status).toBe(201);
    const result = json.data as {
      generationId: string;
      ancestorGenerationId: string | null;
    };
    expect(result.ancestorGenerationId).toBeNull();

    const take = await findTake(result.generationId);
    expect(take?.ancestorGenerationId).toBeNull();
    // The input it DID consume is still recorded in full — the fact that it
    // went in is kept; the claim that it is a sibling in this session is not.
    const sources = take?.sourceInputs as Array<Record<string, unknown>>;
    expect(sources.some((input) => input.kind === "studio-image")).toBe(true);
    expect(sources.some((input) => input.kind === "take")).toBe(false);
    walkthrough.secondEditTakeId = result.generationId;
    harness.guard.assertNoOutboundCalls();
  });

  it("an unrelated studio generation returns with no picture ancestor", async () => {
    // ADR-0022 decision 4's discriminating case: the project's origin says
    // only that the PROJECT came from a session picture. This generation
    // consumed nothing, so it earns no refine edge — an answer, not a gap.
    const { status, json } = await harness.post(
      `/api/studio/projects/${walkthrough.studioProjectId}/images/${walkthrough.studioUnrelatedImageId}/use-in-session`,
      {},
    );

    expect(status).toBe(201);
    const result = json.data as {
      generationId: string;
      ancestorGenerationId: string | null;
    };
    expect(result.ancestorGenerationId).toBeNull();
    walkthrough.unrelatedTakeId = result.generationId;

    const take = await findTake(result.generationId);
    expect(take?.origin).toBe("studio");
    expect(take?.ancestorGenerationId).toBeNull();
    harness.guard.assertNoOutboundCalls();
  });

  it("Use this in the session returns the studio edit with a refine edge", async () => {
    const { status, json } = await harness.post(
      `/api/studio/projects/${walkthrough.studioProjectId}/images/${walkthrough.studioEditImageId}/use-in-session`,
      {},
    );

    expect(status).toBe(201);
    const result = json.data as {
      sessionId: string;
      promptVersionId: string;
      generationId: string;
      ancestorGenerationId: string | null;
      createdSession: boolean;
    };
    // The destination is the project's OWN origin — never a session the
    // caller named — and it already existed, so nothing was minted.
    expect(result.sessionId).toBe(walkthrough.sessionId);
    expect(result.promptVersionId).toBe(walkthrough.promptVersionId);
    expect(result.createdSession).toBe(false);
    // ADR-0022 decision 3: the edit consumed the bridged picture, so the
    // returning take's display ancestor is the take that picture came from —
    // the picture → picture relationship the space draws as `refine`.
    expect(result.ancestorGenerationId).toBe(walkthrough.sketchTakeId);
    walkthrough.refinedTakeId = result.generationId;

    const take = await findTake(result.generationId);
    expect(take?.origin).toBe("studio");
    expect(take?.ancestorGenerationId).toBe(walkthrough.sketchTakeId);
    // Decision 2: provenance is the EDIT INSTRUCTION, never the session's
    // words — and the associated words stay the version's own text.
    expect(take?.productionProvenance).toMatchObject({
      state: "known",
      instruction: "remove the reflection in the puddle",
      studio: {
        projectId: walkthrough.studioProjectId,
        imageId: walkthrough.studioEditImageId,
      },
    });
    expect(take?.prompt).toBe(CROSS_MODE_PROMPT);
    const sources = take?.sourceInputs as Array<Record<string, unknown>>;
    expect(
      sources.some(
        (input) =>
          input.kind === "take" &&
          input.generationId === walkthrough.sketchTakeId,
      ),
    ).toBe(true);

    // The refined picture is armed as the first frame the clip will animate.
    const session = await harness.sessions.get(walkthrough.sessionId);
    expect(session?.prompt?.keyframes?.[0]?.generationId).toBe(
      result.generationId,
    );
    harness.guard.assertNoOutboundCalls();
  });

  it("the camera choice lands in the words, and replaces rather than accumulates", async () => {
    const session = await harness.sessions.get(walkthrough.sessionId);
    const versions = session?.prompt?.versions ?? [];
    const current = versions[versions.length - 1];
    expect(current?.prompt).toBe(CROSS_MODE_PROMPT);

    // ADR-0022 decision 7: the picker writes an editable camera span into the
    // creator's words. The writer is the client's, exercised here for real —
    // the cross-mode proof is that what it writes is what the session keeps.
    const first = writeCameraDirection({
      prompt: current?.prompt ?? "",
      direction: CROSS_MODE_CAMERA_DIRECTION,
    });
    expect(first.outcome).toBe("written");
    const firstPrompt = first.outcome === "written" ? first.prompt : "";
    expect(firstPrompt).toContain(CROSS_MODE_CAMERA_DIRECTION);

    const second = writeCameraDirection({
      prompt: firstPrompt,
      direction: CROSS_MODE_CAMERA_DIRECTION_2,
      previousDirection: CROSS_MODE_CAMERA_DIRECTION,
    });
    expect(second.outcome).toBe("written");
    const cameraPrompt = second.outcome === "written" ? second.prompt : "";
    // Replaces, never accumulates (ADR-0010's truth contract).
    expect(cameraPrompt).not.toContain(CROSS_MODE_CAMERA_DIRECTION);
    expect(cameraPrompt).toContain(CROSS_MODE_CAMERA_DIRECTION_2);
    walkthrough.cameraPrompt = cameraPrompt;
    walkthrough.cameraVersionId = "v-cross-mode-camera";

    const patched = await patchVersions([
      ...versions,
      {
        versionId: walkthrough.cameraVersionId,
        label: "v2",
        prompt: cameraPrompt,
        timestamp: new Date().toISOString(),
        generations: [],
      },
    ]);
    expect(patched).toBe(200);

    const after = await harness.sessions.get(walkthrough.sessionId);
    const cameraVersion = after?.prompt?.versions?.find(
      (version) => version.versionId === walkthrough.cameraVersionId,
    );
    expect(cameraVersion?.prompt).toBe(cameraPrompt);
    harness.guard.assertNoOutboundCalls();
  });

  it("the clip attaches to the session as a take rooted at the refined picture", async () => {
    const job = seedClipJob("cross-mode-clip-job");
    await runClipJob(job);

    const { status, json } = await harness.get(
      `/api/preview/video/jobs/${job.id}`,
    );
    expect(status).toBe(200);
    expect(json.status).toBe("completed");
    // ADR-0022 decision 6: the attachment is a SECOND fact, reported beside
    // the generation outcome. The client calls the job terminal only once it
    // resolves, so a clip can never render as a node the session never got.
    expect(json.attachment).toMatchObject({
      state: "attached",
      generationId: job.id,
      sessionId: walkthrough.sessionId,
      promptVersionId: walkthrough.cameraVersionId,
    });

    const take = await findTake(job.id);
    expect(take?.mediaType).toBe("video");
    // A clip's origin is always `generated` (decision 1), it is filed under
    // the camera words, and it is rooted at the picture it animated.
    expect(take?.origin).toBe("generated");
    expect(take?.prompt).toBe(walkthrough.cameraPrompt);
    expect(take?.ancestorGenerationId).toBe(walkthrough.refinedTakeId);
    // "never invokes refund logic" — asserted, not claimed.
    expect(harness.refunds.refunds).toEqual([]);
    harness.guard.assertNoOutboundCalls();
  });

  it("the whole session reconstructs from server records alone", async () => {
    // The refresh: no client state, no in-test bookkeeping — just the session
    // the server would hand a browser that had just loaded.
    const { status, json } = await harness.get(
      `/api/sessions/${walkthrough.sessionId}`,
    );
    expect(status).toBe(200);
    const dto = json.data as {
      prompt?: {
        keyframes?: Array<{ generationId?: string }>;
        versions?: Array<{
          versionId: string;
          prompt: string;
          generations?: Array<Record<string, unknown>>;
        }>;
      };
    };

    const takes = (dto.prompt?.versions ?? []).flatMap((version) =>
      (version.generations ?? []).map((generation) => ({
        id: generation.id as string,
        origin: generation.origin as string,
        ancestor: generation.ancestorGenerationId as string | null,
        words: version.prompt,
      })),
    );

    // Every take, its origin, its edge and its associated words — exactly.
    expect(takes).toEqual([
      {
        id: walkthrough.sketchTakeId,
        origin: "sketchpad",
        ancestor: null,
        words: CROSS_MODE_PROMPT,
      },
      {
        id: walkthrough.secondEditTakeId,
        origin: "studio",
        ancestor: null,
        words: CROSS_MODE_PROMPT,
      },
      {
        id: walkthrough.unrelatedTakeId,
        origin: "studio",
        ancestor: null,
        words: CROSS_MODE_PROMPT,
      },
      {
        id: walkthrough.refinedTakeId,
        origin: "studio",
        ancestor: walkthrough.sketchTakeId,
        words: CROSS_MODE_PROMPT,
      },
      {
        id: walkthrough.clipJobId,
        origin: "generated",
        ancestor: walkthrough.refinedTakeId,
        words: walkthrough.cameraPrompt,
      },
    ]);

    // The armed first frame survives the refresh — it is a session fact, not
    // a memory (ADR-0011 D4).
    expect(dto.prompt?.keyframes?.[0]?.generationId).toBe(
      walkthrough.refinedTakeId,
    );
    harness.guard.assertNoOutboundCalls();
  });

  // ── Identity ────────────────────────────────────────────────────────

  it("a retry after a lost response returns the same take, not a second one", async () => {
    const before = await countTakes();
    const { status, json } = await harness.post("/api/sketch/accept", {
      liveOutputDataUri: CROSS_MODE_LIVE_OUTPUT_DATA_URI,
      sketchSnapshotDataUri: CROSS_MODE_SKETCH_DATA_URI,
      inputs: CROSS_MODE_SKETCH_INPUTS,
      idempotencyKey: CROSS_MODE_ACCEPT_KEY,
    });

    expect(status).toBe(201);
    const data = json.data as { sessionId: string; generationId: string };
    expect(data.generationId).toBe(walkthrough.sketchTakeId);
    expect(data.sessionId).toBe(walkthrough.sessionId);
    expect(await countTakes()).toBe(before);
    // No second session either — the mint is keyed on the acceptance.
    expect(await countSessions()).toBe(1);
  });

  it("a double-pressed Use this mints one take, never two", async () => {
    const before = await countTakes();
    const body = {
      liveOutputDataUri: CROSS_MODE_LIVE_OUTPUT_DATA_URI,
      sketchSnapshotDataUri: CROSS_MODE_SKETCH_DATA_URI,
      inputs: CROSS_MODE_SKETCH_INPUTS,
      idempotencyKey: "cross-mode-accept-double",
      destination: {
        sessionId: walkthrough.sessionId,
        promptVersionId: walkthrough.promptVersionId,
      },
    };
    const [first, second] = await Promise.all([
      harness.post("/api/sketch/accept", body),
      harness.post("/api/sketch/accept", body),
    ]);

    // Whether the second press lands mid-flight (409, already running) or
    // after the first settled (201, replayed) is a race the creator cannot
    // control — so the guarantee is stated about the RESULT, not the timing.
    for (const response of [first, second]) {
      expect([201, 409]).toContain(response.status);
    }
    const admitted = [first, second]
      .filter((response) => response.status === 201)
      .map(
        (response) =>
          (response.json.data as { generationId: string }).generationId,
      );
    expect(admitted.length).toBeGreaterThan(0);
    expect(new Set(admitted).size).toBe(1);
    expect(await countTakes()).toBe(before + 1);
    expect(await countSessions()).toBe(1);
  });

  it("a re-pressed studio return replays rather than minting a rival take", async () => {
    const before = await countTakes();
    const { status, json } = await harness.post(
      `/api/studio/projects/${walkthrough.studioProjectId}/images/${walkthrough.studioEditImageId}/use-in-session`,
      {},
    );

    expect(status).toBe(201);
    const result = json.data as {
      generationId: string;
      ancestorGenerationId: string | null;
    };
    // The key is derived from project + image, so a second press from another
    // tab is the SAME request — same take, same edge.
    expect(result.generationId).toBe(walkthrough.refinedTakeId);
    expect(result.ancestorGenerationId).toBe(walkthrough.sketchTakeId);
    expect(await countTakes()).toBe(before);
  });

  // ── Integrity ───────────────────────────────────────────────────────

  it("two takes appended at once both survive, with their relationships exact", async () => {
    const before = await countTakes();
    // Both presses are held at the last step before the append and released
    // together, so their appends genuinely race. Without that, the second
    // press simply starts after the first finished and proves nothing.
    harness.images.releaseTogether(2);
    let first: ApiResponse;
    let second: ApiResponse;
    try {
      [first, second] = await Promise.all([
        harness.post(
          `/api/studio/projects/${walkthrough.studioProjectId}/images/fresh-1/use-in-session`,
          {},
        ),
        harness.post(
          `/api/studio/projects/${walkthrough.studioProjectId}/images/fresh-2/use-in-session`,
          {},
        ),
      ]);
    } finally {
      harness.images.releaseTogether(0);
    }

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const ids = [first, second].map(
      (response) =>
        (response.json.data as { generationId: string }).generationId,
    );
    expect(new Set(ids).size).toBe(2);
    // The loser of the race re-runs against the winner's result rather than
    // writing back an array that never saw it.
    expect(await countTakes()).toBe(before + 2);

    for (const id of ids) {
      const take = await findTake(id);
      expect(take?.origin).toBe("studio");
      // Neither generation consumed the bridged picture, so neither may claim
      // a picture ancestor — exactly, not approximately.
      expect(take?.ancestorGenerationId).toBeNull();
      expect(take?.prompt).toBe(CROSS_MODE_PROMPT);
      expect(take?.productionProvenance).toMatchObject({
        state: "known",
        studio: { projectId: walkthrough.studioProjectId },
      });
    }
    harness.guard.assertNoOutboundCalls();
  });

  // ── Failures ────────────────────────────────────────────────────────

  it("a studio batch with one failed sibling keeps its successful results", async () => {
    const project = await harness.post("/api/studio/projects", {});
    const projectId = (project.json.data as { id: string }).id;
    // The fourth variant's copy is refused. Same decision, same four calls —
    // only the storage of one of them fails.
    harness.storage.failSaveFor.add(CROSS_MODE_STUDIO_VARIANT_DATA_URIS[3]);

    try {
      const events = await harness.postNdjson(
        `/api/studio/projects/${projectId}/turns`,
        { message: CROSS_MODE_STUDIO_UNRELATED_MESSAGE },
      );
      const accepted = events
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .find((event) => event.type === "accepted");
      expect(accepted, JSON.stringify(events).slice(0, 900)).toBeTruthy();

      const turnId = accepted?.turnId as string;
      let turn: StudioTurnView | undefined;
      for (let attempt = 0; attempt < 60; attempt++) {
        const { json } = await harness.get(
          `/api/studio/projects/${projectId}/turns/${turnId}`,
        );
        turn = json.data as StudioTurnView;
        if (turn.status !== "running") break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }

      const succeeded = turn?.calls.filter(
        (call) => call.status === "succeeded",
      );
      const failed = turn?.calls.filter((call) => call.status === "failed");
      // Three pictures the creator can use, and one honest failure beside
      // them — never a batch discarded because a sibling fell over.
      expect(succeeded).toHaveLength(3);
      expect(failed).toHaveLength(1);
      expect(succeeded?.every((call) => call.image?.id)).toBe(true);
    } finally {
      harness.storage.failSaveFor.clear();
    }
    harness.guard.assertNoOutboundCalls();
  });

  it("an attachment failure surfaces without re-rendering the media", async () => {
    const job = seedClipJob("cross-mode-clip-job-unattached");
    const rendersBefore = harness.videoProvider.calls.length;
    harness.sessions.failAppendFor.add(walkthrough.sessionId);
    try {
      await runClipJob(job);
    } finally {
      harness.sessions.failAppendFor.delete(walkthrough.sessionId);
    }

    const { json } = await harness.get(`/api/preview/video/jobs/${job.id}`);
    // The generation outcome is not the attachment's to change: the clip
    // completed, and "made but not saved" is a second fact beside it.
    expect(json.status).toBe("completed");
    const attachment = json.attachment as {
      state: string;
      reason?: string;
      record?: Record<string, unknown>;
    };
    expect(attachment.state).toBe("failed");
    expect(attachment.reason).toBeTruthy();
    // The record rides back out — that is what the creator's retry re-sends,
    // so the retry can never mint a second take for the same media.
    expect(attachment.record?.id).toBe(job.id);
    expect(harness.videoProvider.calls.length).toBe(rendersBefore + 1);
    expect(harness.refunds.refunds).toEqual([]);

    // The creator's retry: attachment only, never a re-render.
    const retry = await harness.post(
      `/api/preview/video/jobs/${job.id}/attach`,
      {},
    );
    expect(retry.status).toBe(200);
    expect(retry.json.attachment).toMatchObject({ state: "attached" });
    expect(harness.videoProvider.calls.length).toBe(rendersBefore + 1);

    const take = await findTake(job.id);
    expect(take?.mediaType).toBe("video");
    expect(take?.ancestorGenerationId).toBe(walkthrough.refinedTakeId);
  });

  // ── Restart and recovery ────────────────────────────────────────────

  it("a restart settles the attachment a dead worker was holding", async () => {
    // What a worker that died between the pending checkpoint and the append
    // leaves behind: a completed job whose session has not been told, with the
    // exact record it is owed.
    const jobId = "cross-mode-clip-job-interrupted";
    const record = {
      id: jobId,
      model: "wan",
      mediaType: "video" as const,
      prompt: walkthrough.cameraPrompt,
      status: "completed" as const,
      mediaUrls: [
        "https://objects.cross-mode.invalid/provider/cross-mode-clip.mp4",
      ],
      promptVersionId: walkthrough.cameraVersionId,
      ancestorGenerationId: walkthrough.refinedTakeId,
      origin: "generated" as const,
      productionProvenance: {
        state: "known" as const,
        instruction: walkthrough.cameraPrompt,
        model: "wan",
      },
      completedAt: new Date().toISOString(),
    };
    harness.jobs.seed({
      id: jobId,
      status: "completed",
      userId: CROSS_MODE_USER_ID,
      sessionId: walkthrough.sessionId,
      promptVersionId: walkthrough.cameraVersionId,
      sourceGenerationId: walkthrough.refinedTakeId,
      request: {
        prompt: walkthrough.cameraPrompt,
        options: { model: "wan" },
      },
      creditsReserved: 0,
      attempts: 1,
      maxAttempts: 3,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      attachment: {
        state: "pending",
        generationId: jobId,
        sessionId: walkthrough.sessionId,
        promptVersionId: walkthrough.cameraVersionId,
        record,
        updatedAtMs: Date.now(),
      },
    });

    const rendersBefore = harness.videoProvider.calls.length;
    const outcome = await resumePendingAttachments({
      jobStore: harness.jobs,
      sessionService:
        harness.container.resolve<SessionService>("sessionService"),
    });

    expect(outcome).toMatchObject({ scanned: 1, attached: 1, failed: 0 });
    // A resume re-sends the same take. It never reruns generation.
    expect(harness.videoProvider.calls.length).toBe(rendersBefore);
    expect(harness.refunds.refunds).toEqual([]);

    const take = await findTake(jobId);
    expect(take?.ancestorGenerationId).toBe(walkthrough.refinedTakeId);
    expect(take?.prompt).toBe(walkthrough.cameraPrompt);
    const settled = await harness.jobs.getJob(jobId);
    expect(settled?.attachment?.state).toBe("attached");
    harness.guard.assertNoOutboundCalls();
  });

  it("nothing left the process for the whole walkthrough", () => {
    expect(harness.guard.violations).toEqual([]);
  });

  async function countTakes(): Promise<number> {
    const session = await harness.sessions.get(walkthrough.sessionId);
    return (session?.prompt?.versions ?? []).reduce(
      (total, version) => total + (version.generations?.length ?? 0),
      0,
    );
  }

  async function countSessions(): Promise<number> {
    const sessions = await harness.sessions.findByUser(CROSS_MODE_USER_ID, 100);
    return sessions.length;
  }

  async function findTake(
    generationId: string,
  ): Promise<Record<string, unknown> | undefined> {
    const session = await harness.sessions.get(walkthrough.sessionId);
    for (const version of session?.prompt?.versions ?? []) {
      for (const generation of version.generations ?? []) {
        const record = generation as Record<string, unknown>;
        if (record.id === generationId) return record;
      }
    }
    return undefined;
  }

  async function patchVersions(versions: unknown[]): Promise<number> {
    const { status } = await harness.patch(
      `/api/sessions/${walkthrough.sessionId}/versions`,
      { versions },
    );
    return status;
  }

  /** A completed-generation job owed to the session, as the worker sees it. */
  function seedClipJob(jobId: string): VideoJobRecord {
    const job: VideoJobRecord = {
      id: jobId,
      status: "processing",
      userId: CROSS_MODE_USER_ID,
      sessionId: walkthrough.sessionId,
      promptVersionId: walkthrough.cameraVersionId,
      sourceGenerationId: walkthrough.refinedTakeId,
      request: {
        prompt: walkthrough.cameraPrompt,
        options: { model: "wan", aspectRatio: "16:9" },
      },
      creditsReserved: 0,
      attempts: 1,
      maxAttempts: 3,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
    };
    harness.jobs.seed(job);
    walkthrough.clipJobId = jobId;
    return job;
  }

  async function runClipJob(job: VideoJobRecord): Promise<void> {
    await processVideoJob(job, {
      jobStore: harness.jobs,
      videoGenerationService: harness.videoProvider,
      storageService: harness.container.resolve("storageService"),
      userCreditService: harness.refunds,
      sessionService:
        harness.container.resolve<SessionService>("sessionService"),
      workerId: "cross-mode-worker",
      leaseMs: 60_000,
      heartbeat: { start: () => undefined, stop: () => undefined },
    });
  }

  interface StudioTurnView {
    status: string;
    decision: { action: string };
    calls: Array<{ status: string; image?: { id: string } | undefined }>;
  }

  /**
   * Run one turn and settle it. `pinPrefix` renames the images the turn
   * produced to `<prefix>-<n>`: the studio's system prompt lists image ids, so
   * without a fixed name every later turn would build a different prompt and
   * could never hit a recorded entry. Identity, not behavior — see
   * `pinTurnImageIds`.
   */
  async function runStudioTurn(
    message: string,
    pinPrefix?: string,
  ): Promise<StudioTurnView> {
    const events = await harness.postNdjson(
      `/api/studio/projects/${walkthrough.studioProjectId}/turns`,
      { message },
    );
    const accepted = events
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((event) => event.type === "accepted");
    expect(accepted, JSON.stringify(events).slice(0, 900)).toBeTruthy();

    const turnId = accepted?.turnId as string;
    let turn = await pollStudioTurn(turnId);
    expect(turn.status, JSON.stringify(turn).slice(0, 900)).not.toBe("failed");
    if (pinPrefix) {
      harness.studioProjects.pinTurnImageIds(
        walkthrough.studioProjectId,
        turnId,
        pinPrefix,
      );
      turn = await pollStudioTurn(turnId);
    }
    return turn;
  }

  async function pollStudioTurn(turnId: string): Promise<StudioTurnView> {
    for (let attempt = 0; attempt < 60; attempt++) {
      const { json } = await harness.get(
        `/api/studio/projects/${walkthrough.studioProjectId}/turns/${turnId}`,
      );
      const turn = json.data as StudioTurnView;
      if (turn.status !== "running") return turn;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Studio turn ${turnId} never settled`);
  }
});
