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
5. **Duplicate / Delete node verbs** — under separate ruling (see node-deletion decision).
