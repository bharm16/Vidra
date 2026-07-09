# The live editor is its own rail surface on its own infinite plane — not part of the space

**Status:** accepted (2026-07-09) · spec: [2026-07-09-live-editor-surface-design.md](../superpowers/specs/2026-07-09-live-editor-surface-design.md) · relates to [ADR-0012](0012-the-space-lineage-network.md)

The realtime sketch outgrew its hidden spike route: the owner wants it reachable from
the rail (directly under Library, as "Live editor") and living on an infinite
pannable/zoomable plane like the workspace viewport. The obvious alternative was to
embed sketching _inside_ the space — but the space is a lineage network with strict
semantics (every node is a take or words-version, nothing is dragged, nothing spatial
is stored), and a live drawing surface satisfies none of that. A second reading —
renders accumulating on the plane as a board — was deliberately deferred.

**The decision.** The Live editor is a separate page (`/live-editor`) mounting the rail
and its own plane, holding exactly one fixed editor object (sketchpad | live output)
with the floating chrome screen-fixed. The camera engine is shared, not forked:
`SpaceViewport` + `spaceCamera` move to `client/src/components/canvas/` and both
surfaces consume the same TDD'd pan/zoom/click-discrimination behavior. The select
tool pans; brush and eraser strokes stop propagation and never pan.

This also **promotes the spike to a persistent product surface** ahead of the feel
verdict — the rail slot is the promotion. The spike spec's verdict addendum still owns
the deeper question (does sketching earn a place in the authoring loop as an expansion
input), which ADR-0002 governs.

## Considered options

- **Embed in the space** — rejected: breaks the space's contract (nodes are takes;
  history made visible, not a tool), and couples a live experiment to the product's
  most semantically-loaded surface.
- **Keep the standalone flat page** — rejected by the owner: the app's canvas-first
  feel expects the plane, and the surface deserves first-class navigation.
- **Fork a lean viewport for the live editor** — rejected: the pan/zoom/click
  discrimination logic (including its pointer-capture fixes) would drift; promotion
  to `components/canvas/` keeps one engine with two consumers.

## Consequences

- The rail becomes shared chrome beyond the workspace (already the rebuild's
  direction for Library/Account).
- A future reader seeing two infinite planes must not conflate them: the space is the
  lineage network; the Live editor's plane is just a stage for one editor object.
  CONTEXT.md pins both terms.
- The accumulating-board idea, if it ever lands, must revisit ADR-0012's
  "nothing spatial is stored" rule before dropping cards onto this plane.
