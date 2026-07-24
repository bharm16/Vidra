# Studio — session handoff (2026-07-24, end of build session 1)

**Branch:** `feat/studio` (branched from `codex/architecture-deepening`). Four commits: `d2ec7835` (docs), `f219ef7a` (service core), `0ce09a15` (route/DI/flag wiring), `b6c3e284` (validation + view URLs + client foundation). All verified: `tsc` 0 errors, eslint clean, **full unit suite 7,740 passed / 0 failed**, Integration Test Gate (bootstrap + DI container) green.

**Read first:** [the plan](2026-07-24-the-studio-conversational-image-workspace.md) (authoritative spec — behaviors 1–9, decision schema, layout section, S-1–S-38 dispositions) and [ADR-0019](../../adr/0019-the-studio-standalone-conversational-image-workspace.md) (as amended: multi-model roster, editing is core, no-flux ruling reversed).

## What exists and is tested (79 studio tests)

Server (`server/src/services/studio/`):

- `StudioModelRegistry.ts` — verified Replicate roster (Recraft V4.1 tiers, Nano Banana 2/Lite/Pro, GPT Image 2 + the two utilities), cheapest-capable Auto routing, pin validation (stale → Auto), aspect-ratio validate-and-fallback, timeout budgets (hint×3, 60–180s), per-family input builders (`buildGenerateInput`/`buildEditInput`). Costs marked `costVerified: false` are deliberate overestimates — **confirm against Replicate before launch**.
- `providers/ReplicateStudioImageRunner.ts` — one generic create→poll→extract runner for the whole roster; rate-limit retry; 402/429 mapped to `StudioCallError.statusCode` (never silent — cd0d45e4 lesson).
- `storage/FirestoreStudioProjectStore.ts` — `studio_projects/{id}` + `turns` subcollection + `studio_usage/{userId_day}` counter. `reserveTurn` = **one transaction** (cap check + counter increment + turn creation; over-cap throws `StudioCapExceededError` 429 and writes nothing — tested incl. the double-submit case). `refundCents` floors at 0. `finalizeTurn` = single terminal write (no per-call write races).
- `StudioService.ts` — async turn loop: validate → reserve → persist → respond; image calls settle in background (`RunTurnResult.completion` is awaited by tests, ignored by routes). Partial semantics: ≥1 success = `partial`/`complete` with per-slot errors, 0 = `failed`; failed calls refunded. Pin > Auto resolution. `getTurnWithFreshUrls` mints signed view URLs per poll via `StorageService.getViewUrl(userId, path)` (ownership-checked). **M1 policy is hardcoded** in `decideTurn()` — always generate 4 variants; replace at M3.
- `validateDecision.ts` — referential checks beyond JSON shape: `sourceImageIds` 1–14 + must exist in project, clarify ≤2 questions. **Not yet called by StudioService** (edit path unreachable under M1 policy) — wire it into the turn loop when the LLM policy lands (M3), violations = schema-retry.
- `routes/studio.routes.ts` — `/api/studio`: projects CRUD + `POST .../turns` (202 + turnId) + `GET .../turns/:turnId` (poll). Zod bodies; `pinnedModel: null` clears a pin.
- DI: `config/services/studio.services.ts` (`studioService` null when `ENABLE_STUDIO` off / no `REPLICATE_API_TOKEN`); mounted in `api.registration.ts` behind `apiAuthMiddleware`. Flag registered in `feature-flags.ts` (Mode, default true, `requiresEnv: REPLICATE_API_TOKEN`).

Client (`client/src/features/studio/`):

- `lib/computeStudioLayout.ts` — pure plane layout: 2×2 for 4-image batches, single cell for 1-image results (first-class, no blank grids), chronological groups centered on x=0, nothing spatial stored.
- `api/schemas.ts` + `api/studioApi.ts` — Zod-validated fetch wrappers (Firebase auth headers, `{success,data}` envelope, statusCode on errors).

## Deliberate deviations from the plan's letter (all within its "class split can shift" allowance)

1. Studio providers do NOT implement `ImagePreviewProvider` (it can't express `image_input[]`) — one generic runner + registry input-shaping instead.
2. Studio types are **server-local** (`services/studio/types.ts`) per server/CLAUDE.md; move slugs/capabilities to `shared/` at M2 when the picker needs them (client currently duplicates the slug enum in `api/schemas.ts` — acceptable drift for now, reconcile via cross-layer-change skill).
3. Turn finalization is one write, not per-call progressive updates — polling shows running→terminal. Progressive per-call display is M2 polish if wanted.
4. `STUDIO_DAILY_SPEND_CAP_CENTS` is parsed in `studio.services.ts` with default 500; migrate into `env.ts` Zod config at M5.

## Remaining M1 exit items (need network/money — deliberately left for a human-present session)

- **Live smoke test**: one real generate through `recraft-v4.1` AND one edit round-trip through `nano-banana-2`, images landing in GCS. Needs `REPLICATE_API_TOKEN` + server running; costs ~$0.20.
- **Price confirmation**: `recraft-v4.1-pro-svg`, Nano Banana tiers (by resolution — also pin the v1 resolution, likely "1K"), GPT Image 2 (+ its quality param input name). Update `costCentsPerCall`/`costVerified` + aspect-ratio allowlists in the registry.

## Next session: Milestone 2 (UI page)

Build order: `StudioPage.tsx` (route `/studio`, NavRail entry under Library beside Live editor — follow `LiveEditor.tsx`'s shell integration exactly) → `useStudioProject` reducer (thread, in-flight turn + 1s polling via `getStudioTurn`, selection, pin) → components (`StudioThread`, `StudioComposer` with `ModelPicker` (Auto default, latency hints only, NO cost hints), `ClarifyCard`, `ResultCard` (2×2 or single), `SuggestionRow`, `NegotiateCard`, `StudioPlane` on `CanvasViewport` unchanged, `ProjectList`). **The plan's "Layout and control placement" section is the spec** — M2 exit criterion: every control in its reference slot, no stubs/empty popovers/one-icon toolbars. Verify in headed Chrome (never preview scripts — user memory). Then M3 (LLM `studio_turn` op in modelConfig, replace `decideTurn`, wire `validateDecisionReferences`), M4 (edit/selection/negotiation flows + routing fixtures), M5 (hardening).

## Gotchas for the next session

- **CLAUDE.md is pre-dirty** with foreign changes + my flag-table regen (`generate-flag-docs --write` ran; ENABLE_STUDIO row exists in the working tree but is **uncommitted**). A background task ("Fix stale CLAUDE.md service/route map entries") may also be editing CLAUDE.md in a separate worktree — reconcile before committing CLAUDE.md. Also: the plan says add the studio row to CLAUDE.md's Route→Service map (not done, same reason).
- The user's unrelated dirty files (client brand/nav changes etc.) are uncommitted on this branch — never sweep them into a commit.
- PostToolUse prettier hook formats each edited file (correct config, single-file scope — the "all dirty files" memory is stale for this setup).
- Deep relative imports (`../../`) fail a conformance test — use `@services/...`/`@/...` aliases.
- `bare npx vitest run` can glob foreign worktrees — always `--config config/test/vitest.unit.config.js`.
- No Claude attribution in commits (user rule).
- Studio images reuse the `"preview-image"` storage type (retention follows previews); revisit only if studio retention must diverge.
