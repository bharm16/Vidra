# Expansion study — pre-registered protocol

**Status:** protocol locked 2026-06-09 · facilitator dry-run done 2026-06-10 (conditional
go — see Pilot log) · friendly-participant pilot pending · study not yet run
**Operationalizes:** the open hypothesis in
[ADR-0002](../adr/0002-vidra-is-an-authoring-tool-for-non-experts.md) — whether
creators need **expansion** (blank page → generation-ready first-frame prompt) or
**refinement** (polish a draft they wrote). Terms per [`CONTEXT.md`](../../CONTEXT.md).

This document exists so the success criteria are fixed **before** any participant is
observed. If the thresholds below feel wrong after the sessions, that feeling is the
bias the pre-registration exists to contain. Changing them requires a written
amendment _before_ the next session, never after.

## The two claims under test

1. **Relative** — expansion is what makes the difference: the same idea produces a
   meaningfully better clip when Vidra expands it than when the creator's raw
   one-liner goes straight through the pipeline.
2. **Absolute** — the creator gets a clip they would actually use: preference alone
   can hide "both are useless."

## Design — within-subject, identical-except-expansion

Each participant brings **one real idea** (screened for: a clip they genuinely want
for something they actually make). The idea runs through the pipeline twice:

- **Raw arm:** their one-liner, verbatim, zero help → first frame → motion → clip.
- **Expanded arm:** same one-liner → Vidra expansion → expanded first-frame prompt
  (shown to the participant) → first frame → motion → clip.

Everything except the expansion step is identical: same image model, same video
model, same motion step, same retry policy (fixed in the script), same operator.
Raw arm runs first, while the participant talks through what they hoped for.

Rejected designs, for the record: observational (no baseline — can only confirm);
between-tools vs. the two-tab workflow (tests ergonomics, not the expansion bet).

## Participants — n = 5

Recruiting screen, three questions:

1. _Do you make or need short videos for something real?_ — must be **yes**
2. _Have you ever gotten a video you were happy with out of an AI tool?_ — must be **no**
3. _Do you regularly write prompts for AI image tools (Midjourney etc.)?_ — must be **no**

Q3 excludes the image-prompt-fluent: their fluency is the same craft expansion
automates, so they dilute the test. They are a separate stratum to study later if
expansion wins. Recruiting from personal network is acceptable — rigor lives in the
comparison structure, not the sampling. Participants must arrive with their idea.

## Session — facilitator-driven, fixed script, ~45 min

The facilitator operates Vidra (no expansion front-door UI exists, and building one
before the bet is validated is the pattern ADR-0002 forbids). Discipline rule: a
**written script of the exact calls**, identical for every participant and both
arms. The moment the facilitator improvises a prompt tweak, the study measures the
facilitator, not Vidra.

Order: (1) participant states the idea and what they hope for; (2) raw arm runs;
(3) expanded arm runs — participant is shown the expanded prompt and asked the
intent probe: **"Is this still your idea?"** (watching for expansion overriding
creator intent — the biggest known risk of expansion-first); (4) side-by-side
forced choice; (5) absolute question; (6) offer nothing — note whether they _ask_
for a second idea or for access.

A second idea runs only on participant enthusiasm — that enthusiasm is itself a
pre-registered behavioral signal.

## Measures

- **Forced choice** — both clips side-by-side, placement randomized; pick one or
  "neither." A pick counts only with a **concrete reason** ("the lighting looks
  intentional"), not "idk, nicer."
- **Absolute** — "Would you actually post/use this, today, for the real thing you
  make?" per clip.
- **Behavioral** — unprompted request to run another idea or to get access.
  Outranks both stated measures.
- **Per-stage failure tags** — when a clip disappoints, the facilitator tags which
  scripted stage lost it: expansion text / first frame / motion / render. "Great
  expanded prompt, mushy frame" and "expansion invented details the creator never
  wanted" demand opposite fixes.

## Pre-registered thresholds

| Outcome           | Criteria                                                                             | Consequence                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| **Bet confirmed** | ≥4/5 prefer the expanded clip with a concrete reason, AND ≥3/5 would actually use it | Build the expansion front door; refinement stays demoted                                               |
| **Bet dead**      | ≤2/5 prefer the expanded clip                                                        | Expansion-first is wrong — reopen the interaction-model fork in ADR-0002                               |
| **Loop alarm**    | <2/5 would use _either_ clip                                                         | The single-shot loop itself isn't delivering; diagnose per stage before touching the interaction model |
| **Murky**         | 3/5 prefer                                                                           | No verdict — fix the dominant tagged failure stage, rerun with 5 new participants                      |

## Logistics

- **Video model:** Luma `ray-2`, hardcoded, **both arms**. The absolute threshold
  ("would you post this") makes render quality load-bearing for the measurement
  even though generation is commodity in the product — the draft tier (Wan 2.2
  fast) risks a false loop alarm. If the Luma key is unavailable, fall back to Wan
  2.2 **and** reword the absolute question to "…if it rendered at final quality?"
  so instrument and threshold stay matched.
- **First frame:** Flux Schnell, both arms.
- **Spend:** worst case ≈ 20 clips + images. **Hard cap $50** — hitting it means
  the script is wrong, not the budget.
- **Pilot gate (go/no-go):** before any counted participant — facilitator dry-run
  plus one friendly (neither counts toward n). Purpose: (a) does `optimize`
  expand a one-liner acceptably? It is tuned for refinement; if pilot expansions
  are bad, fix the expansion prompt before burning participants. (b) Rehearse the
  script end-to-end. The study does not go live until the pilot passes.

## Facilitator card

Run this in every session — friendly or counted. Unstructured sessions produce
"they liked it," which measures politeness, not the bet.

1. Before anything: _"What's the clip for — where would it actually go?"_
2. After the expanded prompt appears: _"Is this still your idea?"_ (note drift)
3. Side-by-side, placement randomized: _"Pick one — or neither."_
4. Whichever they pick: _"What specifically makes it better?"_ (a concrete
   reason, or the pick doesn't count)
5. _"Would you actually post/use this, today, for that real thing?"_ (per clip)
6. Say nothing and wait: do they ask to run another idea, or ask for access?

Tag any disappointing clip with the stage that lost it: expansion text / frame /
motion / render.

### 2026-06-10 — friendly session (unstructured): rehearsal incomplete

A friendly saw the loop and reacted positively. No forced choice, absolute
question, or intent probe was run — the session was a demo, not a protocol
rehearsal, so it neither counts toward n nor completes pilot purpose (b). The
facilitator card above was added as the corrective. Positive reaction noted as
morale, not evidence.

## Pilot log

### 2026-06-10 — facilitator dry-run (expansion stage only): conditional GO

Three persona-matched one-liners ("a cozy ad for my coffee shop", "my golden
retriever catching a frisbee at the park", "hype video for leg day at my gym") run
through the real `optimize` pipeline via `scripts/test-prompt-optimizer-pipeline.ts`
(generic + `--models luma`). Cost: ~6 LLM calls; $0 of the video cap spent.

**Capability verdict — the bet's mechanism works.** All 3 Luma-targeted expansions
preserved creator intent (no intent-override observed) and injected real craft
(shot type, lens, camera move, lighting, atmosphere). The retriever expansion is
the value proposition verbatim: complete, vivid, expert-grade from an eleven-word
input.

**Defects — fix D1 before any participant:**

- **D1 (blocker) — FIXED 2026-06-10:** Luma-targeted rewrite truncated mid-sentence
  (2/3 runs). Root cause confirmed: Gemini 2.5 thinking tokens count against
  `maxOutputTokens`, and no `thinkingConfig` was sent, so dynamic thinking consumed
  the 8192 budget. Fix: `thinkingBudget: 0` on the `video_prompt_rewrite` config
  entry, plumbed opt-in through to the Gemini payload (other Gemini callers,
  including eval-gated span labeling, keep an unchanged wire shape). Regression
  test: `server/src/services/ai-model/__tests__/videoPromptRewrite.thinkingBudget.regression.test.ts`.
  Verified live: all 3 pilot rewrites now end in complete sentences.
- **D2 (watch, not a blocker):** the generic draft stage mangles the subject slot
  on subject-less one-liners ("Cozy ad my.", "Hype video leg performing squats").
  The model-targeted rewrite recovers, and participants see only the Luma prompt.
  Notable as evidence the pipeline assumes refinement-shaped input — the very
  assumption the study tests.
- **D3 (minor):** occasional grammar glitches/duplication; describes audio the
  render model won't produce.

**Remaining before go-live:** D1 fixed → full-loop dry-run (frame → motion →
render, spends from the $50 cap) → one friendly participant.

### 2026-06-10 — full-loop dry-run (both arms, real render): PASS

Driver: `scripts/research/expansion-study-driver.ts` (the protocol's fixed
script — expansion → first frame → motion → Luma render; first motion idea
always taken). Idea: "my golden retriever catching a frisbee at the park."
Both arms completed and produced stored clips. Spend: ~$1–2; cap intact.

- **Session timing:** ~2 min machine time per arm (render ≈ 95 s dominates) —
  both arms ≈ 4–5 min per idea, comfortable inside a 45-minute session.
- **Motion stage is terse by design** (template demands 2–6-word motion
  vocabulary; the frame carries the scene). The arms may receive different
  top motion ideas because the ideas derive from each arm's own frame — that
  is downstream of the treatment, not a confound.
- **D3 recurrence (minor, watch):** the expanded frame prompt again contained
  a dangling phrase ("captured on a 50mm lens at,"). Cosmetic; participants
  see this text, so worth a cleanup pass if it persists in the friendly pilot.

**Remaining before go-live:** one friendly participant (rehearse the human
protocol: intent probe, forced choice, absolute question).

### 2026-06-10 — clip analysis caught a wrong-subject blocker (D5): FIXED

Frame-level analysis of the dry-run clips (ffmpeg frame extraction) found the
raw arm produced a coherent dog-with-frisbee clip while the **expanded arm
rendered a millipede on gravel** — the creator's subject was lost entirely.

Root cause: same family as D1, at a second call site. The video→image prompt
transformer (`VideoToImagePromptTransformer`) calls the Gemini client directly
(bypassing `aiService`, so the D1 plumbing could not reach it) with
`maxTokens: 500` and no thinking budget; Gemini 2.5 thinking consumed the
budget and the transformed prompt truncated before the subject. Flux received
"medium shot, low angle (worm's-eye view), 50mm lens, … features a" — its only
concrete noun was "worm's-eye" — and drew a worm. Fixed (thinkingBudget 0 on
both transformer passes, with regression test); verified live: 3/3 complete
transforms with subject intact, and the re-rendered expanded clip shows a
dramatic low-angle mid-air catch, visibly more cinematic than the raw arm.

Lessons recorded:

- **Look at the artifacts, not just the pipeline exit codes.** Every stage
  reported success; only viewing frames caught the wrong subject.
- The facilitator script should include a **subject check on the first frame**
  before render (does the frame contain the creator's subject?) — it costs
  nothing and would have caught this live.
- Architectural note (out of study scope): the transformer's direct
  `geminiClient` dependency violates the "all LLM calls go through `aiService`"
  rule; `storyboardFramePlanner` (frozen stack) shares the same wiring and the
  same latent bug if ever thawed.

**Spend to date:** ~$2–3 of the $50 cap (3 Luma renders, 5 Flux frames).
