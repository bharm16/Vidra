# Design handoff package

Hand this folder to Claude Design (claude.ai/design) — it is self-contained.

- `DESIGN-BRIEF.md` — the brief: the product, eight fixed truths (product decisions),
  the workflow moments each with the job the screen must do, the span-category palette,
  and an explicit open-canvas list. Copy in the brief is raw material, not law.
- `tokens.css` — the current production token system, as the starting vocabulary.
  Token evolution is welcome when proposed explicitly.

## How to hand off

**Route 1 — claude.ai/design directly (fastest).** Create a project, upload both files,
and prompt: _"Read DESIGN-BRIEF.md. Explore directions for the key moments first; once a
direction lands, design the full set of moments. tokens.css is the starting vocabulary.
Flag anywhere you want to bend a fixed truth."_ Iterate there. Bring results back via
"Send to Claude Code Web," or export files into `docs/design/handoff/returns/`.

**Route 2 — DesignSync from a terminal.** Run `claude` interactively in this repo, run
`/design-login`, then ask the session to push this folder to a Claude Design
design-system project with `/design-sync`. Read/write sync from then on.

## Reviewing returned designs

Judge against the eight fixed truths, not pixel conformance: one text surface; one home
for the result (and none before the first submission); one obvious next step per moment;
the seen-text-is-the-sent-text principle made legible; phrase exploration discoverable
and reachable; failures that keep work and never punish; no resident configuration,
credits, or model names; color reserved for span meaning. Every moment designed,
including waits, failures, and limits. Flagged challenges to a truth are welcome and go
to the owner; silent violations go back. Returned files land in `returns/`; the accepted
set is assembled into the coded prototype.
