# The prompt's screen weight tracks the working step: the composer collapses and the words node demotes when a take has focus

**Status:** accepted (2026-07-09) · amends [ADR-0012](0012-the-space-lineage-network.md) (page anatomy: the input's _dock_ stays constant; its _form_ becomes two-state) · upholds [ADR-0010](0010-one-visible-text-one-loop-subscription-at-keep.md)'s truth contract

A 2026-07-09 owner review of the live rebuilt workspace found the prompt carrying
permanent double screen weight: a full-size words card sits at the head of the space
_and_ the docked composer repeats the same text below it, both fully rendered even when
the creator is past writing and working with pictures and clips. This is ADR-0012's own
flagged riskiest assumption materializing ("reads as clutter, not history") plus an
ADR-0010 tension — two prominent renderings of one text.

**The decision.** Focus follows the workflow step, and the composer is bound to the
words node's focus:

- **Words node focused** — the default at writing, when it is the only node in the
  space, and later whenever the creator clicks it — the full text box is open at the
  dock and the words node renders full-size. The expansion always streams into a
  visible box.
- **A take steals focus the moment it starts forming.** The composer collapses to a
  **slim toolbar — controls only** (aspect · duration · model · preview · Make it, no
  text preview), and the words node **demotes to a small, dim origin chip**.
- **Clicking the demoted words node is the only door back to editing**: the node
  expands and the box reopens. Clicking a take or the empty canvas (a click, not a
  pan-drag) returns focus to the media and collapses the box. Node focus is ephemeral
  UI state — never persisted, consistent with ADR-0012's "nothing spatial is stored."
- The dock position never moves. One composer, two states — not two components.

**Why the truth contract survives.** Text can only be edited inside the open box, so
collapsing cannot conceal a change: the words that run are byte-identical to the words
last seen at full size, and verbatim receipt ("no hidden appends") is untouched. The
contract's enemy was the system mutating text behind the creator's back, not compact
display of text the creator wrote and saw.

## Considered options

- **Keep full cards; fix framing/camera only** — rejected: at two nodes the words card
  sits one column from the live take and stays in view; the doubled text remains.
- **Fold words nodes out of the graph** (media-only space, words as captions) —
  rejected: loses the visible anchors ADR-0012 exists for — which words made which
  takes, and where rolls/rewords branch.
- **Toolbar with a truncated text preview as a second door** — rejected by owner:
  controls only. A truncated preview is a third rendering of the text; the chip is the
  canonical door.
- **Collapse on blur / manual chevron** — rejected: blur-collapse yanks the box away
  mid-writing and lets not-fully-visible text run; a manual toggle keeps the big box as
  the default, which is the original complaint.
- **Focus-follows-step with manual override** (chosen) — the first run is never broken
  (words focused by default while writing), and afterward the behavior is exactly
  "box visible only when the words node is selected."

## Consequences

- ADR-0012's anatomy sentence is amended: the input and next-step button stay _docked_
  constant, but the composer's form is two-state. Its take-restore contract is
  unchanged — selecting a take still returns its paired words to the input; the input
  may simply be collapsed when they arrive.
- The space gains a focus model (auto + manual) and the words node gains a demoted
  rendering. Neither is persisted.
- **Riskiest bit: chip-as-only-door discoverability.** The demoted chip is quiet at
  rest by design, so it must carry an unmistakable hover affordance. If creators can't
  find their way back to editing, the recorded fallback is the rejected
  toolbar-preview option, which is purely additive.
- Design frames were commissioned 2026-07-09 (brief handed to the design agent:
  words-focused frame, media-live frame, chip states, box↔toolbar transition). Per
  [ADR-0014](0014-the-design-handoff-is-the-authoritative-visual-spec.md), the returned
  frames become the visual authority for these states; build follows the frames.
- `CONTEXT.md` gained **Words node** (retiring "prompt node" / "text node").
