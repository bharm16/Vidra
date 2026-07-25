# Studio — session handoff (2026-07-24, end of build session 3)

**Branch:** `feat/studio`, 17 commits ahead of its base. Session 1 built M1 (economic core), session 2 built M2 (UI page), session 3 built **M3 (conversation LLM) and M4 (editing + refinement flows), both live-verified in headed Chrome against real OpenAI + Replicate calls**. All commits green on tsc/eslint/test:unit (7,795 tests; the occasional full-suite flake is the known `SuggestionsTelemetryService` duration flake or macOS port shadowing, both pre-existing).

**Read first:** [the plan](2026-07-24-the-studio-conversational-image-workspace.md) (authoritative spec) and [ADR-0019](../../adr/0019-the-studio-standalone-conversational-image-workspace.md) (as amended).

## Session 3 commits

- `36397832` M3 policy engine — `studio_turn` op (gpt-4o-mini, JSON mode, env-overridable), `StudioPolicyEngine` (template + roster/pin context → enforceJSON → Zod decision union → `validateDecisionReferences`, corrective-feedback retry), terminal conversational turns via `saveTurn` (zero-cost, never cap-blocked), `resolvedModel` optional on both wire sides.
- `c1aa6f2b` studio-turn replay surface — shared scenario pack (`scripts/replay/studioTurnScenarios.ts`) drives both the record script and an offline replay unit test; behaviors 1/2/3/9 recorded.
- `98bcbba5` live-found fixes: **clarify is first-message-only** (structural — `allowedActions` drops it once history exists) and **auto-title always lands** (LLM title preferred, basePrompt fallback, PROJECT STATE nudge, client refetches project when a poll settles). Both with regression tests.
- `60d1560f` M4 selection persistence — PATCH `selectedImageId` (null clears; dangling id 400), client persists on click.
- `2cf9d0ec` M4 edit + transform execution — instruction + signed source URLs into edit-capable model (pin if edit-capable, else cheapest edit-capable = nano-banana-2-lite 5¢); prompt-less utilities 1¢; single-call settle with full refund on failure; behavior-7 engine guard (edit under text-only pin → negotiate, never silent reroute).
- `61326e75` M4 routing fixtures — 10 scenarios total, including the plan's exit-gate triple (selection + "bolder" → edit; "more options" → generate deriving from the selection's sourcePrompt; "different concept" → generate), rejection → diagnose, incapable pin → negotiate with "(Recommended)", remove-background → transform.
- `6346d61d` live-found fix: google-family `output_format` must be `png` — the **lite** tier rejects webp (M1's edit proof ran on non-lite and masked it).

## Verified live (headed Chrome, real money, session 3)

- **Behavior 1**: "make me a logo" → clarify card, 2 questions × 3 quick-picks, zero spend. Quick-pick answer → generate (4 distinct animal logos), never a re-clarify (after the fix; the pre-fix double-clarify was caught live).
- **Behavior 8**: title "Minimalist Fox Logo" written by the LLM, persisted server-side, and synced to top bar + panel header without reload (after the client settle-refetch fix).
- **Behavior 6 / edit**: selected the running-fox mark (ring rendered, PATCH 200) → "give this one a cream background instead of white" → **real nano-banana-2-lite edit**: same fox, cream background, single-image card in thread + size-1 group on plane, edit-aware suggestions.
- **S-30 / transform**: "remove the background from the selected one" → 1¢ recraft utility → transparent-background fox rendered.
- Error surfacing held throughout: the 422 and the policy-exhaustion error rendered as dismissible cards, never silence.

## The fixture surface (how conversation quality is gated)

`server/src/replay/fixtures/studio-turn/m3-behaviors.json` — one cassette, 10 scenarios, recorded from live gpt-4o-mini and replayed **offline in the unit suite** (`StudioPolicyEngine.replay.test.ts`, null clients, zero network). The scenario pack is shared between the record script and the test, so prompts stay byte-identical and every request key must hit.

- **Any prompt-assembly change rotates every cassette key** → the replay test fails loudly → re-record:
  ```bash
  REPLAY_MODE=record NODE_ENV=test npx tsx --tsconfig server/tsconfig.json scripts/replay/record-studio-scenarios.ts
  ```
  (~10 mini calls, pennies; the script refuses to flush if any scenario violates its behavior invariants.)
- Recording is itself the quality gate: it caught mini dropping `suggestions`, refusing to pivot to negotiate, and re-clarifying — each fixed by prompt/context strengthening before fixtures were flushed.

## Prompt-quality lessons (mini-specific, encoded in template + engine)

1. Mini drops optional-looking fields — the template now says "REQUIRED fields: … suggestions (exactly 3, in this same object)".
2. Mini ignores rule-by-reference under conflict — negative constraints must be stated where the model looks ("NOT available this turn: …", the pinned-model "CANNOT edit" block), not just via numbered-rule pointers.
3. State beats turn-position reasoning — "set title when PROJECT STATE shows Untitled" works; "on the FIRST generate" does not.
4. Corrective retry feedback works when **directive** ("respond with a generate decision, filling unanswered details with sensible defaults"), not merely descriptive.

## Next: Milestone 5 — hardening (+ leftovers)

- ~~StrictMode double-bootstrap~~ **DONE end of session 3** (`3f71043c`): bootstrap makes no writes; the project is created lazily on the first send (regression-tested incl. StrictMode-style double mount). An empty account now bootstraps projectless — the page's empty state + composer handle it.
- **Spend-cap env into `env.ts` Zod config** (currently a defensively-parsed read in `studio.services.ts`).
- **Stale-pin composer notice** (behavior 9's one-liner; server already reverts to Auto).
- **Project delete** (route exists in plan, not built) + project rename is live, list reorders on updatedAtMs.
- **Rejection fork live-check**: diagnose is fixture-gated; the post-diagnose fork (keep concept vs new direction) deserves one live conversation.
- Model prices still unverified for Nano Banana tiers / GPT Image 2 / Pro Vector (`costVerified: false` overestimates). Confirm before defaulting Auto beyond Recraft/Nano-lite.
- gpt-image-2 input keys still unconfirmed (`buildEditInput` guesses `image_input`) — confirm on Replicate before anyone pins it for edits.
- **stylelint**: `studio.css` carries 42 hardcoded-px violations (live-editor.css 25) — tokenize together as polish; commit protocol doesn't gate on stylelint.
- CLAUDE.md remains uncommitted (pre-dirty; flag-table regen + parallel fix-task) — reconcile before committing; plan's Route→Service map row for studio still to add.
- Client `components/` dirty files in `git status` predate this session (parallel branding work: BrandLogo, vidra-mark, auth.css…) — not studio's; don't sweep them into studio commits.

## Environment notes

- Dev stack: the user's own `npm start` runs on 3001/5173; tsx watch hot-reloads server changes — never start a second one. Probe `localhost:3001/health` + `/api/studio/models` (401 = mounted) first.
- Browser verification: headed Chrome via the Chrome MCP (never preview\_\* — user rule). User is signed in at localhost:5173.
- Money: a generate batch ≈ 16¢ (recraft), an edit ≈ 5¢ (nano-lite), a transform 1¢, a studio_turn LLM call ≈ 0.1¢. The $5/day cap is live. Session 3 spend ≈ 60¢ total.
- The qwen Groq alias (`qwen/qwen3-32b`) 404s at server init — pre-existing env noise, unrelated to studio.
- The long-running dev server's Firestore gRPC channel can wedge after idle (seen once end of session 3: `GET /projects` hung, surfaced as a visible "Request timeout" card, self-healed on the next reload; a fresh process queried instantly). If `/studio` sits at "…", suspect the channel before suspecting code.
- Full-suite runs while recording fixtures / driving the browser can flake ~11 files from contention; a quiet re-run was fully green (7,798 passed). Judge suite health from quiet runs only.
