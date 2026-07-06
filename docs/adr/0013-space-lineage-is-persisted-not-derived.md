# The space's lineage is persisted; only layout and edge-kind are derived

**Status:** accepted (2026-07-06) · clarifies [ADR-0012](0012-the-space-lineage-network.md) — narrows its "derived from records" language: the edge _set_ is persisted via parent links, while layout and edge _kind_ remain derived

ADR-0012 described the space as "history made visible… derived from records," which reads as though the lineage graph could be reconstructed at render time from data the product already keeps. A 2026-07-06 contract audit found it cannot: a persisted generation record stores its paired `prompt` and a `promptVersionId`, but **no parent pointer, no edge-kind, and no archive flag**, and Flux-Schnell pictures are not persisted as records at all (only storyboard pictures and video clips are). The only signals available to "derive" a picture→clip edge are things like the clip's start-image URL — a temporary signed URL that expires — so a derived graph would be correct at generation time and silently wrong later.

**The decision.** The space's lineage is **persisted, not guessed.** Each node stores a reference to its immediate ancestor (a clip → its source picture; a picture → its words-version; a words-version → the words-version it was reworded from), plus an `archived` flag on removable nodes. What stays derived is (1) **layout** — columns, rows, positions are computed every render and never stored, exactly as ADR-0012 requires; and (2) **edge kind** — `spine | roll | reword | move` is a pure function of the two endpoints it connects (picture→clip is always `move`; a picture sharing its parent words-version with a sibling is a `roll`; a new words-version is a `reword`; the root is the `spine`), so it is computed, never stored. Pictures are promoted to persisted generation records ([ADR-0011](0011-rebuild-scope-decisions.md) D4) so a picture can be a node with a parent.

## Considered options

- **Derive edges from leftover signals** (prompt-version grouping + start-image URL matching) — rejected: signed image URLs expire, so clip→picture provenance rots; version grouping alone can't distinguish a re-roll from an unrelated generation. A map built on expiring clues drifts out of truth with no error.
- **Persist parent _and_ edge-kind explicitly** — rejected as redundant and drift-prone: kind is fully determined by the endpoints' types and their words-version identity, so a stored kind can only ever agree with, or contradict, what's computable from the nodes. Storing it invites the two to disagree.
- **Persist parent only; derive kind and layout** (chosen) — the minimum that survives expiring URLs and keeps ADR-0012's "nothing spatial is stored" intact.

## Consequences

- New persisted fields enter the node contract in M4: an ancestor reference (nullable; null = root) and an `archived` boolean. Where the reference doesn't exist today — parent-of a reworded words-version, a clip's source picture, and picture records at all — M4's cross-layer work adds it. Pre-launch with zero users, so there is no data migration, only a schema addition.
- **D4 (persist Flux-Schnell pictures) is now a prerequisite, not an option.** A picture with no record cannot be a parent, so picture-persistence must land before the space renders.
- **Leaf-only removal (ADR-0012 / RULINGS §5) needs zero reconciliation logic.** A leaf is exactly a node that no record names as its ancestor; archiving one cannot orphan anything, because nothing points at it. The "nothing vanishes" guarantee is the `archived` flag plus render-time exclusion.
- **Edge kind cannot lie.** Because it is computed from the endpoints, the drawn relationship always matches the nodes it connects — there is no stored label to fall out of sync.
- ADR-0012's "derived" claim is now precise: **layout is derived, the edge set is persisted, the edge kind is derived.**
