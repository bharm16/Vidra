# The toolbar — required primitives and behaviors

The control strip attached to the input, present in every workflow moment. Its defining
trait: **its contents are a function of the current moment** — the same strip, a
different action, at every beat. Functional inventory only — no layout, placement,
ordering, sizing, styling, or copy decisions.

## What it is

One control container bound to the input, holding at most three things: a primary action,
an optional secondary action, and the settings summon. It carries no state of its own —
everything it shows derives from the workflow moment (empty → writing → painting →
picture → moving → clip → kept, plus failure and limit conditions).

## 1. The primary action (the next step)

- Exactly one primary action at any moment — the screen's single advancing step. Its
  label and behavior are both functions of the moment; the toolbar renders what the
  moment dictates.
- **Per moment** (label is candidate wording; behavior is fixed):
  - empty → submit; enabled only when the input has content.
  - writing / painting / moving → the in-progress affordance; non-advancing, never
    offering a competing action.
  - picture, words unchanged since it was made → advance to motion.
  - picture, words edited since it was made → remake the picture (the action changes
    identity because the words no longer match the picture).
  - clip → keep; for a non-subscriber this action carries the subscription offer, for a
    subscriber it is a plain keep.
  - kept → start a new clip.
- **Disabled when:** the input is empty (at empty); a generation is in progress; the soft
  cap is reached (activation is refused before dispatch).
- **On activation:** snapshot the input text so later edits never mutate an in-flight
  request, then perform the moment's advancing behavior. Signed-out activation at the
  empty moment routes through the auth dialog first, then continues automatically.

## 2. The secondary action (optional, moment-dependent)

- Zero or one quiet secondary, present only where the moment offers a non-advancing
  choice:
  - picture → re-roll the picture from the same words.
  - picture, words edited → the advance-to-motion action lives here (available in case the
    creator accepts the mismatch deliberately).
  - clip → re-roll the motion.
  - browsing a prior take → restore that take (its media and paired words together, an
    explicit action) plus a way back.
- Never more than one advancing action total; the secondary is always the lower-weight
  choice.

## 3. The settings summon

- One trigger opens a transient surface with exactly two controls: aspect ratio and clip
  duration, each constrained to allowed values, committing immediately and persisting.
  Present across moments; changing a setting has whatever downstream effect the moment
  implies. No apply/cancel; dismissal closes. Nothing else is summonable here.

## Behaviors

- **One advancing action per moment.** Exactly one primary advancing action, at most one
  quiet secondary. The next step is always unambiguous.
- **Snapshot on dispatch.** Every action that starts generation captures the input text at
  activation; in-flight edits are ignored by that request and arm the next one.
- **Soft cap.** A generation-starting action checks the cap before dispatch; refusal
  yields the limit condition (work preserved), not a failed dispatch.
- **Failure.** A failure replaces the in-progress affordance with the moment's retry
  action — never a dead end, never a charge or blame.

## Primitives needed

A primary action, an optional secondary action, and a popover with two selectors
(settings). The one net-new piece is the moment→action mapping: a single derivation from
workflow moment to primary label+behavior, optional secondary, and disabled flags. No new
visual primitive class beyond these.
