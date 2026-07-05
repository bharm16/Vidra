# Empty state — required primitives and behaviors

The first screen: a creator types a few words and starts. Functional inventory only — no
layout, placement, sizing, styling, or copy decisions.

## 1. The input (text entry)

- A single free-text entry, multiline-capable. The only text surface on the screen.
- **States:** empty · has-text · focused. Never disabled here.
- **Behaviors:**
  - Any non-whitespace content enables submission.
  - Receives text from the starter examples (§3).
  - Content persists as a draft with no user action — signed-out and signed-in both — and
    survives reload; a signed-out draft merges into the account on later sign-in.
  - A keyboard submit shortcut is available when submission is enabled.
- **Data:** the content at the moment of submission is the immutable original ("your
  words") and is the exact text dispatched — nothing appended or stripped.

## 2. The submit action

- The one advancing action on the screen.
- **States:** disabled (empty/whitespace input) · enabled. No in-progress state here —
  activation leaves the empty state.
- **On activation, in order:** snapshot the input text → if signed out, open the auth
  dialog (§6) with the submission held pending and auto-continued on success → check the
  soft cap (refusal yields the limit moment, work preserved) → dispatch; the screen
  leaves the empty state.

## 3. Starter examples (fill affordances)

- A small set of pre-written example ideas (count and content open).
- **Behavior:** activating one writes it into the input and focuses it — fill only, never
  submit. Submission enables as a consequence of the input having text.
- **States:** default / hover / focus. Never disabled.

## 4. Settings summon + settings surface

- One trigger opens a transient surface holding exactly two controls: aspect ratio and
  clip duration, each constrained to the allowed values, committing immediately and
  persisting. Dismissal closes; no apply/cancel.
- May carry guidance that aspect is best set before the first picture. Nothing else is
  configurable here.

## 5. Chrome

- The persistent navbar (identity, library, account) — specified separately.

## 6. Auth dialog (invoked overlay)

- **Triggers:** submit while signed out (§2), or the navbar's sign-in entry.
- **Contents:** Google sign-in · email + password with submit · a switch to
  account-creation · inline error display · dismiss.
- **Contract:** the draft text stays intact (and perceivably so) behind the dialog; a
  success with a pending submission auto-continues it; a success without one just closes;
  dismiss returns to the unchanged empty state.

## 7. Non-visual requirements

- The input takes initial focus on a fresh load.
- Draft persistence is active from the first keystroke, both sign-in states.
- The settings surface offers only allowed aspect/duration values.
- Submission and example-fill both emit an instrumentation event.

## Primitives needed

A text-entry surface, a primary action, small fill affordances, a popover (settings), a
menu/dialog (auth), and inline error text. No new visual primitive class beyond these.
