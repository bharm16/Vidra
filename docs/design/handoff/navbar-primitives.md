# The navbar — required primitives and behaviors

The navbar is the persistent top navigation bar of the app. It appears in two contexts
that share one structure: **the workspace** (over the input/player/toolbar) and **the
public shell** (over the library, account, legal, and support pages). Functional
inventory only — no layout, placement, ordering, sizing, styling, or copy decisions.

## What the navbar is

A thin, always-present horizontal bar carrying identity, location, and the two ways out
of the current screen (to past work, and to the account). It holds no workflow state and
performs no generation; it is pure navigation and identity. It is auth-aware: its account
region differs signed-in vs signed-out, and nothing else about it depends on state.

## 1. Brand / home affordance

- The wordmark, always present, in both contexts. Activating it navigates to the
  workspace root (`/`). There is no separate marketing landing to route to — the
  workspace root is the home destination (ADR-0009/site scope D9).
- It is a navigation, not an interruption: see the safe-navigation rule in §6.

## 2. Location label (workspace context only)

- Displays the current session's derived title, or an untitled placeholder. **Display
  only** — it is not an edit surface. Renaming a session is a deliberate, separately
  labeled action elsewhere, never an inline click here (standing UX rule: browsing is
  read-only, editing is explicit; today's decorative caret must not imply otherwise).
- Absent in the public-shell context (those pages carry their own page identity, not a
  session).

## 3. Library affordance

- A control that navigates to the library (past sessions / kept clips, `/history`).
  Present in the workspace context; the public shell reaches the library through its own
  page navigation.
- This affordance does not exist in today's workspace top bar — it is added by the
  rebuild (the rail that used to hold navigation is deleted in M5).

## 4. Account region (auth-aware)

- **Signed in:** an account entry that opens the account affordance **in place**
  (popover/overlay), offering at minimum: go to the account page, and sign out. It must
  not full-page-navigate away from the workspace as its primary behavior (standing UX
  rule: navigation mid-work is an interruption; the account is checked in passing, so it
  opens without leaving). The account _page_ remains reachable from within it.
- **Signed out:** a sign-in entry that opens the auth dialog (the same invoked dialog the
  empty-state submit uses), or, in the public shell, routes to the auth flow. No pending
  submission is attached when opened from the navbar.
- The account region is the workspace's **only** account affordance after the rail is
  deleted — the rebuild moves it here (today the workspace top bar has none; the rail
  owned it).

## 5. Public-shell primary action (public context only)

- The satellite/legal/support pages carry one auth-aware primary action in the navbar:
  signed-out → enter the product / sign in; signed-in → open the workspace. This is the
  single call to action for those pages; marketing nav links stay parked until they have
  real destinations (site scope).

## 6. Cross-cutting behaviors

- **Auth-awareness:** only the account region (§4) and the public action (§5) change with
  auth state; identity, location, and library do not.
- **Safe navigation:** leaving the workspace via the navbar (home, library) must not lose
  in-progress work — the session persists and is restorable (draft/session persistence
  already guarantees this). Navigation is always safe; it is never a destructive action.
- **Navigation vs. interruption:** destinations that leave the current work (home,
  library, account page) are navigations; the account _menu_ itself opens in place so a
  quick account check doesn't interrupt the work (standing UX rules).
- **Persistence across states:** the navbar is identical in every workflow state — it
  does not react to empty/writing/painting/picture/clip/kept. Only the toolbar and the
  player change per state; the navbar is constant.

## 7. Explicitly absent from the navbar

Any credit, price, or cost indicator (the current flag-gated credits readout is deleted —
ADR-0010 removes credits everywhere). Any model name or configuration. Any inline
session-rename control. Parked marketing nav links (until real destinations exist). The
side rail entirely (its navigation and account roles fold into this bar and the library
page). Any workflow action — advancing actions live only in the toolbar.

## 8. Existing system primitives these map to

`@promptstudio/system` already provides the wordmark/brand mark (inline SVG in the
current top bar), Button/link affordances, and Popover (the existing account popover). The
account popover and auth dialog already exist as assemblies. The one net-new requirement
is relocation, not invention: the account region and a library affordance must be present
in the workspace navbar because the rail that carried them is removed. No new visual
primitive is required.
