# One visible text, one loop, subscription at Keep: the untangling decision

**Status:** accepted (2026-07-04)

A 2026-07-04 deep audit (64 research agents, adversarially verified) found the authoring
workspace had accreted five parallel representations of the prompt, three interlocked state
machines, two places where the text the creator sees is not the text the models receive
(the image path's silent motion strip; the video path's appended `Camera motion:`/`Subject
motion:` lines and tune-chip suffixes — triple motion stacking was proven possible), and an
I2V mode that repurposes the text box as a motion input, killing span clicks in the only
state where a frame exists. A follow-up 46-agent run (12 competitor teardowns, 6 market
sweeps, 7 verified disposition audits) produced four rival workflow proposals judged by a
three-judge panel. **The verdict was unanimous** for the minimalist design, with three
grafts from losing proposals.

**The decision.** Vidra is one page with the three residents of
[ADR-0009](0009-workspace-is-input-first.md) and one contract: **the text you can see is
the only thing that runs.** Models receive the input's prose verbatim — no hidden appends,
no invisible suffixes, no second text surface, ever. The workflow is a single explicit
state enum (replacing the five-flag derivation):

| State                     | Player                                              | Input                                                                                                           | Next-step button                                           |
| ------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| S0 Empty                  | absent                                              | placeholder + starter chips                                                                                     | Go                                                         |
| S1 Writing                | shimmer fades in                                    | one-liner streams into the full description in place; "Your words" chip restores the original                   | Writing…                                                   |
| S2 Painting               | making-your-picture state (auto — no click)         | editable; span phrases clickable **during the wait**; motion phrases render dimmed with "this drives the video" | Writing…                                                   |
| S3 Picture (the one gate) | the still                                           | editable, phrases live (camera phrases offer named moves as alternatives)                                       | Make it move / Try again; any edit flips to Remake picture |
| S4 Moving                 | picture under progress veil                         | editable; edits arm the next roll                                                                               | Moving…                                                    |
| S5 Clip                   | inline player (autoplay, loop, muted) + takes strip | editable                                                                                                        | Keep / Try again                                           |
| S6 Kept                   | the kept clip                                       | preserved                                                                                                       | Download / New clip                                        |

The picture prompt is derived deterministically (structured-slot render that omits
`camera_move`; if the text was hand-edited since expansion, the edited prose goes verbatim —
a quality tradeoff, never a hidden rewrite). Failures never dead-end and never bill.
Concurrency is snapshot-at-dispatch with run-id supersession; edits never cancel in-flight
work — a landed result always shows, and dirty text only changes the button. Takes store
their paired prose; "Use this take" restores media and text together (explicit action, per
the browsing-is-read-only rule).

**Payment: subscription, at Keep.** No credits anywhere in the product. The full loop —
writing, pictures, re-rolls, watermarked draft motion — is free (generous config-knob daily
caps contain cost). The Keep button carries the offer ("Keep in HD, no watermark — $10/mo");
for subscribers Keep produces the final HD render with auto-retry. Chosen because the
market's dominant churn driver is billed failure and its strongest converter is a watermark
on a clip the creator loves; these market figures are directional corroboration — the
placement stands on the billed-failure principle regardless. Billing enforcement ships with
the frozen payment stack (ADR-0002); v1 carries the copy only.

**Stays / goes.** Kept: starter chips, span click-to-enhance (promoted — reachable from S2
on, and the home of named camera-move suggestions), draft/render tiers, capabilities
registry, session/draft persistence, `/history` as the archive. Demoted behind a summon:
aspect + duration (with a one-time pre-picture nudge). Deleted: the model picker and its
sample stills (one hardcoded best model), tune chips + TuneDrawer + AI Enhance, the motion
side-channels (`appendMotionGuidance` params, SubjectMotionInput, camera-motion modal
pills), Characters/Styles rail panels (server @-trigger resolution stays, dormant), ShotRow
gallery, Continue Scene, GenerationPopover, ReferenceImageLibrary, model comparison.
Deferred: Model Intelligence (flag already off; candidate invisible chooser later), Roll-4
batch pictures (re-evaluate on real dogfood re-roll data, not synthetic proxies), frame
verification (delete from tree when its in-flight branch closes; archive, don't rewrite).

## Considered options

- **Market-convergent** (resident settings, follow incumbent conventions) — ranked last by
  all three judges: resident chrome against fresh ADRs, weakest differentiation.
- **Moat-first** and **pro-lite** — contributed the adopted grafts (phrases clickable while
  painting, dimmed motion phrases as a visible receipt, price copy on Keep) but lost on
  build cost and residency violations.
- **Charging at "Make it move" or the second render** — rejected as adjacent to the
  billed-failure churn driver.

Build order: (1) inline player — the loop must end; (2) state enum + prompt-truth pipeline;
(3) differentiator reachability (kill the I2V box-repurposing); (4) failure lines + global
401 → auth dialog + takes strip; (5) the deletions; (6) expansion first-try-quality
instrumentation. Full evidence corpus: 2026-07-04 session artifacts (deep map + decision
package).
