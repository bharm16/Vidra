# The workspace is input-first: three residents, and no player before the first result

**Status:** accepted (2026-07-04)

The workspace's pre-work state had drifted into a floating hero ("What are you making?")
raised over a full-viewport black void, with a settings-laden composer and no visible
structure — a 2026-07-04 requirements-strip grilling rebuilt the page from the workflow
instead of from the existing furniture.

**The decision.** The page has exactly three resident elements, named in
[CONTEXT.md](../../CONTEXT.md): **the input** (one text box — the creator's one-liner
becomes the full shot description in the same box; there is never a second text surface),
**the player** (one rectangle where the waiting state, the picture, and the video appear in
place), and **the next-step button** (only the action that advances the work right now:
Go → Use this / Try again → Make it move → Keep). Everything else is a setting summoned on
demand or lives off the page. Before the first go there is **no player**: the page is the
input with its starter chips, sized to its content — the player mounts with the first
submission and the input settles beneath it.

This refines ADR-0002's canvas-ownership corollary (recorded under "First frame" in
CONTEXT.md): the frame still owns the canvas at every beat of the expansion loop — but the
loop's beats begin at submit. Before submit there is no canvas to own.

## Considered options

- **An empty stage** (hairline-framed 16:9 canvas with viewfinder guides, hero inside,
  composer docked beneath — mocked live in the app on 2026-07-04) — rejected against
  evidence: no real consumer product ships an empty player. Google, ChatGPT, Sora, and
  Midjourney are all input-first; the screen earns its place by having content. Empty
  monitors belong to pro editing tools, which ADR-0002 says Vidra is not.
- **Two text surfaces** (input stays an input; the expanded description renders elsewhere) —
  rejected: two text things on one page is how the layout drifts back to complicated, and
  it splits the creator's attention between writing and editing surfaces.
- **Resident settings** (model / aspect / duration / tune chips always visible on the
  composer) — rejected: the loop runs on defaults; adjustments become relevant only once
  there is a result to disagree with. Settings are summoned, never resident.
- **Recent clips under the input** (Sora-style feed) — deferred, not rejected: it renders
  only when content exists, so today's empty page is that design with zero items. No empty
  grid is ever shown.

**Consequence for implementation.** Adopting this is a removal, not an addition: the raised
composer positioning (40vh spacer), the full-viewport pre-work canvas region, and any empty
player placeholder all go. When a design discussion adds a fourth resident element to the
page, the discussion is wrong (see "The page", CONTEXT.md).
