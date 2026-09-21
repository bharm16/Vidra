# Cross-mode golden path — the deterministic proof of ADR-0022's milestone

Status: **live** — the walkthrough, its boundary adapters and the outbound
guard all ship, and `npm run test:replay` runs them on every change.

## What it proves

[ADR-0022](../adr/0022-takes-can-enter-a-session-from-an-upload-the-sketchpad-or-the-studio.md)
states one milestone: _a creator starts a session from a sketch or a reference,
arms a first frame, refines it through the studio, adjusts visible direction,
makes a clip, and returns after a refresh to the same session with every input,
output, and relationship intact._

`tests/integration/cross-mode-golden-path.integration.test.ts` walks exactly
that, offline, through the real HTTP routes and the real services:

| Step                      | Surface                                                     |
| ------------------------- | ----------------------------------------------------------- |
| the sketch                | `POST /api/fal/i2i`                                         |
| Use this                  | `POST /api/sketch/accept`                                   |
| refine in the studio      | `POST /api/studio/projects/from-session-picture`, turns     |
| Use this in the session   | `POST /api/studio/.../use-in-session`                       |
| camera direction as words | `writeCameraDirection` → `PATCH /api/sessions/:id/versions` |
| the clip                  | `processVideoJob` → `GET /api/preview/video/jobs/:jobId`    |
| the refresh               | `GET /api/sessions/:sessionId`                              |

It **composes** capabilities that each ship with their own tests (#83, #85,
#86, #87, #88, #89). It does not re-prove them; it proves the seams line up.

## Boundaries

Every place this walkthrough would leave the process, and what stands there
instead. Two mechanisms, and the difference is load-bearing:

- **Recorded** — a contract-validated cassette served by a replay seam that
  ships in the product (`REPLAY_MODE=replay`). The seam is production code; the
  fixture is data.
- **Controlled** — a deterministic implementation registered at the same DI
  token production registers its Firestore/GCS adapter at, or injected at the
  same port the live implementation satisfies.

| Boundary                               | Adapter type    | Where it stands                                                                                                                                      |
| -------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM router (`aiService`)               | **Recorded**    | `RecordReplayAiService` — the studio's `studio_turn` decisions                                                                                       |
| Image preview provider                 | **Recorded**    | `RecordReplayImagePreviewProvider` (registered for every provider token; unused by this path)                                                        |
| Studio image provider                  | **Recorded**    | `RecordReplayStudioImageRunner` — the edit and the four generate variants                                                                            |
| Sketch relay upstream (`fal.run`)      | **Recorded**    | `RecordReplaySketchRelay`, injected as the relay's `fetchFn` (**new with this walkthrough**)                                                         |
| Depth estimation (`/api/motion/depth`) | **Not reached** | The camera step writes words; the illustrative preview is a view, not a durable fact (see below). The guard is what proves no depth model was called |
| Object storage (GCS reads/writes)      | **Controlled**  | `InMemoryObjectStore` + `InMemoryImageAssetStore` + `InMemoryStorageService`                                                                         |
| Session persistence (Firestore)        | **Controlled**  | `InMemorySessionStore` at the `sessionStore` token                                                                                                   |
| Idempotency records (Firestore)        | **Controlled**  | `InMemoryIdempotencyService` at `requestIdempotencyService`                                                                                          |
| Studio project/turn store (Firestore)  | **Controlled**  | `InMemoryStudioProjectStore` at `studioProjectStore`                                                                                                 |
| Video job store (Firestore)            | **Controlled**  | `InMemoryVideoJobStore` at `videoJobStore`                                                                                                           |
| Sketch daily budget (Firestore)        | **Controlled**  | The real `SketchBudgetService` over an in-memory `SketchBudgetStore`                                                                                 |
| Video provider                         | **Controlled**  | `ControlledVideoProvider` at `processVideoJob`'s `videoGenerationService` port                                                                       |
| Credit refunds                         | **Controlled**  | `RefundWitness` — present so the clip path has its port, and so "never refunds" is asserted                                                          |
| Firebase auth                          | **Bypassed**    | The API-key auth path (`x-api-key` + `ALLOWED_API_KEYS`); no token verification, no GCP                                                              |
| GCE metadata (ADC discovery)           | **Disabled**    | `METADATA_SERVER_DETECTION=none` — nothing here needs Google credentials                                                                             |

The controlled adapters live in
`tests/integration/helpers/cross-mode/boundaryDoubles.ts`; the wiring is
`harness.ts`. They stand where a Firestore or GCS adapter stands, so every
service above them is the real one. **The moment one of them needs a rule of
its own, the seam is in the wrong place.**

### One reserved host

`assertUrlSafe` rejects loopback on purpose, and the studio's return leg really
does fetch its own bytes back before admitting them. So the object store is
exposed on `objects.cross-mode.invalid` — a public-looking host the outbound
guard **routes** into the in-process store. Reading a stored object therefore
exercises the real `fetchRemoteMedia` (its MIME allowlist, its byte ceiling,
its redirect revalidation) without a byte leaving the process.

### Why depth estimation is not exercised

ADR-0022 decision 7 opens two things: the camera choice landing in the words,
and the illustrative depth-backed preview. Only the first is a durable fact —
it becomes the take's associated words — and only the first is what the
milestone's "returns with everything intact" can be broken by. The preview is
a view, `/api/motion/depth` is not on this path, and the guard is what proves
no depth model was reached.

## The offline guarantee

Deleting provider credentials proves a client was never _constructed_. It does
not prove nothing _left_. `tests/integration/helpers/cross-mode/outboundGuard.ts`
answers the actual question: it intercepts `fetch` (undici — every LLM SDK,
Replicate, and the relay's upstream) and `node:http` / `node:https` (everything
on the classic agent), allows loopback and the one routed host, and **fails the
call** on anything else while recording the destination.

The guard has its own test —
`tests/integration/cross-mode-outbound-guard.integration.test.ts` — because a
guard that silently passes everything certifies exactly the bug it exists to
catch.

## Fixtures

`server/src/replay/fixtures/cross-mode/sketch-to-clip.json`, one cassette for
the whole walkthrough, validated against the live shared contracts at load and
at replay (`tests/unit/replay/contract-drift.test.ts` validates it on every
unit run). Canonical inputs live in `scripts/replay/goldenScenarios.ts` —
**changed there and nowhere else**, so anything replaying or re-recording them
sends byte-identical bodies.

**These entries are authored, not captured — yet.** Their _requests_ are
exactly what the code produces — a request that drifts by one character
misses loudly with its key — but their _responses_ are hand-written payloads
that satisfy the live contracts, because capturing them needs live provider
keys and spend. The pack's recorder (below) closes that gap; until the owner
runs it, saying so plainly here is cheaper than letting a future reader
infer that a green gate means a provider answered.

### Re-recording the cassette

The pack has its own recorder (issue #139), modelled on the Idea Box and
studio recorders: it boots this same harness with `REPLAY_MODE=record` — the
recorded boundaries call the live providers, the controlled ones stay — and
drives the canonical inputs from `scripts/replay/goldenScenarios.ts`, so the
captured requests are byte-identical to what the replay suite produces.
Every capture is contract-validated at capture time and carries **capture
provenance**: the effective operation, provider and model read from the
code's overridable configuration at the moment of the call (whatever
`STUDIO_TURN_PROVIDER` / `STUDIO_TURN_MODEL` resolve to — not the model a
smoke note once named), the relevant parameters, and the capture run itself.
Produced images are captured inline as data URIs, because a provider CDN URL
is not durable — so a live-recorded pack still replays with zero network.

**Stated spend.** One pass costs 1 sketch frame (fal), 4–8 `studio_turn`
calls, and 6 studio image runs; the clip leg is a controlled provider and
spends nothing. The command states its ceiling up front and enforces it as a
call budget: it aborts past its 20th captured response (change only
deliberately with `--max-live-calls`), and a run below the canonical floor —
or one where the live model fumbled a behavior the scenario pins — refuses
to flush anything.

```bash
REPLAY_MODE=record NODE_ENV=test \
OPENAI_API_KEY=… REPLICATE_API_TOKEN=… FAL_KEY=… \
npx tsx --tsconfig tsconfig.json scripts/replay/record-cross-mode.ts
```

What a re-record changes in this file's neighbourhood: the walkthrough's own
test reads the relay's answer from the committed pack (the picture the
creator accepts is the pack's, not a constant), and the one-failed-sibling
injection aims at the next save rather than a recorded URL — both so a
live-recorded pack replays against the offline proof unchanged. Entries the
run did not re-record are dropped loudly unless they carry
`origin: "synthetic"`: deliberate failure cases are kept, but they stay
labelled and are never presented as live evidence.

### Two ids are pinned

The studio's system prompt lists image ids, and a bridged project mints them
from uuids — so an unpinned run builds a different prompt every time and could
never hit a recorded entry. The walkthrough therefore renames the bridged
attachment and each turn's produced images to fixed ids
(`pinBridgedAttachmentId`, `pinTurnImageIds`). Nothing downstream reads those
ids' _values_ — the return leg compares them to the project's own
`origin.bridgedImageId` — so this changes identity, not behavior.

### Storage paths are content-addressed for the same reason

A studio turn's request key also embeds the storage paths of the project's
images, and those images are stored in parallel (`StudioService`'s
`Promise.allSettled`). A fresh random path per save would differ every run and
miss the cassette, exactly as an unpinned id would — so the harness injects
`contentAddressedObjectId` into `InMemoryStorageService`, a deterministic,
order-independent id. The walkthrough never stores the same bytes twice, so
nothing is actually deduplicated; like the pinned ids, this is identity, not
behavior.

By default that double mints fresh ids, exactly as production does — the
content-addressed id is a wiring choice for this one harness. The
storage-adapter conformance suite
(`tests/integration/storage-adapter-conformance.integration.test.ts`, issue
#138) holds every store — the production `GcsImageAssetStore`, `StorageService`
and `LocalImageAssetStore`, and these two doubles — to that production contract:
fresh-id identity, owner-scoped namespaces, reported URL expiry, serialization
round trips, write conflicts and failure semantics. Correcting
`InMemoryImageAssetStore` to it (fresh ids, a reported expiry) is what keeps the
image store from hiding the class of bug #109 first found.

## What each proof asserts, and what breaks it

Each case below was **mutation-checked**: the implementation was broken, the
assertion was confirmed red, and the implementation was restored.

| Guarantee                                                            | Mutation that must turn it red                                             |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Persistence** — the session reconstructs from server records alone | `buildCompletedTakeRecord` stops honoring the recorded `origin`            |
| **Persistence / recovery** — a restart settles an interrupted attach | `resumePendingAttachments` stops scanning                                  |
| **Identity** — a lost response retried returns the same take         | `admitPictureTake` ignores the idempotency `replay` claim                  |
| **Integrity** — concurrent appends both survive                      | `appendGenerationToVersion` reads before the transaction instead of inside |
| **Integrity** — ancestry is a recorded choice, never a guess         | `returnStudioImage` drops the `bridgedImageId` identity comparison         |
| **Failures** — a failed attachment carries the record a retry needs  | `attachJobToSession` stops echoing `record` on failure                     |
| **Offline** — the relay's upstream really is seamed                  | `api.registration.ts` stops injecting `fetchFn`                            |
| **The guard itself**                                                 | the guard stops blocking non-loopback hosts                                |

Two of these needed the test strengthened before they turned red, and both
strengthenings are now permanent:

- The ancestry case needed a turn that consumes a studio image the session has
  **never seen** ("an edit of a picture the session never saw earns no refine
  edge"). Without it, a positional guess is indistinguishable from the rule,
  because the only other consuming turn consumes the bridged picture.
- The concurrency case needed a **release barrier** (`releaseTogether`) rather
  than a delay. Two timers started a millisecond apart fire a millisecond
  apart, and the first append finishes in between — a test that proves the
  writes do not overlap.

## Bounded live-provider smoke test — implemented, and NOT a merge gate

Replay proves wiring and recovery. It cannot establish that a provider is up,
that its contract still holds, or that its output is any good: a cassette keeps
answering long after the model behind it has been retired or degraded. Those
are different questions and they need live calls.

**Scope.** One pass of the cross-mode path against live providers: one sketch
frame (fal z-image turbo i2i), one studio turn whose first action is an edit
(the `studio_turn` LLM decision — whatever model `ModelConfig.studio_turn`
routes to; the original spec text said gpt-4o-mini, which the config has since
superseded), the same turn's studio edit image (nano-banana-2), and one first
frame (Flux Schnell). No clip: video is the most expensive leg and ADR-0002
keeps generation economics frozen. The first turn being an edit is exactly
what #110 made legal, and the bridge runs the real media resolver #109 built.
The smoke is also what keeps a hand-written or synthetic response honest: an
authored answer no real provider would produce is exactly what it catches.

**What it asserts.** Only what a live call can establish and replay cannot:
each provider answered inside its timeout, and each response satisfies the same
shared contract the cassette is held to (the shared replay payload schemas,
plus a magic-byte sniff of the image itself). Never output quality — that is
the LLM-judge and golden-set evals' job — and never the ancestry, identity or
attachment rules, which the offline walkthrough already pins exactly.

**Cost ceiling — derived, not counted.** Issue #140 replaced the original
"4 calls, abort on the fifth" sketch with the rule that actually holds: a
fixed call count is not proof of a dollar ceiling. The run derives BOTH a
dollar ceiling and a request ceiling from the codebase's own bounded request
parameters and conservative cost assumptions, including permitted retries and
fallbacks (`scripts/ops/live-provider-smoke/ceiling.ts`; today it lands at
US$0.21 / 5 calls): the relay's own per-frame overestimate
(`SKETCH_FRAME_COST_MILLICENTS`), `llmCosts` × `studio_turn`'s maxTokens ×
the policy engine's real re-ask count, the studio roster's verified
`costCentsPerCall` for the edit default, and a documented conservative
per-image bound per t2i-capable provider in the configured fallback order —
summed × a safety factor, rounded up to whole cents. The runner checks every
reservation BEFORE the call and aborts on the first call that would exceed
either ceiling; a leg whose bound cannot be derived (an unverified roster
price, an unpriced fallback provider) is an unknown bound, and the whole run
becomes non-verification rather than passing on a partially-known ceiling.

**Cadence.** **Nightly**, in CI, on `main` only, beside the existing
`golden-path.yml` and span-labeling crons (`.github/workflows/
live-provider-smoke.yml`, `npm run smoke:live`) — never on a pull request and
never in `npm run verify`. A red run opens an issue; it does not block a merge,
because a provider outage is not a defect in the change being merged.

**Non-verification is not a pass.** Missing credentials or unknown cost
bounds produce an explicit non-verification result — a red job whose log and
report name exactly which secrets are absent and which call each blocks. The
owner sets the missing CI secrets (`FAL_KEY`, `OPENAI_API_KEY` — or whatever
client `studio_turn` routes to — and `REPLICATE_API_TOKEN`); until they are
set, the nightly stays red, which is exactly the state it should be in rather
than a cron that silently green-skips.

## Running it

```bash
npm run test:replay
```

That is the per-change gate: the Idea Box golden path, the cross-mode
walkthrough, and the guard's own test. All three are offline and need no
credentials.
