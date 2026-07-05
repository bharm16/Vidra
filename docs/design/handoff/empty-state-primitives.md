# Empty state — required primitives and behaviors

Functional inventory only. No layout, styling, placement, sizing, or copy decisions —
those belong to design. Everything here is a behavior contract the screen must satisfy
regardless of how it looks.

## 1. The input (text entry)

- Single free-text entry, multiline-capable. The only text surface on the screen.
- **States:** empty · has-text · focused. It is never disabled at this stage.
- **Behaviors:**
  - Any non-whitespace content enables submission.
  - Receives text from starter examples (see §3).
  - Content persists as a draft without user action: signed-out via local storage
    (survives reload; merges into the account on later sign-in), signed-in via the
    existing draft-capture path.
  - Keyboard submit shortcut available when submission is enabled (⌘/Ctrl+Enter today).
- **Data:** its content at the moment of submission is captured as the immutable
  original ("your words," ADR-0011 D1) and is the exact text dispatched — nothing is
  appended or stripped (ADR-0010).

## 2. The submit action

- Exactly one advancing action on the screen.
- **States:** disabled (input empty/whitespace) · enabled. No in-progress state here —
  activation leaves the empty state.
- **On activation, in order:**
  1. Snapshot the input text (in-flight edits later never mutate a dispatched request).
  2. If signed out → open the auth dialog (§6) with the submission held pending; on auth
     success the submission continues automatically with the same snapshot — the user
     never re-triggers. On dismiss, return unchanged.
  3. Soft-cap check (server-enforced); refusal produces the limit moment instead of a
     dispatch — work is never lost.
  4. Dispatch expansion; the page leaves the empty state (writing begins).

## 3. Starter examples (fill affordances)

- A small set of pre-written example ideas (count and content open).
- **Behavior:** activation writes the example into the input and focuses it —
  **fill-only, never submit** (editing stays explicit; standing UX rule). Submission
  becomes enabled as a consequence of the input having text, not of the chip itself.
- **States:** default/hover/focus only; never disabled.

## 4. Settings summon + settings surface

- One trigger that opens a transient surface; the surface contains exactly two controls:
  - **Aspect ratio selector** — options clamped to the capabilities registry.
  - **Clip duration selector** — same clamping.
- **Behaviors:** values commit immediately and persist (existing generation-controls
  store); changing them at this stage has no side effect beyond persistence. Dismissal
  closes the surface; no apply/cancel semantics.
- May carry the pre-first-picture aspect guidance (changing aspect later remakes the
  picture); whether and how is a design/content call.
- Nothing else is configurable. No model control exists anywhere (hardcoded default).

## 5. Chrome (persistent, minimal)

- **Wordmark / home affordance** — navigates to the workspace root.
- **Session title display** — untitled at this stage; display only.
- **Library affordance** — navigates to the library (`/history`).
- **Account entry** — signed-in: opens the existing account popover (manage account,
  sign out); signed-out: opens the auth dialog (§6) with no pending submission.
- Explicitly no side rail, no panels, no credit indicator.

## 6. Auth dialog (invoked overlay, not a resident)

- **Triggers:** submit-while-signed-out (§2), or the chrome's sign-in entry (§5).
- **Functional contents:** Google OAuth action · email + password entry with submit ·
  a switch to account-creation mode · inline error display · dismiss.
- **Contract:** the draft text remains intact (and should remain perceivable as intact)
  behind the dialog; auth success with a pending submission auto-continues it; auth
  success without one simply closes; dismiss returns to the unchanged empty state.
  Existing Firebase flows and the localStorage→account draft merge are reused; the
  standalone auth pages remain for direct links and recovery.

## 7. Non-visual requirements

- Input receives initial focus on a fresh load.
- Draft persistence active from the first keystroke (both auth states).
- Capabilities registry consulted for the settings surface's legal values.
- Instrumentation: submission event and example-fill event (Measurement Program).

## 8. Explicitly absent in this state

The player (nothing has been made). Span highlights and the "your words" chip (no
description exists yet). Takes. Any second text surface. Any resident settings, model
names, credits, prices, or panels.

## Existing system primitives these map to

`@promptstudio/system` already provides the building blocks: Button, Popover, Dialog,
input primitives, and chip/Badge forms; the contenteditable prompt editor exists in the
workspace. New invention required by this screen: none — it is composition of existing
primitives plus the auth dialog (new assembly of existing auth flows).
