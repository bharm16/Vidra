# Deep-module audit — full project

**Date:** 2026-08-09
**Lens:** [codebase-design](https://github.com/) — depth (leverage at the interface), seam placement, locality. Not size, not LOC, not coverage.
**Method:** 14 parallel agents over non-overlapping clusters covering `client/src`, `server/src`, `shared/`, `packages/`, `scripts/`, `tests/`, `config/`. ~230k lines of non-test TypeScript. Each agent verified caller counts by grep before flagging; `Strong` required opening every file cited. Raw per-cluster reports are in the session scratchpad.

**Vocabulary.** _Module_ = anything with an interface and an implementation. _Interface_ = everything a caller must know: signature **and** invariants, ordering, error modes, required config. _Depth_ = behaviour exercised per unit of interface learned. _Seam_ = a place you can alter behaviour without editing there. One adapter is a hypothetical seam; two is a real one.

---

## The structural finding

**Vidra does not have a depth problem. It has an adoption problem.**

The deep modules are already built, and most are well built. What the audit found, in cluster after cluster, is the same shape: a correct deep module exists, its docblock declares the consolidation complete, and adoption stopped partway. Nearly every defect below lives in the gap between "the deep module exists" and "everything goes through it."

Verified ratios:

| Deep module                       | Its own claim                                     | Actual adoption                                                      |
| --------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| `middleware/respond.ts`           | "the one place an HTTP response body is built"    | **2** route files import it; **24** hand-build `success: false`      |
| `services/ApiClient.ts` + `http/` | 401→sign-in "ONLY place"; retry; telemetry header | **14** modules use it; **9** `api/` modules bare-`fetch` around it   |
| `intake.ts` creator resolution    | documented as consolidated                        | **3** call sites vs **4** verbatim copies of the anon check          |
| `CANVAS_FIRST_LAYOUT`             | `migrationFlag: true`, default `true`             | flag-off branch still owns **55 of 76** props, 8 components, 5 hooks |
| span-labeling telemetry           | wired to `/label-spans`                           | client calls `/label-spans/stream` **exclusively**                   |
| `AIExecutionPort.execute`         | failover, circuit, telemetry                      | `.stream` — the path the product uses — has **none of the three**    |

This is the migration-residue pattern, not the god-object pattern. It matters for how you fix things: **finishing a migration is cheaper and safer than designing a new interface**, and in most cases below the correct interface already exists and is already tested.

A second, subtler consequence: because the stalled half is usually type-correct (`satisfies ApiResponse<T>` on hand-built envelopes, `as const` on flag defaults), `tsc` reports nothing. The invariants rotted precisely where the compiler could not see them.

---

## Tier 1 — live defects

Correctness, not design. Independently verified against source during synthesis unless noted.

### 1. Span labeling runs with no failover, no circuit breaker, and no telemetry — on the product's hottest route

`AIModelService.stream` (`server/src/services/ai-model/AIModelService.ts:477-562`) touches `providerCircuit`, `llmCallTelemetry`, and `plan.fallback` **zero** times. The `execute` half references them 28 times. The client's default span-labeling call is `POST /api/llm/label-spans/stream` → `labelSpansStream` → `aiService.stream("span_labeling")`.

Consequences: `LLM_PROVIDER_FAILOVER_ENABLED` is inert for the route that matters most — Gemini's circuit can never open from production traffic, and `span_labeling`'s declared `fallbackTo: "qwen"` never fires. `SpanLabelingTelemetryService` is wired only to the blocking route (`labelSpansRoute.ts:89`), so `label-spans.completed` has only ever been emitted by the synthetic harness.

_Found independently by two agents (LLM layer, optimization layer); confirmed directly._

### 2. The active loop is invisible to the Measurement Program

`x-telemetry-source` appears **0 times** in `client/src`. `server/src/middleware/telemetrySource.ts:24` therefore resolves `"unknown"` in production for label-spans, enhancement, custom-suggestions, and coherence — the exact value `shared/types/telemetry.ts:12` designates as a bug signal. Root cause is #1 plus the 9 `api/` modules that bypass `ApiClient` (the interceptor that stamps the header lives there).

Combined with #1, the Measurement Program's traffic-source discriminator currently discriminates nothing on the active loop.

### 3. `CATEGORY_PATTERNS` throws away its own key and regex-scans instead

`server/src/services/video-prompt-analysis/config/categoryMapping.ts:13` is a `Record<string, …>` **keyed by `TAXONOMY.*.id`** — the exact id the LLM already declared. Its consumer:

```ts
// PhraseRoleAnalysisService.ts:69
for (const [, config] of Object.entries(CATEGORY_PATTERNS)) {
```

The destructure discards the key and linear-scans unanchored regexes over the values. Because attribute ids are namespaced (`camera.movement`), the parent always matches first: the auditing agent executed the module and found **21 of 31 attribute roles unreachable**, three of them cross-category. `camera.movement` resolves to `"subject movement or activity"`, and that string becomes the `slotDescriptor` verbatim in the enhancement constraint prompt — so clicking a camera span asks the model for _subject_ movement.

The fix is deleting the scan in favour of the keyed lookup that is already there. This is the banned-pattern rule paying off exactly as intended.

### 4. `SignedUrlLedger` claims shared durability it does not have

`storage/services/SignedUrlLedger.ts:20` — "Backed by the cache service (Redis when configured, in-memory otherwise)." `CacheService.ts` contains **zero** references to Redis; it is `NodeCache` only. The ledger is the sole authorization proof for the media-proxy bucket rescue (`mediaProxy.routes.ts:162-179`), so on a second instance or after any restart, `isMintedGrant` returns false for URLs this server genuinely minted.

### 5. Six session mutators make ownership optional

`sessions/SessionService.ts` publishes 6 pairs differing only by whether `requireOwnedSession` runs (`:144/:218`, `:227/:249`, `:258/:300`, `:309/:319`, `:327/:363`, `:503/:508`). Verified external production callers of the unowned variants: **0, 0, 0, 0, 0, 0**. `updateOutput` and `deleteSession` are entirely unreferenced. The "only the owner writes a session" invariant is expressed by half the methods — which is to say, not by the interface. One dropped suffix on a service reachable from `/api/sessions/*` writes another user's session.

### 6. The Replicate poll-resilience fix landed in one of three twins

Commit `730168166` fixed a creator-visible failure (one-off 500 mid-poll → "Couldn't create a frame") in `ReplicateFluxSchnellProvider.ts:182-199`. The identical zero-tolerance loop still ships in `ReplicateFluxKontextFastProvider.ts:261` — which generates **3 of 4 storyboard frames** — and in `studio/providers/ReplicateStudioImageRunner.ts:109`, the whole ADR-0019 surface.

### 7. Clicking a clip destroys typed words — UX rule 1, live

`space/components/TheSpace.tsx:172` → `onSelectNode` walks to the words ancestor and calls `onComposerFill`, which replaces both input and displayed prompt. `SPACE_LINEAGE` defaults on. A creator clicking a clip to look at it loses what they were typing. The labeled restore already exists separately as "Reword" (`SpaceNodeMenu.tsx:99`), so the fix is removing the fused behaviour, not building one.

### 8. `ApiErrorResponseSchema` is missing the discriminant it documents

`shared/schemas/api.schemas.ts:17-24` declares `{error, code?, details?, requestId?}` — **no `success` field**. Both `shared/types/api.ts:72-78` and `middleware/respond.ts:10-15` state in prose that `success` is required because the client hard-parses a discriminated union. Four contract tests validate through this schema, so they pass error bodies that throw in the browser. `openapi/spec.ts:68` publishes the schema as-is while hand-writing the success arm with `required:["success","data"]` — the spec documents the opposite of the guarantee.

### 9. Adjacent-span merge is implemented twice and the two disagree

Server `AdjacentSpanMerger.ts` — gap ≤3 chars, punctuation allowed, `maxMergedWords: 8`. Client `highlightConversion.ts:91-92` — unbounded whitespace gap, **no word cap** — running on already-merged server output. The client comment at `:82` claims "This matches the server-side merge logic." One production caller.

### 10. Dead rate-limit predicates, and one that misfires

`config/middleware.config.ts:560,575` attach burst limiters to `/api/video/validate` and `/api/video/suggestions` — **neither route exists**. `isSessionHydrationRoute` (`:469`) matches `/v2/sessions` when the live path is `/api/sessions`, so session hydration burns the general API budget — the exact 429 its comment exists to prevent.

_The routes agent additionally reports, via an isolated Express probe, that `apiAuthMiddleware` runs **twice** on `/api/llm/label-spans`, `/api/studio/_`, `/api/fal/i2i`and four others — two`verifyIdToken` round trips per request. I confirmed the dead predicates directly but not the double-mount; treat that one as agent-verified pending a second look.\*

---

## Tier 2 — deepenings worth doing

Ranked by leverage per unit of effort. Every one of these has an existing correct interface to migrate _toward_.

**A. Finish the `respond` migration and brand the error type.** 2 of 26 route files. `satisfies ApiResponse<never>` is what let 24 hand-built envelopes stay type-correct while drifting; branding `ApiErrorResponse` makes the compiler the gate instead of the docblock. Fixes #8 in the same pass. **S–M.**

**B. Finish the `ApiClient` migration.** The transport port already has two implementations, structured `ApiError`, `Retry-After` handling, and 401 coalescing. The 9 bypassers get auth headers only. Adds the missing `upload(endpoint, FormData)` shape (2 real call sites), fences `firebaseAuth.ts` to `services/http/**` in `arch-forbidden-imports.sh`, and fixes #2. Mechanical, one module per commit. **L but trivially splittable.**

**C. Collapse the `CANVAS_FIRST_LAYOUT` branch.** Default-on migration flag; the flag-off branch is the only consumer of 55 props, 8 components (`CategoryLegend`, `SpanCategoryAccordion`, `PromptCanvasEditorSection`, `CoherencePanel`, `VersionsPanel`, `PromptCanvasMobileGenerations`, `PromptCanvasDiffDialog`, `PromptCanvasSuggestionsPanel`), and 5 orchestrator hooks incl. the 286-line `useLockedSpanInteractions`. Click-to-enhance currently has **two trays** on the same `SelectedSpanContext` with `debugPayload` duplicated verbatim. `PromptCanvasView` goes 76 props → ~5. Only one test holds the branch open. **L, but it is deletion, not redesign.**

**D. Give the working prompt a module.** Five write verbs each skipping different effects (`setDisplayedPromptSilently` at 12 sites writes no undo entry), four mutable refs published through `PromptHistoryState`, and UX rule 1 encoded as a comment at `useVersionManagement.ts:300`. Proposed `WorkingPrompt` interface makes `browseTo` vs `restore` a _type_ distinction — which is the durable fix for the whole class that #7 belongs to. Four test files currently assert on `undoStackRef.current.length`; they are testing past the interface. **L.**

**E. One cache port with a real two-adapter seam.** Three unrelated trees in `services/cache/`: `CacheService` (NodeCache, caller builds keys, overflow→`false`), `SpanLabelingCacheService` (Redis-if-ready + unconditional memory LRU, owns keys, miss and error both→`null`), and `ICacheService`+`NodeCacheAdapter`+`CacheKeyGenerator` — the port that already exists with **0 callers** and 524 lines of tests. `redisStore.ts` is not an adapter; it is four functions that each open `if (!isRedisReady) return null`. Fixes #4. Also collapses the `ttl = text.length > 2000 ? 300 : 3600` rule duplicated verbatim at 3 call sites while the cache never reads the value it stores. **M.**

**F. Make `shared/` the single declaration site for the two contracts that aren't.** 9 of 11 shared wire modules are already schema-first. The two that aren't are the expensive ones: `shared/capabilities.ts` (37 importers, no validator, mirrored by 7 hand-written Zod schemas + 99 lines of normalizer in `CapabilitiesApi.ts` that silently drops any server-added field), and the label-spans shape (declared **6×**, zero in `shared/`, 4 transform hops). Contrast `/api/optimize`: one schema in `shared/`, both tiers import it, zero transforms — that is the template. **M each.**

**G. One Replicate run-and-poll collaborator.** Fixes #6 permanently. Studio's `registry-shapes-input + generic-runner` split is the shape to promote. Introduce it as a concrete collaborator, **not** a new interface — the 3-adapter and 2-adapter seams above it already do the mocking. **M.**

**H. Name every gate `gate:*` and make `verify` a glob.** `tsc --noEmit` is written inline in three places with no named script; eslint has four spellings, one of which (the pre-commit hook's inline `npx eslint`) bypasses `package.json:147` entirely — editing that line changes CI only. `catalogs:check` has zero CI. `lint:css`/`lint:all` run in no workflow and no hook. Membership is currently prose copied across four files. **M.** Related and nearly free: the format gate's glob is `{js,jsx,json,css,md}`, leaving **2,074 `.ts`/`.tsx` files ungated**, and `config/lint/.prettierignore` is never read by anything (`--ignore-path` appears zero times repo-wide) — the live file is `/.prettierignore`. The CLAUDE.md note about prettier config location is true of `.prettierrc` and false of `.prettierignore`.

---

## Tier 3 — mass with no callers

Verified zero-caller, pinned open by tests. Roughly **13k lines of production code plus a comparable weight of test code**, none of it reachable.

| Cluster                                         | Prod LOC | Pinning tests   | Note                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | -------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enhancement/` validation stack                 | ~2,900   | ~2,900 lines    | Kept in the boot graph only by `index.ts:12`. Includes a 111-line regex catalog; the live path already uses taxonomy lookup. Both quality evaluators: 0 callers anywhere.                                                                                                              |
| `client/src` inventory (13 clusters, ~45 files) | ~4,767   | ~31 files       | `SuggestionsPanel/` 1,714 · `components/layout/{Box,Flex,Grid,…}` 992 · `PromptImprovementForm/` 626 · `EmptyState` 329 · `utils/sceneChange/` 309 · others                                                                                                                            |
| `llm/` NLP fast path                            | ~4,700   | 4 files         | Six `ENABLED: false` inside `as const` — literal types, no env override. `extractSpans` returns `null` unconditionally, yet is constructed and awaited on every request. The 4 tests reach it via `as unknown as { ENABLED: boolean }` — defeating the type system to reach dead code. |
| `preview/` UI half                              | ~600     | 624 lines       | All 4 components and both hooks: 0 production callers. 0 modules import the barrel; all 9 live importers deep-path to `api/`. **This is the exemplar `CLAUDE.md` points at twice** — there is no `Preview.tsx`.                                                                        |
| `TemplateService`                               | small    | —               | 0 calls to `.load`/`.render`; the `templates/` dir it reads does not exist; all members optional so the type matches `{}`. DI-wired three layers deep.                                                                                                                                 |
| `image-observation` surface                     | ~700     | 1 contract test | `observation`/`isAnalyzing`/`refreshObservation`: 0 component readers. `PromptOptimizationService` takes `imageObservationService` as a **required** 4th ctor param and never calls it; the contract test stubs `observeImage`, a method that does not exist, `as never`, and passes.  |
| `pages/MarketingPage.tsx`                       | 151      | 0               | Zero references anywhere.                                                                                                                                                                                                                                                              |

Three of these actively mislead rather than merely sit there: `PromptImprovementForm/api/index.ts:12` posts to `/api/generate-questions`, a string that exists nowhere else in the repo; `components/layout/README.md` documents a `ps-quarter/half/base` spacing vocabulary its own `Box.tsx` does not implement; `components/icons/Icon.tsx` is a second, name-keyed Icon API competing with the design-system one every feature actually uses.

Per the project's own test policy — _tests die with their code_ — the ~31 client test files and ~2,900 lines of enhancement tests are false signal in `test:unit` today.

---

## Frozen-stack containment (ADR-0002)

The freeze is holding on the import graph in one direction and failing in three specific places.

**Clean:** frozen → active imports: **0**. Every layering fence verified clean (see below).

**Leaking:**

1. **`credits/` is a hard 503 gate on active first-frame generation.** `preview/handlers/imageGenerate.ts:308` — `if (!userCreditService) return 503`. Not an optional charge: a fail-closed gate, plus a Firestore reservation before Replicate, a 3× refund retry, and a dead-letter write, all in the hot path of the product's core action. 220 of that handler's 518 lines are frozen credit machinery. The contrast proves it is chronology and not architecture: `fal-i2i.routes.ts` and all of `studio/` are credit-free, and Studio built its own 181-line `StudioSpendLedger` rather than use this.
   _Containment: a `FrameSpendPort` with `UnmeteredFrameSpend` (pre-launch default) and `CreditFrameSpend` (flagged). Two adapters, real seam._

2. **Frozen convergence burns the active fal budget on a 120-second timer.** `falWarmupEnabled` defaults **true when `NODE_ENV !== "production"`**, so every dev boot arms `setInterval(fal.subscribe, 120_000)` for the process lifetime, on the same `FAL_KEY` the live editor runs on — the silent-lockout failure mode commit `cd0d45e4` exists to surface. `DEPTH_WARMUP_ON_STARTUP` defaults true on top of that. Separately, `ENABLE_CONVERGENCE` gates only `registerContinuityServices`; `routes.config.ts:40` mounts `/api/motion` unconditionally. _Fix: flip both defaults, wrap the mount in the flag, make the `app.ts:17` import dynamic. **S**, and it stops costing money today._

3. **The frozen continuity model _is_ the active session model.** `WorkspaceSessionContext.tsx` — which wraps every workspace route — makes **9 ungated** `continuityApi.*` calls and contains zero `FEATURES` references, despite `CONTINUITY_UI` defaulting false. Line 296 returns `[buildVirtualSingleShot(session)]`: the active single-shot path fabricates a `ContinuityShot`. 29 active→frozen import sites, and frozen constants are baked into a **localStorage** schema. This one cannot be contained by flag-gating alone — the active tier has no session vocabulary of its own. **L**, and it is the reason "just delete the frozen stacks" is not currently available.

---

## Already deep — do not churn

Recorded so future sweeps leave them alone.

- **`POST /api/optimize`** — the reference client↔server seam. One Zod schema in `shared/schemas/optimization.schemas.ts`, both tiers import it, zero mirrors, zero transforms, 8 importers. Everything in Tier 2 §F is asking other routes to look like this one.
- **`shared/modelIdentity.ts`** — one table, four derived indices, absence encoded as data (`runway-gen45: generation: []`), external drift gate. Best file in `shared/`.
- **The replay seam** — identity-transparent adapters at both category-4 boundaries, funnelled through single `throughReplaySeam` gateways, zero leakage into services. This is what makes an offline merge gate possible at all.
- **`CanvasViewport` + `canvasCamera`** — 3 props hiding camera, pointer capture, cursor-anchored zoom, StrictMode-idempotent recentering. No consumer re-derives camera math; ADR-0017's promotion held.
- **`usePromptCanvasOrchestration`** — 31 ordered hook calls behind one call; `PromptCanvas.tsx` is 19 lines. The 2026-07-01 deepening landed and is real.
- **`studio/`** — deepest module on the server. Data-driven registry, four narrow injected ports, and its `ENABLE_STUDIO` null resolves at exactly one mount point so **no caller carries a null check** (contrast `imageGenerationService | null`, checked in 3 handlers).
- **`ShareService`**, **`PollingWorkerBase`** (6 subclasses), **`singleFlight`**, **`config/spanSelectors.ts`** (the module that writes the DOM publishes the read side), **`scripts/evaluation/baseline-gate.ts`**, **`env.ts:86-97`** (derives its boot schema from the flag registry so the two cannot drift), **`repositories/getPromptRepositoryForUser`**, **`MediaUrlResolver`**, **`DomainError`** (33 lines, 6 subclasses, 1 handler).

**Layering fences — all verified clean:**

| Rule                                                           | Result                                      |
| -------------------------------------------------------------- | ------------------------------------------- |
| `client/src` → `server/src`                                    | 0 hits                                      |
| `server/src` → `client/src`                                    | 0 hits                                      |
| `shared/` purity (`node:*`, fs, React, `fetch`, `process.env`) | 0 hits, prod **and** tests                  |
| `container.resolve()` outside composition roots                | 0 hits                                      |
| Provider SDKs in business services                             | 0 hits (only a factory + one `import type`) |

Two caveats on the fences. `arch-forbidden-imports.sh:63` greps `@components/ToolSidebar/types` only — `@/components/*` is the same alias (`tsconfig.json:43,49`), and that spelling has **2 live hits, one in production**. The gate reports green on a violation it was written to catch, and every other check in that file is the same single-spelling grep. Separately, `scripts/audit-regression-tests.sh:7` resolves `ROOT` one `..` too high — to `~/Desktop` — and reports 565 regression files when the repo has 207; 358 are foreign worktree copies.

---

## Recommended sequence

1. **Stop the bleeding (all S, all independent):** #10 dead predicates · frozen-fal defaults · #4 ledger · #5 session mutators · #7 clip-click · #3 `CATEGORY_PATTERNS` · `arch:check` alias pattern · `audit-regression-tests.sh` root.
2. **#1 + #2 together** — bring `stream` to parity with `execute`, then Tier 2 §B. Until this lands, no measurement of the active loop is trustworthy, which blocks the Measurement Program's remaining items.
3. **Tier 2 §A** (respond + brand `ApiErrorResponse`), which also closes #8.
4. **Tier 3 deletions**, cheapest first. These are pure subtraction and they shrink the surface everything else has to migrate across — doing them before §C and §D is worth it.
5. **§C then §D** — the two large client deepenings. §C is deletion; §D is the design work, and it is the one that turns UX rule 1 from a comment into a type.
6. **§E, §F, §G, §H** as capacity allows. §H pays for itself the first time a gate disagrees with CI.

Frozen-stack leak 3 (continuity as the session model) is deliberately not in this sequence. It is real, it is large, and it should be scoped against whether ADR-0002 is being revisited before anyone spends an L on it.
