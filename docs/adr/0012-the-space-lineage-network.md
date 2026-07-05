# The space: the page's content is a structured lineage network, and the player is its live node

**Status:** accepted (2026-07-05) · amends [ADR-0010](0010-one-visible-text-one-loop-subscription-at-keep.md)

A 2026-07-05 design exploration (empty-state wireframe review → lineage brainstorm)
resolved that the flat takes strip was a lossy projection of structure the product
already keeps: every take is a generation record permanently paired with the words that
made it (ADR-0011 D4), re-rolls are siblings, reworded remakes are cousins, and motion
renders are children. The loop's verbs already define a typed provenance graph.

**The decision.** The page's content area is **the space**: an ambient, structured
lineage network. Every take is a node, auto-laid-out into three fixed generations —
words → pictures → clips — with edges typed by the creator's verbs (roll = sibling from
the same words; reword = a new words-version and its descendants; move = picture → clip).
Depth is bounded by the pipeline; only breadth grows. Nodes are never dragged, wired, or
manually placed — **the space is history made visible, never a tool the creator
operates**. The guided loop remains the only way to create.

**The player becomes the live node.** Whichever take is current renders enlarged with the
camera centered on it — waiting state, picture, then clip, in place (a new generation is
a node being born where it will permanently live). Selecting another node slides the
camera and restores that take's paired words into the input (the explicit take-restore
contract, unchanged). The input and the next-step button stay docked and constant; page
anatomy is: the space + the input + the next-step button.

**The empty state stands; the dock happens once.** Before the first go there is no
space — the page is the centered input with starter chips (the designed empty-state set
is unchanged). On first submit the input docks to its permanent position and the space is
born with the first node. The input moves exactly once in its life.

**First run is untouched.** Zero branches renders as a straight line — the S0–S6 spine of
ADR-0010 is the degenerate case of the space. The network appears only when branching
creates it.

## Considered options

- **Single player + flat takes strip** (ADR-0010 as written) — superseded: the strip
  hides which words made which take and hides sibling/ancestor structure; comparison
  requires serial clicking.
- **Local + summoned** (resident sibling row, full lineage behind a map affordance) —
  rejected as the primary model: safest, but the lineage never gets felt; kept as the
  natural degradation for constrained widths.
- **Freeform node canvas** (Flora/Weavy-style operations graph) — rejected: spatial
  authoring and node wiring are pro-tool interaction models; ADR-0002's creator must
  never need to think in a graph to create.

## Consequences

- The takes-strip concept (wireframes, M4 scope, remaining-surfaces spec) is superseded
  by the space; loop moments are re-expressed as node behaviors.
- M4 grows real build: deterministic lineage layout (fixed columns, computed rows) and a
  camera (center-on-live, slide-on-select). No pan/zoom authoring, no persistence of
  positions — layout is derived, so nothing spatial is stored.
- Failures still produce no nodes; a failed roll reports at the live node. Keep marks a
  node (the tree bears visible fruit); soft-cap and truth contracts are untouched.
- **Riskiest assumption, to be tested in design before build:** a non-expert reads the
  growing structure as "my work's history," not "a diagram to understand." The test is a
  mock of the space at ~6 nodes; if it reads as homework, the fallback is the
  local+summoned form with the same data model — which loses no persisted structure,
  since the graph is derived from records either way.
