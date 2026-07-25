# Studio — session handoff (2026-07-24, end of build session 2)

**Branch:** `feat/studio`, 9 commits ahead of its base. Session 1 built M1 (economic core); session 2 built **M2 (the UI page) and verified it live in headed Chrome against real Replicate calls**. All commits green on tsc/eslint/test:unit; the one full-suite failure seen was `SuggestionsTelemetryService` duration flake (passes in isolation, unrelated).

**Read first:** [the plan](2026-07-24-the-studio-conversational-image-workspace.md) (authoritative spec) and [ADR-0019](../../adr/0019-the-studio-standalone-conversational-image-workspace.md) (as amended).

## Verified live (headed Chrome, real money, 2026-07-24 evening)

Two real turns ran end to end on `/studio` (~$0.30 total Replicate spend):

- 4 parallel `recraft-v4.1` calls per turn; images landed in GCS and rendered in the thread's 2×2 grid **and** as groups on the plane via fresh signed URLs.
- **Partial-turn semantics live**: one call hit the 60s timeout → its slot shows the error note, the other three rendered, turn finalized `partial` (refund path exercised server-side).
- Polling to terminal without reload (second turn); suggestion pills enabled only on the latest turn; auto-title propagated to top bar + panel header + project list.
- Error surfacing works: the first bootstrap failure (Firestore index, below) rendered as a visible dismissible card, not silence.

## What exists now

Server (all M1 items, plus): `GET /api/studio/models` (picker roster — no Replicate IDs, no costs), `GET /projects/:id/turns` (full thread with fresh view URLs; store `listTurns`), `getTurnWithFreshUrls`/`listTurnsWithFreshUrls` sharing one decorator.

Client (`client/src/features/studio/`): `StudioPage` (route `/studio`, NavRail entry with Sparkles icon under Live editor, top bar with centered editable title), `hooks/studioReducer` (+tests) and `useStudioProject` (bootstrap, open/create project, send, rename, pin, 1s polling), components (`StudioThread` with inline clarify/diagnose/negotiate/result cards + pill rows, `StudioComposer` with Auto-default `ModelPicker` showing latency hints only and right-anchored send, `ResultCard` 2×2-or-single, `StudioPlane` on `CanvasViewport`, `ProjectList`), `studio.css` (live-editor monochrome language + a design-system Button override block — ADR-0008 bans raw `<button>`).

## Bugs found live and fixed (with regression tests)

1. `listProjects` used `where(userId)==` + `orderBy(updatedAtMs)` → live Firestore demands a composite index (FAILED_PRECONDITION). Now equality-only + in-memory sort; test asserts no orderBy on `studio_projects`.
2. `.st-plane-cell { height: auto !important }` beat the layout's **inline** height (CSS !important outranks inline styles) → every plane cell flattened to a line. Override removed; CSS regression test locks it (pattern: live editor's drawable-page test).

## Known rough edges (not blockers, do next)

- **StrictMode double-bootstrap** (dev): the mount effect runs twice → on an empty account it can create two "Untitled" projects. Make bootstrap idempotent (e.g. reuse an existing empty Untitled project instead of always creating).
- **selectedImageId isn't persisted** — selection is client-local; PATCH doesn't accept it. Needed by M4 (edits source from selection). Add to PatchProjectSchema + service when M4 starts.
- **Suggestions are placeholders** and the second live turn generated literal "give me more options" images — correct M1 behavior (hardcoded context-free policy); M3's LLM policy is the fix, not a UI bug.
- **stylelint**: `studio.css` adds 42 hardcoded-px violations (live-editor.css already carries 25; commit protocol doesn't gate on stylelint). Tokenize both together as polish.
- Layout groups of 3 (partial batch) render as a 3-across row on the plane (computeStudioLayout's 2-col rule applies to the thread grid; plane grouping differs) — cosmetic; align if it bothers.
- Model prices still unverified for Nano Banana tiers / GPT Image 2 / Pro Vector (`costVerified: false` overestimates in the registry). Confirm before defaulting Auto beyond Recraft.
- CLAUDE.md remains uncommitted (pre-dirty + flag-table regen + a parallel fix-task touching it) — reconcile before committing it; plan's Route→Service map row for studio still to add.

## Next: Milestone 3 — the conversation LLM

Replace `StudioService.decideTurn` with the policy engine: `studio_turn` operation in `modelConfig.ts` (openai `gpt-4o-mini-2024-07-18`, JSON mode, env-overridable), system prompt covering behaviors 1–9 + roster capabilities + basePrompt maintenance + negotiation on incapable pins, `StructuredOutputEnforcer` against the decision schema, wire `validateDecisionReferences` (built + tested, currently uncalled), recorded fixtures (`REPLAY_MODE`). Then M4 (edit action end-to-end, selection persistence, rejection fork, routing fixtures) and M5 (hardening: cap env into env.ts Zod config, stale-pin notice, project delete).

## Environment notes

- Dev stack: the user's own `npm start` was already running (ports 3001/5173); tsx watch hot-reloads server changes — don't start a second one, probe `localhost:3001/health` + `/api/studio/models` (401 = mounted) first.
- Browser verification: headed Chrome via the Chrome MCP (never preview\_\* — user rule). User is signed in at localhost:5173.
- A studio turn spends real Replicate money (~$0.16/batch). The cap (default $5/day) is live.
