# The toolbar — required primitives and behaviors

The toolbar is the persistent control strip attached to the input, present in every
state of the workflow. Its defining job is that **its contents are a function of the
current state** — the same strip, different action, at every beat. Functional inventory
only: no layout, placement, sizing, ordering, styling, or copy decisions.

## What the toolbar is

A single control container bound to the input. It holds at most three things: one
primary action, an optional secondary action, and the settings summon. It never holds
configuration as furniture, and it carries no state of its own — everything it shows is
derived from the workflow state (empty → writing → painting → picture → moving → clip →
kept, plus failure and limit conditions).

## 1. The primary action slot (the next-step button)

- Exactly one primary action visible at any moment; it is the screen's single advancing
  step. Its **label and behavior are both pure functions of workflow state** — the
  toolbar reads state and renders the corresponding action; it never decides the action.
- **Per-state contract** (label is candidate wording; behavior is fixed):
  - empty → submit; enabled only when the input has non-whitespace content.
  - writing / painting / moving → the in-progress affordance; non-advancing (disabled or
    equivalent), never offering a competing action.
  - picture (gate), text unchanged since it was made → advance to motion.
  - picture (gate), text edited since it was made → remake the picture (the advancing
    action changes identity because the words no longer match the picture).
  - clip → keep; for a non-subscriber this action carries the subscription offer, for a
    subscriber it is a plain keep.
  - kept → start a new clip.
- **Disabled conditions:** empty input (at empty state); any in-progress generation;
  soft cap reached (activation is refused before dispatch — see §4).
- **On activation:** snapshot the input text so later edits never mutate an in-flight
  request; then perform the state's advancing behavior. Signed-out activation at the
  empty state routes through the auth dialog first, then continues automatically.

## 2. The secondary action slot (optional, state-dependent)

- Zero or one quiet secondary action, present only in states that offer a
  non-advancing choice:
  - picture (gate) → re-roll the picture from the same text (does not change the words).
  - picture (gate), text edited → the previous advancing action demotes here and remains
    available (the creator may deliberately proceed with the mismatch).
  - clip → re-roll the motion (free, watermarked draft).
  - browsing a prior take → restore that take (media and its paired text together;
    explicit action) and a dismiss/return affordance.
- Never more than one advancing action total; the secondary is always the lower-weight
  choice and never competes for the primary role.

## 3. The settings summon

- One trigger that opens a transient surface holding exactly two controls: aspect ratio
  and clip duration, each clamped to the capabilities registry, committing immediately
  and persisting. Present across states; changing settings mid-flow has whatever
  downstream effect the state implies (e.g., aspect change after a picture exists means
  the next picture uses the new aspect). No apply/cancel; dismissal closes.
- No other control is ever summonable here. No model control exists.

## 4. Cross-cutting behaviors

- **Single-advancing-action invariant:** in every state, exactly one primary advancing
  action, at most one quiet secondary. The toolbar must make the next step unambiguous.
- **Snapshot on dispatch:** every action that starts generation captures the input text
  at activation; in-flight edits are ignored by that request (they arm the next one).
- **Soft cap:** a generation-starting action checks the server-enforced cap before
  dispatch; refusal yields the limit condition (work preserved) rather than a failed
  dispatch.
- **Failure conditions** replace the in-progress affordance with the state's retry
  action; the toolbar never shows a dead end and never surfaces a charge or blame.
- **No in-flight cancel is required** by the model (snapshot + run supersession handles
  concurrency); a cancel affordance is optional and a design choice, not a requirement.

## 5. Explicitly absent from the toolbar (deletions from today's strip)

Tune chip and its drawer; the model picker; aspect/duration as always-visible menus
(they move behind the summon); the extend-mode chip; the storyboard/preview button; any
credit, price, or cost indicator; any reference-image or start/end-frame control; any
second advancing action. All of these exist in the current `CanvasSettingsRow` and are
removed under ADR-0010.

## 6. Existing system primitives these map to

`@promptstudio/system` already provides Button (primary/secondary treatments), Popover
and Dialog (settings surface, auth dialog), and DropdownMenu (the two settings
selectors). The state→action mapping is the one genuinely new piece: a single derivation
from workflow state to (primary label+behavior, optional secondary, disabled flags),
replacing today's `handleGenerate` branching on `hasStartFrame`. No new visual primitive
is required.
