# Studio — session handoff (2026-07-25, end of build session 4)

**Branch:** `feat/studio`, 23 commits ahead of its base. Session 1 built M1 (economic core), session 2 M2 (UI page), session 3 **M3 (conversation LLM) + M4 (editing/refinement)**, session 4 **M5 (hardening) — all five planned milestones are COMPLETE and live-verified in headed Chrome**. All commits green on tsc/eslint/test:unit (7,795 tests; the occasional full-suite flake is the known `SuggestionsTelemetryService` duration flake or macOS port shadowing, both pre-existing).

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

## Milestone 5 — DONE (session 4, 2026-07-25)

All M5 items landed; the studio's five planned milestones are complete.

- `2b46c167` stale pins never brick the page: wire schema reads pinnedModel as a plain string (the enum parse used to fail the WHOLE project fetch for a deprecated slug), composer shows behavior 9's one-line notice and falls back to Auto (guarded until the roster loads). Shared lucide mock gained the studio icons.
- `a7c9a11a` spend cap into boot-validated env config: STUDIO_DAILY_SPEND_CAP_CENTS in env.ts's Zod schema (malformed value fails boot), flows through ServiceConfig.studio.
- `4e953df1` project delete end to end: turns subcollection deleted in paged batches before the project doc; ProjectList rows split open/delete with a deliberate two-step confirm (arm → "Delete?", pointer-leave disarms); deleting the active project returns to the projectless lazy-create state.
- `616872f3` rejection flow never repeats an answered question (live-caught: answering "Color" re-rendered the identical diagnose card): engine rejects a verbatim-repeat consecutive diagnose with directive feedback; rule 5 spells out the at-most-two-different-questions fork; new rejection-answer-forks fixture pins the clean path (live mini recorded the keep/new-direction fork). All 11 scenarios re-recorded.
- `becc46ad` every roster price verified (signed-in model pages + API schemas) and by-property tiers PINNED via the registry's new pinnedInput field: nano-banana-2 7¢@1K, lite 4¢ flat, pro 15¢@2K (pinned to the default), gpt-image-2 13¢ with quality pinned high, pro-svg 25¢. gpt-image-2's quality param + image_input key confirmed against the live schema. Closes the M1 exit gate.

## Remaining (post-M5 polish / next session)

- ~~Per-turn Thinking section~~ **DONE post-M5** (`de1197a2`): result decisions carry LLM-written `thinking`, rendered collapsible above results (visible during generation) — reference parity; record gate enforces presence.
- ~~Realtime thinking streaming + gpt-5.6-luna~~ **DONE post-M5**: studio_turn streams via the aiService seam; ThinkingDeltaScanner (property-tested) lifts thinking chars from the raw JSON; POST /turns is NDJSON (thinking deltas → accepted{turnId,decision}; pre-stream errors stay plain JSON). Model is gpt-5.6-luna (reasoning family): temperature MUST be 1, needs max_completion_tokens (streamComplete gained execute's rename retry), 8k completion budget. Replay suite asserts delta reassembly offline. eslint now ignores .claude/worktrees/\*\* (foreign-worktree pre-commit trap fixed at the root).

- ~~Test-suite-bloat branch~~ **MERGED** (`944eeb63`, end of session 4): 7,829→6,817 tests (purge audited in that branch), commit protocol now has a 4th gate (`npm run test:replay`, offline ~4s), commit-msg hook enforces regression-test quality (mock-boundary check; `No-Seam:` escape), brand module (VidraMark) committed. Zero studio/streaming files touched by the merge (verified by diff against the pre-merge anchor). Worktree + branch deleted — single checkout again.
- ~~CLAUDE.md reconcile~~ **DONE** (`7a44c03f`): phantom DI rows removed, ENABLE_STUDIO flag row, route-map corrections committed; the merge folded in the new commit-protocol section cleanly.
- ~~stylelint~~ **DONE** (`d9c81bc9`): all 73 px violations across studio.css + live-editor.css converted to rem (visually identical); `npm run lint:css` clean repo-wide. Working tree fully clean — branding batch committed (`5900e09d`, one VidraMark everywhere; HistoryPage 8/8 green), loose docs adopted (`e0553f51`).
- Client dirty files still in `git status` (BrandLogo, auth.css, index.html, favicon deletion, ResultCard/StudioPlane tweaks…) are the parallel branding batch consuming the now-committed VidraMark — still not studio's; don't sweep them into studio commits.
- ~~Attach-your-own image (S-12)~~ **DONE** (`632f692c` + `4ccc60b`): signed-URL upload (existing storage infra; the app's FIRST browser PUT — bucket CORS gained PUT + the two x-goog signed extension headers, applied live to vidra-media-prod and mirrored in setup-gcs.sh), studio register route (ownership-prefix check, 12/project cap), attachments are first-class LLM sources (PROJECT STATE + attached-with-message note; edit/transform resolution feeds their signed URLs as image_input), paperclip + removable chips in the composer's spec slot. attached-image-edits fixture recorded (luna → edit sourcing the sketch, first try). LIVE-verified: uploaded sketch → chip → send → streamed thinking naming the attachment → flat fox mark on transparent background in thread + plane. NOTE: the signed PUT sends x-goog-if-generation-match + x-goog-content-length-range — GCS 400s without them.
- Owner feel-pass over the whole loop (question quality, suggestion taste, edit fidelity) — the fixtures gate correctness, not taste.

## Environment notes

- Dev stack: the user's own `npm start` runs on 3001/5173; tsx watch hot-reloads server changes — never start a second one. Probe `localhost:3001/health` + `/api/studio/models` (401 = mounted) first.
- Browser verification: headed Chrome via the Chrome MCP (never preview\_\* — user rule). User is signed in at localhost:5173.
- Money: a generate batch ≈ 16¢ (recraft), an edit ≈ 4¢ (nano-lite, verified), a transform 1¢, a studio_turn LLM call ≈ 0.1¢. The $5/day cap is live. Session 3 spend ≈ 60¢ total.
- The qwen Groq alias (`qwen/qwen3-32b`) 404s at server init — pre-existing env noise, unrelated to studio.
- The long-running dev server's Firestore gRPC channel can wedge after idle (seen once end of session 3: `GET /projects` hung, surfaced as a visible "Request timeout" card, self-healed on the next reload; a fresh process queried instantly). If `/studio` sits at "…", suspect the channel before suspecting code.
- Full-suite runs while recording fixtures / driving the browser can flake ~11 files from contention; a quiet re-run was fully green (7,798 passed). Judge suite health from quiet runs only.
