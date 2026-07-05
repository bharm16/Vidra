# Design handoff package

Hand this folder to Claude Design (claude.ai/design) — it is self-contained.

- `DESIGN-BRIEF.md` — the full brief: product, page contract, all 17 states with
  final-candidate copy, design-language constraints, viewports, motion notes, hard no's,
  deliverable format, and the four provisional defaults awaiting owner sign-off.
- `tokens.css` — the production `@promptstudio/system` token file. The only styling
  vocabulary designs may use.

## How to hand off

**Route 1 — claude.ai/design directly (fastest).** Create a project, upload both files,
and prompt: _"Design the 17 workspace states in DESIGN-BRIEF.md, one HTML file per state,
using only the tokens.css vocabulary. Follow the copy verbatim; flag deviations."_
Iterate there. Bring results back via "Send to Claude Code Web," or export the HTML files
into `docs/design/handoff/returns/` in this repo.

**Route 2 — DesignSync from a terminal.** Run `claude` interactively in this repo, run
`/design-login`, then ask the session to push this folder to a Claude Design design-system
project with `/design-sync`. Read/write sync from then on.

## Accepting returned designs (the checklist)

A returned set is accepted when: every state (1–17) exists · copy is verbatim or flagged ·
exactly three residents + top bar, nothing resident beyond them · token-only styling ·
color appears only as span-category highlights · S0/S3/S5 shown at laptop + ultrawide ·
failure states are designed, not omitted · every contract deviation is flagged with a
reason. Returned HTML goes to `returns/`; the coded prototype is assembled from it.
