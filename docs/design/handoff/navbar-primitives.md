# The navbar — required primitives and behaviors

The persistent top bar of the app. It appears over the workspace and over the
supporting pages (library, account, legal, support), sharing one structure. Functional
inventory only — no layout, placement, ordering, sizing, styling, or copy decisions.

## What it is

A thin, always-present bar carrying identity, current location, and the two ways out of
the screen: to past work, and to the account. It holds no workflow state and runs no
generation — pure navigation and identity. It is constant across every workflow moment;
only its account region and, on supporting pages, its call to action change with sign-in
state.

## Required elements

**Brand / home.** The wordmark, always present. Activating it goes to the workspace root,
which is home.

**Location label** (workspace only). The current session's title, or an untitled
placeholder. Display only — not an edit surface; renaming a session is a separate,
deliberately labeled action, never an inline click here.

**Library.** A control that goes to past work — prior sessions and kept clips.

**Account region** (sign-in aware).

- Signed in: opens the account affordance in place (a menu/overlay, not a full-page jump)
  with at least: open the account page, and sign out.
- Signed out: opens the auth dialog — the same invoked dialog the workspace uses at
  submit, with no pending action attached.

**Call to action** (supporting pages only). One sign-in-aware action: signed out → enter
the product / sign in; signed in → open the workspace.

## Behaviors

- **Constant across workflow moments.** The navbar is identical whether the workspace is
  empty, writing, painting, at the picture, moving, or kept. It never reacts to the beat.
- **Sign-in awareness is scoped.** Only the account region and the supporting-page CTA
  change with sign-in state. Identity, location, and library do not.
- **Leaving is always safe.** Going home or to the library never loses in-progress work;
  the session persists and is restorable. No navbar action is destructive.
- **A quick account check doesn't interrupt.** The account menu opens in place; the
  account page is reachable from inside it but is not the default action.

## Primitives needed

A brand mark, link/button affordances for home and library, a menu or popover for the
account region, and the auth dialog (shared with the workspace's submit flow). Nothing
here demands a new visual primitive class beyond these.
