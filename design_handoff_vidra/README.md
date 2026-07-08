# Handoff: Vidra — text‑to‑video web app

## Overview

Vidra is a dark, cinematic web app for turning a typed idea into a short video clip. The core loop is **Type → Picture → Motion → Keep**: you describe an idea, it becomes a still picture, you set the picture in motion as a short clip, then you keep the ones you like. Work lives in a single spatial "space" (a lightweight node graph), with one docked input that always holds the live node's words.

This package documents the full app: the empty state, the workspace and all its states, library, auth, account, plus the signed‑out public clip page and the docs page.

## About the design files

The files in this bundle are **design references created in HTML** — prototypes that show the intended look and behavior. They are **not production code to copy directly.** They're authored in a small in‑house component format (`*.dc.html`, backed by `support.js`) purely so they render and stream in our design tool.

**Your task:** recreate these designs in the target codebase's existing environment (React, Vue, Svelte, SwiftUI, etc.) using its established components, styling system, and conventions. If there is no existing codebase yet, pick the most appropriate stack (a React + CSS‑in‑JS or Tailwind SPA maps cleanly to what's here) and implement there. Treat the HTML/inline styles as a precise visual + behavioral spec, not as source to port line‑by‑line.

To preview: open **`All Frames.dc.html`** in a browser — it's an index that renders every screen and state at once. Individual screens open on their own too.

## Fidelity

**High‑fidelity.** Final colors, typography, spacing, motion, and interaction behavior are all specified. Recreate the UI pixel‑accurately using the codebase's libraries. Every screen is designed at a **1440×900** artboard; layouts are fixed‑position within that frame — when implementing, translate the absolute node positions into a responsive canvas/flow as appropriate for the target, but keep the docked‑input, rail, and card proportions.

Images and video are represented by **drop‑in placeholders** (`<image-slot>`). In production these are the actual generated stills and looping muted clips.

---

## Design tokens

### Color

**Surfaces / neutrals (cool near‑black):**

- App background: `#0a0b0e` · Canvas/gallery body: `#070809` · Left rail: `#0c0d11`
- Raised card fill: `rgba(255,255,255,0.035)` → `rgba(255,255,255,0.06)`
- Docked input (glass): `rgba(20,21,27,0.72)` with `backdrop-filter: blur(18px)`
- Modal / popover solids: `#131117`, `#16181f`, `#14151b`
- Hairline dividers: `rgba(255,255,255,0.06)` · Card borders: `rgba(255,255,255,0.10)`–`0.14`

**Text:**

- Primary `#f2f3f6` / `#f4f5f7` · Strong secondary `#e9ebf0`, `#c3c7d0`
- Secondary `#9298a5`, `#8b909c` · Tertiary `#7a8090`, `#6b7180` · Faint `#5b616e`

**Accent (themeable — CSS var `--accent`):**

- Default **`#5b6cff`** (periwinkle). Alternate options: `#22d3ee`, `#a3e635`, `#ff5d8f`.
- Logo/gradient: `linear-gradient(150deg, #5b6cff, #9aa6ff)`
- Tints are derived with `color-mix(in srgb, var(--accent) N%, transparent|#fff)` — keep this relationship rather than hardcoding tints.

**Semantic:**

- Kept / success: border `#3fbf6f`, text `#68d492`, fill `rgba(63,191,111,0.12)`
- Failure (rose): border `rgba(224,138,122,0.5)`, fill `rgba(224,138,122,0.06)`, icon `#e8a99d`, heading `#f0d3cc`
- Reword / motion phrase (gold): `#d3a44e`, `#e2b866`, `#c79a54`
- Danger / sign‑out: `#d0766e` / `#e08a7a`
- Avatar gradient: `linear-gradient(150deg, #f4d3a2, #e6b487)`
- Auth showcase gradient: `linear-gradient(180deg, #ffd7a1 0%, #ff9bb0 38%, #c58bd8 66%, #6a5bc0 100%)`

### Typography

Two Google fonts:

- **Space Grotesk** (300/400/500/600/700) — all UI, headings, body, input.
- **Space Mono** (400/700) — labels, metadata, timestamps, node tags, uppercase eyebrows.

Scale (approx):

- Page title 26–28px / 600 / letter‑spacing −0.015em
- Section heading 22–25px / 600
- Card stat 22–24px / 600
- Body / controls 13–15px / 400–500
- Input text: Anchor 26px/300–400, dock 18px/400
- Mono labels 10–12px, uppercase, letter‑spacing 0.08–0.24em, color `#6b7180`/`#8b909c`

### Spacing / radius / shadow

- Spacing rhythm: 4 / 6 / 8 / 11 / 14 / 18 / 22 / 26 / 34 px
- Radius: badges 6–8 · cards/thumbs 9–13 · tiles/docks/sheets 14–18 · modal/player 20–24 · pills 999 · circles 50%
- Shadows: card `0 16px 36px -20px rgba(0,0,0,.7)` · tile `0 22px 54px -22px rgba(0,0,0,.75)` · dock `0 30px 70px -26px rgba(0,0,0,.85)` · modal `0 50px 110px -30px rgba(0,0,0,.8)`

### Atmosphere (signature look — replicate these)

- **Filmic grain:** full‑bleed overlay, `mix-blend-mode: overlay`, opacity ~0.36–0.45, from an inline SVG `feTurbulence` noise tile (170×170). Themeable on/off.
- **Vignette:** `box-shadow: inset 0 0 220px 10px rgba(0,0,0,.5)` (heavier on Anchor).
- **Ambient light blobs:** large blurred radial gradients (accent + warm) drifting slowly behind content; intensity controlled by an "atmosphere" (`--glow`) value.
- **Canvas grid:** workspace background is a dotted grid — `radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)` at `24px 24px`.

### Motion (keyframes, replicate by name/feel)

- `esRise` — content fade + rise 14–18px, cubic‑bezier(.2,.75,.25,1), staggered 0.1–0.62s
- `esLive` / `esLiveG` — the **live node** pulses an accent (or green) glow ring + bloom, 4.5s loop
- `esShim` — shimmer sweep across a generating tile; `esDot` — three bouncing dots; `esPulse` — dot opacity pulse (status)
- `esSettle` — new result settles in (blur+scale); `esGrow` — branch take scales in from its connector corner
- `esCaret` — text caret blink; `avModal` — modal scale/opacity in; ambient `esDrift1/2`, `esCore`, `avFloat`

---

## Screens / views

### 1. Empty state — "Anchor" (`Empty State - Anchor.dc.html`)

The front door. Full‑screen dark stage, ambient light, wordmark top‑left ("Vidra"), Library + avatar top‑right.

- **Center:** a large glass **prompt sheet** (width 672px, radius 20, glass fill + blur). Placeholder "Describe your idea…" in 26px/300. Below the textarea: two control chips (aspect `16:9 ▾`, duration `6s ▾`) and a circular **submit** button (46px). Submit is disabled/ghost until text is non‑empty; enabled = solid white with dark icon; on submit it turns accent and scales.
- **Starter chips** below the sheet (pills): "A coastal town at dawn", "A city waking up", "A paper boat in the rain" — clicking one fills the field.
- **Behavior:** textarea autofocuses ~760ms after load; focus wakes a bloom glow + accent focus ring; Enter (no shift) submits; draft persists to `localStorage['es_anchor_draft_v1']`; on submit writes `localStorage['vidra_new_words']` and navigates to the workspace after ~700ms.

### 2. Left rail (`Rail.dc.html`)

Persistent sidebar, **240px expanded / 64px collapsed** (animated width, `.26s`). Logo (new session), New session (+), Library, spacer, Docs & help, Account (avatar + name "Alex Rivera" / "alex@example.com"). Active item gets `rgba(255,255,255,.07)` fill. Collapse toggle in the header. Used by Workspace, Library, Account.

### 3. Workspace (`Workspace.dc.html`) — the core

Rail + top bar (session title "Coastal town at dawn", zoom control) + spatial canvas (dotted grid, ambient spotlight behind the live node) + the docked input pinned bottom‑center. Nodes are connected left→right by SVG paths: **accent = the live spine, faint white = a re‑roll ("roll"), gold dashed = an edited‑words remake ("reword")**. Each node has a mono caption ("prompt", "image 1", "clip 1", …).

State machine (`moment`), all present in the file:

- **writing** — first node born as a shimmering "LIVE" placeholder; dock shows the words typing with a blinking caret + "Generating…" pill.
- **painting** — prompt node + a generating image tile (shimmer + bouncing dots + LIVE badge).
- **picture (the gate)** — the finished still as the live node (accent border, glow, drop‑gradient, LIVE tag). Dock shows the editable, phrase‑highlighted description + a re‑roll circle + **Animate** button. Right‑click → context menu (Animate / Re‑roll / Reword / Duplicate / Delete). Re‑roll spawns "image 2" branching **down**; Reword spawns "image 3" branching **up** (gold).
- **moving** — picture set in motion; a generating clip tile. _(Note: this is a plain generating placeholder; a richer "approved‑picture‑under‑a‑progress‑veil" treatment was explored but is not in this build.)_
- **clip** — the looping clip as live node (play affordance); dock shows re‑roll + **Keep** (with "subscribe to keep" hint). Re‑roll branches "clip 2" down.
- **kept** — clip node marked kept (green border/glow, ✓ kept tag); dock shows an **Actions** button (Share / Download / New clip / Duplicate / Delete).
- **pictureFail** / **clipFail** — the live tile becomes a rose dashed error card ("Couldn't generate" / "Couldn't animate", "Nothing was charged.") with a **Try again** button. No node persists.

Docked input shared behaviors: click text to edit (textarea + Cancel/**Reword**); highlighted phrases (accent underline) open an alternatives popover; **motion phrases** render in gold dashed and are marked "not in the picture"; a "revert to original prompt" control; aspect/duration readout `16:9 · 6s`.

Themeable props: `accent`, `atmosphere` (glow 0–1.6), `grain` (on/off).

### 4. Library (`Library.dc.html`)

Rail + header ("Library", search field "Search your work") + filter chips **All / Sessions / Kept clips** (active = solid white pill). 4‑column responsive grid of entries: thumbnail (172px, `<image-slot>`), a mono badge (`clip · 6s` dark, or `session` light), title, and mono timestamp. Clips show a play glyph. Hover lifts the card (translateY −3px, brighter border). Clicking an entry opens that session's workspace. Sample data: "Coastal town at dawn · 2 hours ago", "A city waking up · Yesterday", etc.

### 5. Auth (`Auth.dc.html`)

A **modal over the dimmed workspace** (the user's draft is held behind a blur scrim). Modal 744px, two columns:

- **Left (412px):** heading "Welcome back" / "Create your account" with a toggle link to switch modes; **Continue with Google** button (white, with a "Last used" accent badge on sign‑in) using the multicolor Google G; an OR divider; email + password inputs (icon‑prefixed, dark fields `#1b1a21` / border `#35333c`, accent focus border); a tinted **Sign in & continue / Create account & continue** button; Terms & Privacy line.
- **Right (332px):** decorative "showcase" panel — warm→violet gradient with soft floating light blobs and a close (✕) button.
- **Behavior:** toggle swaps copy; continue → workspace; scrim/✕ dismiss → Anchor. Props: `accent`, `mode` (`signin`|`create`).

### 6. Account (`Account.dc.html`)

Rail + a **settings sub‑nav** (236px: "Personal profile", "Subscription", "Usage", and a rose "Sign out" pinned bottom) + content pane. Props: `accent`, `tab` (`profile`|`subscription`|`usage`).

- **Profile:** avatar + name "Alex Rivera" + Edit chip + email; two cards — **Credits** ("10 left" + Top up) and **Usage history** (accent bar sparkline with Jun 6 / Jun 21 / Jul 5 axis); an **Activity** row (Clips made 12 / This month 12).
- **Subscription:** "Free plan" card + **Upgrade plan** (accent); a **Credits** card ("10 / 10", + Buy credits, full progress bar); **Billing history** empty state ("No invoices yet").
- **Usage:** three stat cards (Credits used 38 / Clips generated 12 / Avg per day 1.3); a **Daily credits** 30‑bar chart (one bar highlighted accent).

### 7. Public clip page (`Public Clip.dc.html`) — signed‑out

Minimal public chrome: wordmark left, **Sign in** button right. Centered **clip player** (784×441, radius 20, subtle accent ring) with play button, a scrubber (`0:02 —— 0:06`), and a gradient overlay. Below: the clip's description as an italic quote; a white **Start your own clip →** CTA and a mono subline "Free to try · no account needed to watch". Ambient light + grain + vignette, matching the app. No rail, no space — just the clip, its words, and one way in. Props: `accent`, `grain`.

### 8. Docs (`Docs.dc.html`) — reference

Content‑only. Slim icon rail (logo, back‑to‑app, docs) + a **table of contents** (On this page: The workflow / Editing phrases / What the space shows) + a reading column. Contains: an H1 "How it works"; the **Type → Picture → Motion → Keep** chip flow (Keep in green); an **editing phrases** example card (gold motion phrase + accent‑highlighted phrases); a **"what the space shows"** node diagram (SVG) with a move / roll / reword legend. No interactive controls. Props: `accent`, `grain`.

---

## Interactions & behavior (summary)

- **Navigation** is page‑to‑page (`window.location`): Anchor → Workspace; Rail → New/Library/Account; Library entry → Workspace; Auth continue → Workspace, dismiss → Anchor; Account sign‑out → Anchor.
- **Persistence (localStorage):** `es_anchor_draft_v1` (the prompt draft), `vidra_new_words` (handoff of the submitted line to the workspace). `<image-slot>` persists user‑dropped media by element `id`. In production, replace image‑slots with real generated media and back the graph with server state.
- **Timing:** writing→painting ~1.5s, painting→picture ~1.7s, animate→clip ~1.8s, submit→navigate ~0.7s. These are demo stand‑ins for real generation calls — wire them to actual job status.
- **Hover/active/focus:** buttons lift 1px and brighten; inputs show an accent focus ring/border; cards lift and brighten borders; the live node continuously pulses its glow.
- **Loading states:** shimmer tile + bouncing dots + "Generating…" pill. **Error states:** rose dashed card, "nothing was charged", Try again. **Empty states:** Anchor placeholder, Library filters, "No invoices yet".

## State management (what a real build needs)

- **Session/space model:** an ordered graph of nodes. Node types: `words` (prompt), `picture` (still, may have takes), `clip` (motion, may have takes), each with status `generating | ready | failed | kept`. Edges carry a kind: `spine | roll | reword`. The "live" node drives the dock and the ambient spotlight.
- **Per‑screen UI state:** Anchor (draft text, focused, submitted); Workspace (`moment`, which node is live, editing/reword/phrase‑popover flags, take branches); Library (filter); Auth (mode); Account (tab). Theme values `accent`, `atmosphere`, `grain` are global.
- **Data/fetching:** generation is async — replace the timers with real job creation + polling/streaming; billing/credits come from the account service; library lists past sessions and kept clips.

## Assets

- **Fonts:** Google Fonts — Space Grotesk, Space Mono (swap for the codebase's equivalents if it standardizes fonts).
- **Icons:** inline SVG, lucide‑style 1.7–2.1 stroke (arrows, clock, eye, mail/lock, retry, kebab, chart, etc.). Use the codebase's icon set.
- **Google "G"** multicolor logo SVG in Auth (for the OAuth button).
- **Grain** is an inline SVG data‑URI (`feTurbulence`) — reuse or replace with a small noise PNG.
- **`<image-slot>`** placeholders stand in for real stills/clips; not needed in production.

## Files in this bundle

- `All Frames.dc.html` — index that renders every screen/state (best starting point).
- `Empty State - Anchor.dc.html` — empty state / front door.
- `Rail.dc.html` — left sidebar (imported by Workspace, Library, Account).
- `Workspace.dc.html` — core loop + all states (writing, painting, picture, moving, clip, kept, pictureFail, clipFail) + dock behaviors.
- `Library.dc.html` — sessions & kept clips grid.
- `Auth.dc.html` — sign‑in / create modal.
- `Account.dc.html` — profile / subscription / usage.
- `Public Clip.dc.html` — signed‑out public clip page.
- `Docs.dc.html` — how‑it‑works reference.
- `support.js`, `image-slot.js` — runtime needed only to open the reference files in a browser; **not** part of what you implement.

_Note: earlier low‑fidelity wireframes and three in‑progress interaction explorations (a richer "moving" state, take‑browsing, and a daily‑cap moment) exist in the source project but are intentionally not included here._
