import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionRecord } from "@server/domain/session/types";
import type { SessionGenerationRecord } from "@shared/types/session";
import type { StudioProjectStore } from "@services/studio/storage/StudioProjectStore";
import type { StudioTurnRecord } from "@services/studio/types";
import type { StorageService } from "@services/storage/StorageService";
import type { SessionStore } from "@services/sessions/SessionStore";
import type { ImageAssetStore } from "@services/image-generation/storage";
import {
  CROSS_MODE_LIVE_OUTPUT_DATA_URI,
  CROSS_MODE_SKETCH_DATA_URI,
  CROSS_MODE_SKETCH_INPUTS,
} from "@scripts/replay/goldenScenarios";
import {
  REAL_ADAPTER_USER_ID,
  apiKeyCaller,
  authEmulatorConfigured,
  createFirebaseIdentity,
  firebaseCaller,
  firestoreEmulatorConfigured,
  sessionServiceFailingAppendOnce,
  startRealAdapterHarness,
  type Caller,
  type FirebaseIdentity,
  type RealAdapterHarness,
} from "./helpers/cross-mode/realAdapterHarness";

/**
 * Cross-mode writes against the real Firestore adapter and a production-shaped
 * storage adapter (issue #142).
 *
 * The offline walkthrough (`cross-mode-golden-path.integration.test.ts`) proves
 * the seams line up on in-memory doubles. This suite re-runs the critical
 * cross-mode WRITES with the doubles lifted from the persistence boundaries:
 * the session store, the admission receipt, the studio project store and the
 * storage adapters are the classes production registers — Firestore against
 * the emulator, GCS against the #138 conformance-passing controlled bucket —
 * and the boundary list is exactly the issue's:
 *
 *  - transaction retries (Firestore contention re-runs a mutator on fresh data)
 *  - concurrent writers: append vs rename, arming vs archive, racing
 *    acceptances, racing studio bridges
 *  - process restart during admission (#128) and during a studio turn (#126)
 *  - serialized schema round trips
 *  - expired URLs (#125)
 *  - denied access
 *  - ownership under REAL Firebase authentication, tested separately from the
 *    replay API-key bypass, with a cross-creator negative path
 *
 * Every assertion is stated so it FAILS when the guarantee it names is broken:
 * a lost concurrent write, a second take for one acceptance, a re-stored
 * medium, a rival session, a stale URL served as fresh, a foreign read
 * granted. The suite requires the emulators; without them it skips rather
 * than fakes a pass, and CI's job is where it is made to run.
 */

const runAgainstEmulator = firestoreEmulatorConfigured();

/** Small, valid PNG bytes — content the storage adapters accept as image/png. */
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** The webp byte prefix — the data URIs below are validated by sniffing. */
const ACCEPT_MODEL = "replay-i2i/not-a-real-endpoint";

interface SessionDtoJson {
  id: string;
  userId: string;
  name?: string | undefined;
  status: string;
  prompt?:
    | {
        uuid?: string | undefined;
        versions?:
          | Array<{
              versionId: string;
              generations?: Array<Record<string, unknown>> | undefined;
            }>
          | undefined;
      }
    | undefined;
}

function acceptBody(idempotencyKey: string, destination?: {
  sessionId: string;
  promptVersionId: string;
}): Record<string, unknown> {
  return {
    liveOutputDataUri: CROSS_MODE_LIVE_OUTPUT_DATA_URI,
    sketchSnapshotDataUri: CROSS_MODE_SKETCH_DATA_URI,
    inputs: CROSS_MODE_SKETCH_INPUTS,
    idempotencyKey,
    ...(destination ? { destination } : {}),
  };
}

async function rootVersionOf(
  harness: RealAdapterHarness,
  sessionId: string,
  caller?: Caller,
): Promise<string> {
  const { status, json } = await harness.get(
    `/api/sessions/${sessionId}`,
    caller,
  );
  expect(status).toBe(200);
  const dto = json.data as SessionDtoJson;
  const versionId = dto.prompt?.versions?.[0]?.versionId;
  if (!versionId) throw new Error(`session ${sessionId} has no root version`);
  return versionId;
}

/**
 * A plain session that already has its root words-version — the shape an
 * acceptance mints — created through the create route. Appends and admissions
 * need a version to file takes under.
 */
async function createSessionWithRootVersion(
  harness: RealAdapterHarness,
  name: string,
  caller?: Caller,
): Promise<{ sessionId: string; promptVersionId: string }> {
  const { status, json } = await harness.post(
    "/api/sessions",
    {
      name,
      prompt: {
        input: name,
        output: name,
        versions: [
          {
            versionId: `v-${name}-${Date.now()}`,
            label: "v1",
            prompt: name,
            signature: name,
            timestamp: new Date().toISOString(),
            generations: [],
          },
        ],
      },
    },
    caller,
  );
  expect(status).toBe(200);
  const sessionId = (json.data as SessionDtoJson).id;
  const promptVersionId = await rootVersionOf(harness, sessionId, caller);
  return { sessionId, promptVersionId };
}

function takeIdsOf(dto: SessionDtoJson): string[] {
  return (dto.prompt?.versions ?? []).flatMap(
    (version) =>
      (version.generations ?? [])
        .map((generation) =>
          typeof generation.id === "string" ? generation.id : "",
        )
        .filter((id) => id.length > 0),
  );
}

/** A record with its Dates as ISO strings, so wire-round-trip equality is comparable. */
function toPlain(value: SessionRecord | null): Record<string, unknown> | null {
  if (!value) return null;
  return {
    ...value,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}

describe.skipIf(!runAgainstEmulator)(
  "Cross-mode writes on the real Firestore adapter (integration)",
  () => {
    let harness: RealAdapterHarness;
    /** Resolved lazily, after the harness boot has put the env in place. */
    let sessionStore: SessionStore;
    let imageAssetStore: ImageAssetStore;
    let storageService: StorageService;
    let studioProjectStore: StudioProjectStore;

    beforeAll(async () => {
      harness = await startRealAdapterHarness();
      const { createOwnedPictureResolver } = await import("@services/owned-media");
      imageAssetStore = harness.container.resolve<ImageAssetStore>(
        "imageAssetStore",
      );
      storageService = harness.container.resolve<StorageService>(
        "storageService",
      );
      sessionStore = harness.container.resolve<SessionStore>("sessionStore");
      studioProjectStore = harness.container.resolve<StudioProjectStore>(
        "studioProjectStore",
      );
      // Touch the resolver import so the module graph is exercised the way the
      // app builds it (the routes registration builds the same resolver).
      expect(typeof createOwnedPictureResolver).toBe("function");
    }, 90_000);

    afterAll(async () => {
      await harness?.close();
    });

    // ── Transaction retries ─────────────────────────────────────────────

    it("retries contended transactions: five racing appends all survive", async () => {
      const { sessionId, promptVersionId } = await createSessionWithRootVersion(
        harness,
        `contention-${Date.now()}`,
      );

      const { buildCompletedTakeRecord } = await import(
        "@services/sessions/takeRecord"
      );
      const records = [1, 2, 3, 4, 5].map((n) =>
        buildCompletedTakeRecord({
          id: `contention-take-${n}`,
          model: ACCEPT_MODEL,
          mediaType: "image",
          prompt: "a racing append",
          promptVersionId,
          mediaUrls: [`https://conformance.invalid/take-${n}.webp`],
          ancestorGenerationId: null,
        }),
      );

      // Five transactions against ONE document. Firestore serialises them by
      // retrying each contender against the fresh snapshot; a lost write or an
      // unhandled contention failure fails this assertion.
      const outcomes = await Promise.allSettled(
        records.map((record) =>
          harness.sessionService.appendGenerationToVersion(
            REAL_ADAPTER_USER_ID,
            sessionId,
            promptVersionId,
            record,
          ),
        ),
      );
      const rejections = outcomes.filter(
        (outcome) => outcome.status === "rejected",
      );
      expect(
        rejections,
        `contended transactions failed: ${JSON.stringify(rejections)}`,
      ).toEqual([]);

      const stored = await sessionStore.get(sessionId);
      const generations =
        stored?.prompt?.versions?.find(
          (version) => version.versionId === promptVersionId,
        )?.generations ?? [];
      const ids = generations.map(
        (generation) =>
          (generation as Record<string, unknown>).id as string,
      );
      expect(new Set(ids)).toEqual(
        new Set(records.map((record) => record.id as string)),
      );
    });

    it("retries a mutator against the fresh snapshot: a rename and an append racing on the raw store both land", async () => {
      const session: SessionRecord = {
        id: `rt-store-race-${Date.now()}`,
        userId: REAL_ADAPTER_USER_ID,
        status: "active",
        name: "before",
        prompt: {
          input: "x",
          output: "x",
          versions: [
            {
              versionId: "v1",
              label: "v1",
              prompt: "x",
              signature: "x",
              timestamp: new Date().toISOString(),
              generations: [],
            },
          ],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        hasContinuity: false,
      };
      await sessionStore.save(session);

      // Two raw mutators, one document, no ordering: the rename must not
      // erase the appended generation and the append must not erase the name.
      const { buildCompletedTakeRecord } = await import(
        "@services/sessions/takeRecord"
      );
      const raceTake = buildCompletedTakeRecord({
        id: "raw-race-take",
        model: ACCEPT_MODEL,
        mediaType: "image",
        prompt: "x",
        promptVersionId: "v1",
        mediaUrls: ["https://conformance.invalid/raw-race.webp"],
        ancestorGenerationId: null,
      }) as SessionGenerationRecord;
      await Promise.all([
        sessionStore.mutate(session.id, (current) => ({
          ...current,
          name: "after",
        })),
        sessionStore.mutate(session.id, (current) => {
          if (!current.prompt) {
            throw new Error("arrange bug: the session has no prompt");
          }
          return {
            ...current,
            prompt: {
              ...current.prompt,
              versions: (current.prompt.versions ?? []).map((version) => ({
                ...version,
                generations: [...(version.generations ?? []), raceTake],
              })),
            },
          };
        }),
      ]);

      const stored = await sessionStore.get(session.id);
      expect(stored?.name).toBe("after");
      expect(
        (stored?.prompt?.versions?.[0]?.generations ?? []).map(
          (generation) => (generation as Record<string, unknown>).id,
        ),
      ).toContain("raw-race-take");
    });

    // ── Concurrent writers, over HTTP ───────────────────────────────────

    it("append racing with rename keeps both effects", async () => {
      const { sessionId, promptVersionId } = await createSessionWithRootVersion(
        harness,
        `append-vs-rename-${Date.now()}`,
      );

      const [admission, renamed] = await Promise.all([
        harness.post(
          "/api/sketch/accept",
          acceptBody(`append-vs-rename-accept-${Date.now()}`, {
            sessionId,
            promptVersionId,
          }),
        ),
        harness.patch(`/api/sessions/${sessionId}`, { name: "renamed" }),
      ]);

      // Neither writer may fail the other: both are active writers on one
      // document, and the transactional mutate path exists so both land.
      expect(admission.status).toBe(201);
      expect(renamed.status).toBe(200);

      const { status, json } = await harness.get(`/api/sessions/${sessionId}`);
      expect(status).toBe(200);
      const dto = json.data as SessionDtoJson;
      expect(dto.name).toBe("renamed");
      expect(takeIdsOf(dto)).toHaveLength(1);
    });

    it("first-frame arming racing with archive keeps both effects", async () => {
      // A plain session — no first frame yet — so the race is exactly
      // arm vs archive, with nothing pre-armed.
      const created = await harness.post("/api/sessions", {
        name: "arm-vs-archive",
      });
      const sessionId = (created.json.data as SessionDtoJson).id;

      const [armed, archived] = await Promise.all([
        harness.patch(`/api/sessions/${sessionId}`, {
          prompt: {
            keyframes: [
              {
                id: "armed-first-frame",
                url: "https://conformance.invalid/armed.webp",
                source: "generation",
                generationId: "armed-first-frame",
                sourcePrompt: CROSS_MODE_SKETCH_INPUTS.prompt,
              },
            ],
          },
        }),
        harness.patch(`/api/sessions/${sessionId}`, {
          status: "archived",
        }),
      ]);

      expect(armed.status).toBe(200);
      expect(archived.status).toBe(200);

      const { status, json } = await harness.get(`/api/sessions/${sessionId}`);
      expect(status).toBe(200);
      const dto = json.data as {
        id: string;
        status: string;
        prompt?: { keyframes?: Array<Record<string, unknown>> };
      };
      expect(dto.status).toBe("archived");
      const keyframes = dto.prompt?.keyframes ?? [];
      expect(keyframes).toHaveLength(1);
      expect(keyframes[0]?.generationId).toBe("armed-first-frame");
    });

    it("racing acceptances of one output mint one session and one take", async () => {
      const key = `race-accept-${Date.now()}`;
      const [first, second] = await Promise.all([
        harness.post("/api/sketch/accept", acceptBody(key)),
        harness.post("/api/sketch/accept", acceptBody(key)),
      ]);

      // 201 = this press admitted (or replayed) the take; 409 = the other
      // press still held the claim. Either way: never two takes, never two
      // sessions — the create-if-absent and the per-admission claim are
      // transactions on the REAL idempotency store now.
      for (const response of [first, second]) {
        expect([201, 409]).toContain(response.status);
      }
      const admitted = [
        ...new Set(
          [first, second]
            .filter((response) => response.status === 201)
            .map(
              (response) =>
                (response.json.data as { generationId: string }).generationId,
            ),
        ),
      ];
      expect(admitted.length).toBe(1);

      const sessionIds = new Set(
        [first, second]
          .filter((response) => response.status === 201)
          .map(
            (response) =>
              (response.json.data as { sessionId: string }).sessionId,
          ),
      );
      expect(sessionIds.size).toBe(1);

      const sessionId = [...sessionIds][0] as string;
      const { json } = await harness.get(`/api/sessions/${sessionId}`);
      expect(takeIdsOf(json.data as SessionDtoJson)).toEqual(admitted);
    });

    it("racing studio bridges of one session picture open one project", async () => {
      const accepted = await harness.post(
        "/api/sketch/accept",
        acceptBody(`bridge-source-${Date.now()}`),
      );
      expect(accepted.status).toBe(201);
      const { sessionId, generationId } = accepted.json.data as {
        sessionId: string;
        generationId: string;
      };
      const objectsBefore = harness.bucket.objectCount;

      const body = { sessionId, generationId };
      const [first, second] = await Promise.all([
        harness.post("/api/studio/projects/from-session-picture", body),
        harness.post("/api/studio/projects/from-session-picture", body),
      ]);

      // Both presses answer 201 with the SAME project: exactly one claim of
      // the deterministic id won on the real store's create-if-absent, and
      // the loser read the winner back rather than writing a rival.
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      const projectIds = new Set(
        [first, second].map(
          (response) =>
            (response.json.data as { id: string }).id,
        ),
      );
      expect(projectIds.size).toBe(1);

      const listed = await harness.get("/api/studio/projects");
      const projects = listed.json.data as Array<{ id: string }>;
      expect(projects.filter((project) => project.id === [...projectIds][0]))
        .toHaveLength(1);

      // Both presses copied the bytes before either claimed; the winner's
      // copy is the project's, the loser's is the named-for-cleanup orphan.
      // Exactly two NEW objects, both under the creator's prefix — a copy
      // that referenced the session's object, or lost bytes, fails here.
      const objectsAfter = harness.bucket.objectCount;
      expect(objectsAfter - objectsBefore).toBe(2);

      const winner = first.json.data as {
        id: string;
        origin?: {
          sourceInput?: { generationId?: string };
          bridgedImageId?: string;
        };
        attachments?: Array<{ id: string; storagePath: string }>;
        selectedImageId?: string;
      };
      expect(winner.origin?.sourceInput?.generationId).toBe(generationId);
      expect(winner.attachments ?? []).toHaveLength(1);
      expect(winner.selectedImageId).toBe(winner.origin?.bridgedImageId);
    });

    // ── Process restart during admission (#128) ─────────────────────────

    it("an admission interrupted after its checkpoint resumes as the same take, with no re-stored media", async () => {
      const { acceptLiveOutput } = await import(
        "@services/admission/acceptLiveOutput"
      );
      const { SketchAcceptRequestSchema } = await import(
        "@shared/schemas/sketch.schemas"
      );
      // The relay model the ROUTE passes — the provenance model is part of
      // the acceptance fingerprint, so the interrupted call and its replay
      // must name the same model for the receipt to recognise the retry.
      const { FAL_I2I_MODEL_ENDPOINT } = await import("@routes/fal-i2i.routes");
      const key = `restart-admission-${Date.now()}`;
      const objectsBefore = harness.bucket.objectCount;
      const accepted = SketchAcceptRequestSchema.parse(acceptBody(key));

      // The append fails once — the shape of a process death AFTER the
      // durable checkpoint (id, media handle, record) landed in the REAL
      // idempotency store and BEFORE the session append. Everything around
      // the failure is production code on the real adapters.
      const interrupted = await acceptLiveOutput(
        {
          sessionService: sessionServiceFailingAppendOnce(
            harness.sessionService,
          ),
          mediaStore: imageAssetStore,
          idempotency: harness.requestIdempotency,
        },
        {
          userId: REAL_ADAPTER_USER_ID,
          accepted,
          model: FAL_I2I_MODEL_ENDPOINT,
        },
      );
      expect(interrupted.state).toBe("accepted");
      if (interrupted.state !== "accepted") return;
      const takeId = interrupted.result.generationId;
      const sessionId = interrupted.result.sessionId;

      // The take never reached the session, but the media and the arm did.
      const midFlight = await harness.get(`/api/sessions/${sessionId}`);
      expect(takeIdsOf(midFlight.json.data as SessionDtoJson)).toEqual([]);
      const afterDeath = harness.bucket.objectCount;
      expect(afterDeath - objectsBefore).toBe(2); // snapshot + picture

      // Restart: the replay path reads its receipt from FIRESTORE (the
      // idempotency service holds no memory), re-attaches THIS take, and
      // re-stores nothing of the take's media. The one new object is the
      // sketch snapshot a re-press documents as an orphan (the claim lives
      // one layer below the snapshot store); a re-stored PICTURE would make
      // the delta two.
      const replayed = await harness.post(
        "/api/sketch/accept",
        acceptBody(key),
      );
      expect(
        replayed.status,
        `expected replay, got ${replayed.status}: ${JSON.stringify(replayed.json)}`,
      ).toBe(201);
      const replayData = replayed.json.data as {
        sessionId: string;
        generationId: string;
        imageUrl: string;
      };
      expect(replayData.generationId).toBe(takeId);
      expect(replayData.sessionId).toBe(sessionId);
      expect(harness.bucket.objectCount).toBe(afterDeath + 1);

      const repaired = await harness.get(`/api/sessions/${sessionId}`);
      expect(takeIdsOf(repaired.json.data as SessionDtoJson)).toEqual([takeId]);
      const repairedTake = (
        (
          (repaired.json.data as SessionDtoJson).prompt?.versions ?? []
        ).flatMap((version) => version.generations ?? []) as Array<{
          id?: string;
          storagePath?: string;
        }>
      ).find((entry) => entry.id === takeId);
      expect(typeof repairedTake?.storagePath).toBe("string");
      const handlePath = repairedTake?.storagePath as string;
      expect(
        (await harness.bucket.file(handlePath).exists())[0],
        "the replayed take's original media object is gone",
      ).toBe(true);

      // The replayed acceptance answers with a resolvable URL (#125): a read
      // of the same object, minted now.
      const fetched = await fetch(replayData.imageUrl);
      expect(fetched.status).toBe(200);
    });

    // ── Process restart during a studio turn (#126) ─────────────────────

    it("a process death mid-batch is recovered on restart: the sibling that checkpointed is kept, and settlement is applied exactly once", async () => {
      const { studioUsageDayKey } = await import(
        "@services/studio/storage/FirestoreStudioProjectStore"
      );
      const { STORAGE_TYPES } = await import(
        "@services/storage/config/storageConfig"
      );

      const project: { id: string; userId: string } = {
        id: `proj-restart-${Date.now()}`,
        userId: REAL_ADAPTER_USER_ID,
      };
      await studioProjectStore.createProject({
        id: project.id,
        userId: project.userId,
        title: "Restarted turn",
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });

      // What a live process checkpoints, written through the REAL store: a
      // running four-slot generate turn, reserved, with ONE call's outcome
      // durably checkpointed. The grace window (10 minutes) is backdated so
      // a restart observes it as interrupted rather than live.
      const perCallCents = 2;
      const startedAtMs = Date.now() - 20 * 60 * 1000;
      const turn: StudioTurnRecord = {
        id: `turn-restart-${Date.now()}`,
        projectId: project.id,
        userId: project.userId,
        status: "running",
        userMessage: "four lighthouse variations",
        decision: {
          action: "generate",
          basePrompt: "a lighthouse at dawn",
          variants: ["v1", "v2", "v3", "v4"],
          capability: "general",
          suggestions: ["s1", "s2", "s3"],
        },
        resolvedModel: "nano-banana-2",
        calls: [0, 1, 2, 3].map((index) => ({ index, status: "running" as const })),
        reservedCents: perCallCents * 4,
        refundedCents: 0,
        createdAtMs: startedAtMs,
        updatedAtMs: startedAtMs,
      };
      await studioProjectStore.reserveTurn({
        turn,
        day: studioUsageDayKey(new Date(turn.createdAtMs)),
        capCents: 500,
      });

      // The sibling that finished before the death: bytes stored through the
      // REAL StorageService, outcome checkpointed through the REAL store. The
      // checkpoint lands with the backdated instant — the process "died"
      // 20 minutes ago, so the turn reads as interrupted, not live.
      const saved = await storageService.uploadBuffer(
        project.userId,
        STORAGE_TYPES.PREVIEW_IMAGE,
        PNG_BYTES,
        "image/png",
        { studioProjectId: project.id, studioTurnId: turn.id },
      );
      await studioProjectStore.checkpointCall(
        project.id,
        turn.id,
        {
          index: 0,
          status: "succeeded",
          image: {
            id: "img-recovered-sibling",
            storagePath: saved.storagePath,
            sourcePrompt: "v1",
            model: "nano-banana-2",
          },
        },
        startedAtMs,
      );

      // Restart: a fresh read through the app recovers the turn from its own
      // records. The checkpointed sibling is KEPT, the unspent slots are
      // released (three of four), and the turn reaches a terminal status.
      const restarted = await harness.get(
        `/api/studio/projects/${project.id}/turns`,
      );
      expect(restarted.status).toBe(200);
      const views = restarted.json.data as Array<{
        id: string;
        status: string;
        refundedCents: number;
        updatedAtMs: number;
        calls: Array<{
          index: number;
          status: string;
          image?: { id: string; storagePath: string; viewUrl?: string };
        }>;
      }>;
      const recovered = views.find((view) => view.id === turn.id);
      expect(recovered, "the interrupted turn was not found").toBeDefined();
      expect(recovered?.status).toBe("partial");
      expect(recovered?.refundedCents).toBe(perCallCents * 3);
      const sibling = recovered?.calls.find((call) => call.index === 0);
      expect(sibling?.status).toBe("succeeded");
      expect(sibling?.image?.storagePath).toBe(saved.storagePath);
      expect(
        recovered?.calls.filter((call) => call.status === "failed"),
      ).toHaveLength(3);

      // The kept sibling's bytes are still readable through its fresh url.
      expect(typeof sibling?.image?.viewUrl).toBe("string");
      const siblingFetch = await fetch(sibling?.image?.viewUrl as string);
      expect(siblingFetch.status).toBe(200);

      // Settlement replayed twice produces ONE refund and ONE finalization.
      const updatedAtAfterRecovery = recovered?.updatedAtMs ?? 0;
      const again = await harness.get(
        `/api/studio/projects/${project.id}/turns`,
      );
      const recoveredAgain = (again.json.data as typeof views).find(
        (view) => view.id === turn.id,
      );
      expect(recoveredAgain?.refundedCents).toBe(perCallCents * 3);
      expect(recoveredAgain?.updatedAtMs).toBe(updatedAtAfterRecovery);
      const replayedSettlement = await studioProjectStore.settleTurn({
        projectId: project.id,
        turnId: turn.id,
        userId: project.userId,
        day: studioUsageDayKey(new Date(turn.createdAtMs)),
        refundCents: perCallCents * 3,
        status: "partial",
        calls: turn.calls,
        updatedAtMs: Date.now(),
      });
      expect(replayedSettlement.applied).toBe(false);
    });

    // ── Serialized schema round trips ───────────────────────────────────

    it("a maximal session record round trips through the Firestore adapter unchanged", async () => {
      const { buildCompletedTakeRecord } = await import(
        "@services/sessions/takeRecord"
      );
      const generatedTake = buildCompletedTakeRecord({
        id: "rt-generated-take",
        model: "wan",
        mediaType: "video",
        prompt: "a lighthouse at dawn",
        promptVersionId: "rt-v1",
        mediaUrls: ["https://conformance.invalid/clip.mp4"],
        ancestorGenerationId: null,
        origin: "generated",
        productionProvenance: {
          state: "known",
          instruction: "a lighthouse at dawn",
          model: "wan",
        },
      });
      const admittedTake = buildCompletedTakeRecord({
        id: "rt-admitted-take",
        model: ACCEPT_MODEL,
        mediaType: "image",
        prompt: "a lighthouse at dawn",
        promptVersionId: "rt-v1",
        mediaUrls: ["https://conformance.invalid/picture.webp"],
        mediaAssetIds: ["asset-rt"],
        thumbnailUrl: "https://conformance.invalid/picture.webp",
        storagePath: "image-previews/creator/asset-rt",
        ancestorGenerationId: null,
        origin: "sketchpad",
        productionProvenance: {
          state: "known",
          instruction: CROSS_MODE_SKETCH_INPUTS.prompt,
          model: ACCEPT_MODEL,
          sketch: {
            seed: CROSS_MODE_SKETCH_INPUTS.seed,
            strength: CROSS_MODE_SKETCH_INPUTS.strength,
            steps: CROSS_MODE_SKETCH_INPUTS.steps,
          },
        },
        sourceInputs: [
          {
            kind: "sketch",
            assetId: "asset-sketch",
            storagePath: "image-previews/creator/asset-sketch",
          },
          {
            kind: "sketch",
            assetId: "asset-rt",
            storagePath: "image-previews/creator/asset-rt",
          },
        ],
      });

      const now = new Date();
      const promptUuid = `rt-uuid-${Date.now()}`;
      const record: SessionRecord = {
        id: `rt-roundtrip-${Date.now()}`,
        userId: REAL_ADAPTER_USER_ID,
        name: "Round trip",
        description: "A maximal record",
        status: "completed",
        prompt: {
          uuid: promptUuid,
          title: "Round trip",
          input: "a lighthouse at dawn",
          output: "a lighthouse at dawn, soft pink light",
          targetModel: "wan",
          mode: "canvas",
          generationParams: { aspectRatio: "16:9", duration: 4 },
          keyframes: [
            {
              id: "kf-rt",
              url: "https://conformance.invalid/first-frame.webp",
              source: "generation",
              assetId: "asset-rt",
              storagePath: "image-previews/creator/asset-rt",
              generationId: "rt-admitted-take",
              sourcePrompt: "a lighthouse at dawn",
            },
          ],
          versions: [
            {
              versionId: "rt-v1",
              label: "v1",
              signature: "sig",
              prompt: "a lighthouse at dawn",
              timestamp: now.toISOString(),
              generations: [generatedTake, admittedTake],
            },
          ],
        },
        promptUuid,
        createdAt: now,
        updatedAt: now,
        hasContinuity: false,
      };

      await sessionStore.save(record);

      const read = await sessionStore.get(record.id);
      expect(read).toBeDefined();
      // Dates travel as epoch millis across the wire; everything else must be
      // byte-for-byte the same shape it went in as.
      expect(toPlain(read)).toEqual(toPlain(record));

      // The transactional read path serializes identically to the plain read.
      const mutated = await sessionStore.mutate(record.id, (current) => current);
      expect(toPlain(mutated)).toEqual(toPlain(read));

      // And the client-facing DTO keeps the whole schema intact.
      const dto = harness.sessionService.toDto(read as SessionRecord);
      const dtoJson = JSON.parse(JSON.stringify(dto)) as SessionDtoJson;
      expect(takeIdsOf(dtoJson)).toEqual(["rt-generated-take", "rt-admitted-take"]);
      expect(dtoJson.prompt?.versions?.[0]?.generations?.[1]?.origin).toBe(
        "sketchpad",
      );
    });

    // ── Expired URLs (#125) ─────────────────────────────────────────────

    it("reopening a session whose stored URLs expired remints every picture from its durable handle", async () => {
      const accepted = await harness.post(
        "/api/sketch/accept",
        acceptBody(`expiry-${Date.now()}`),
      );
      expect(accepted.status).toBe(201);
      const { sessionId, generationId } = accepted.json.data as {
        sessionId: string;
        generationId: string;
      };

      // Time passes: the URL frozen in the record dies. Minted with a past
      // expiry through the same signer, so it is honestly a dead URL.
      const stored = await sessionStore.get(sessionId);
      expect(stored).toBeDefined();
      const version = stored?.prompt?.versions?.[0];
      const generation = version?.generations?.[0] as Record<string, unknown>;
      expect(typeof generation?.storagePath).toBe("string");
      const storagePath = generation.storagePath as string;
      const staleUrl = (
        await harness.bucket
          .file(storagePath)
          .getSignedUrl({ action: "read", expires: new Date(Date.now() - 60_000) })
      )[0] as string;
      await sessionStore.mutate(sessionId, (current) => {
        if (!current.prompt) {
          throw new Error("arrange bug: the session has no prompt");
        }
        return {
          ...current,
          prompt: {
            ...current.prompt,
            versions: (current.prompt.versions ?? []).map((candidate) =>
              candidate.versionId === version?.versionId
                ? {
                    ...candidate,
                    generations: (candidate.generations ?? []).map((entry) =>
                      entry.id === generationId
                        ? {
                            ...entry,
                            mediaUrls: [staleUrl],
                            thumbnailUrl: staleUrl,
                            viewUrlExpiresAt: new Date(
                              Date.now() - 60_000,
                            ).toISOString(),
                          }
                        : entry,
                    ),
                  }
                : candidate,
            ),
          },
        };
      });

      // Reopening mints fresh URLs from the DURABLE HANDLE — never serves the
      // dead one, and never disturbs the take's identity.
      const { status, json } = await harness.get(`/api/sessions/${sessionId}`);
      expect(status).toBe(200);
      const dto = json.data as {
        prompt?: {
          versions?: Array<{
            generations?: Array<{
              id?: string;
              mediaUrls?: string[];
              thumbnailUrl?: string;
              storagePath?: string;
            }>;
          }>;
        };
      };
      const reminted = (dto.prompt?.versions ?? [])
        .flatMap((candidate) => candidate.generations ?? [])
        .find((entry) => entry.id === generationId);
      expect(reminted).toBeDefined();
      const mediaUrl = reminted?.mediaUrls?.[0] as string;
      expect(mediaUrl).not.toBe(staleUrl);
      expect(mediaUrl).toContain("X-Goog-Expires=");
      const ttl = Number(new URL(mediaUrl).searchParams.get("X-Goog-Expires"));
      expect(ttl).toBeGreaterThan(0);
      expect(reminted?.thumbnailUrl).not.toBe(staleUrl);
      expect(reminted?.storagePath).toBe(storagePath);
      // The fresh URL actually reads the same object.
      const fetched = await fetch(mediaUrl);
      expect(fetched.status).toBe(200);
    });

    // ── Ownership under REAL authentication, separate from the bypass ───

    describe.skipIf(!authEmulatorConfigured())(
      "Firebase-authenticated ownership (x-firebase-token, verified)",
      () => {
        let creatorA: FirebaseIdentity;
        let creatorB: FirebaseIdentity;

        beforeAll(async () => {
          const run = Date.now();
          creatorA = await createFirebaseIdentity(`real-adapter-a-${run}`);
          creatorB = await createFirebaseIdentity(`real-adapter-b-${run}`);
        }, 30_000);

        it("a session created under a verified token is owned by the Firebase uid, and its owner can work on it", async () => {
          const caller = firebaseCaller(creatorA);
          const accepted = await harness.post(
            "/api/sketch/accept",
            acceptBody(`auth-owned-${creatorA.uid}`),
            caller,
          );
          expect(accepted.status).toBe(201);
          const { sessionId } = accepted.json.data as { sessionId: string };

          const { status, json } = await harness.get(
            `/api/sessions/${sessionId}`,
            caller,
          );
          expect(status).toBe(200);
          const dto = json.data as SessionDtoJson;
          // The owner is the verified Firebase identity — NOT an api-key
          // principal. `verifyIdToken` produced this uid.
          expect(dto.userId).toBe(creatorA.uid);
          expect(dto.userId.startsWith("api-key:")).toBe(false);
          expect(takeIdsOf(dto)).toHaveLength(1);

          // The owner can still write: a rename lands.
          const renamed = await harness.patch(
            `/api/sessions/${sessionId}`,
            { name: "mine" },
            caller,
          );
          expect(renamed.status).toBe(200);
        });

        it("a second creator's verified token cannot read, mutate, or admit into the first creator's session (cross-creator negative path)", async () => {
          const callerA = firebaseCaller(creatorA);
          const callerB = firebaseCaller(creatorB);

          const owned = await harness.get("/api/sessions", callerA);
          const aSession = (owned.json.data as SessionDtoJson[]).find(
            (session) => session.userId === creatorA.uid,
          );
          expect(aSession).toBeDefined();
          const sessionId = aSession?.id as string;
          const promptVersionId = await rootVersionOf(
            harness,
            sessionId,
            callerA,
          );
          const takesBefore = takeIdsOf(aSession as SessionDtoJson);

          // Read: denied.
          const read = await harness.get(`/api/sessions/${sessionId}`, callerB);
          expect(read.status).toBe(403);
          // Mutate: denied.
          const mutate = await harness.patch(
            `/api/sessions/${sessionId}`,
            { name: "stolen" },
            callerB,
          );
          expect(mutate.status).toBe(403);
          // Delete: denied.
          const removed = await harness.delete(
            `/api/sessions/${sessionId}`,
            callerB,
          );
          expect(removed.status).toBe(403);
          // Admission into the foreign destination: refused, and nothing was
          // stored on the refusal.
          const objectsBefore = harness.bucket.objectCount;
          const admitted = await harness.post(
            "/api/sketch/accept",
            acceptBody(`cross-creator-${creatorB.uid}`, {
              sessionId,
              promptVersionId,
            }),
            callerB,
          );
          expect(admitted.status).toBe(404);
          expect(harness.bucket.objectCount).toBe(objectsBefore);

          // The session is untouched: same takes, same name.
          const after = await harness.get(`/api/sessions/${sessionId}`, callerA);
          expect(after.status).toBe(200);
          expect(takeIdsOf(after.json.data as SessionDtoJson)).toEqual(
            takesBefore,
          );
          expect((after.json.data as SessionDtoJson).name).toBe("mine");
        });

        it("an invalid Firebase token is refused, and a valid one never crosses into the replay bypass's data", async () => {
          const forged = firebaseCaller({
            uid: creatorA.uid,
            idToken: "not-a-token",
          });
          const refused = await harness.get("/api/sessions", forged);
          expect([401, 403]).toContain(refused.status);

          // The bypass principal's data is invisible to the verified creator.
          const bypassSession = await harness.post(
            "/api/sessions",
            { name: "bypass-only" },
            apiKeyCaller(),
          );
          const bypassId = (bypassSession.json.data as SessionDtoJson).id;
          const fromFirebase = await harness.get(
            `/api/sessions/${bypassId}`,
            firebaseCaller(creatorA),
          );
          expect(fromFirebase.status).toBe(403);
        });
      },
    );

    it("the replay API-key bypass authenticates as its own principal, disjoint from real authentication", async () => {
      // No credentials at all: refused.
      const anonymous = await fetch(`${harness.baseUrl}/api/sessions`);
      expect(anonymous.status).toBe(401);
      // A key that is not allow-listed: refused.
      const impostor = await harness.get("/api/sessions", {
        headers: { "x-api-key": "not-the-allowed-key" },
      });
      expect(impostor.status).toBe(403);

      // The allowed key IS the bypass: its principal is `api-key:<key>`, a
      // different identity space from a verified Firebase uid.
      const created = await harness.post(
        "/api/sessions",
        { name: "bypass principal" },
        apiKeyCaller(),
      );
      expect(created.status).toBe(200);
      const dto = created.json.data as SessionDtoJson;
      expect(dto.userId).toBe(REAL_ADAPTER_USER_ID);
      expect(dto.userId.startsWith("api-key:")).toBe(true);
    });

    it("nothing left the process for the whole suite", () => {
      harness.guard.assertNoOutboundCalls();
    });
  },
);
