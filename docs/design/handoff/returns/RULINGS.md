# Handoff deltas — owner rulings (2026-07-05)

The Claude Design handoff (`design_handoff_vidra/`) introduced five things beyond the
specs. Ruled as follows:

1. **Node captions** — kept as drawn: the words-node's caption reads "prompt" (mono tag).
2. **Canvas zoom** — kept: the space has a zoom control (−/%/+); part of the camera scope.
3. **Theming knobs** — removed: `accent`, `atmosphere`, `grain` are fixed constants, not
   user- or dev-facing theme options.
4. **Palette/fonts** — the handoff's visual system is NOT adopted: implement its layouts,
   structure, and motion with the existing token system (`tokens.css` neutrals and type).
   The ADR-0008 amendment (restrained accent + space state colors) stands; exact values
   are chosen within the existing token system at implementation, not imported from the
   handoff hexes.
5. **Duplicate / Delete node verbs** — ruled 2026-07-05:
   - **Duplicate is dropped.** It has no honest verb: duplicating a take creates
     identical media with no provenance meaning, and duplicate-to-edit is what reword
     already is.
   - **Removal is leaf-only.** The action (menu copy: **Remove**) appears only on takes
     with no children — no cascades, no re-parenting, orphans are unrepresentable. A
     branch is pruned tip-inward, one visible take at a time.
   - **Archive semantics.** The record persists server-side (ADR-0011 D4), flagged and
     excluded from the space's render; "nothing vanishes" stays a system guarantee and
     undo stays cheap to add later.
   - **Camera falls back to the parent** when the live node is removed (standard
     selection contract: its words return to the dock).
   - **Kept nodes are not removable** (un-keep first). **The root is not removable in
     the space** — deleting the root is deleting the session, which belongs to the
     Library.
