# The draft/render tier is derived from the model, never stored on a take

The `draft | render` tier is the cost/quality choice a creator makes per generation, and the choice _is_ a model selection — `useCapabilitiesClamping` already maps the two directions. Storing the tier alongside the model on a persisted take therefore records the same fact twice, and the copies drifted immediately: every server write site hardcoded `tier: "draft"` (so a Sora 2 clip badged as a draft), while the client's reconstruction fallback hardcoded `tier: "render"` for the same take reached by a different path. We are removing `tier` from the persisted generation record and deriving it from the record's `model` at read time, so the CLAUDE.md glossary's "never crosses the wire" is true in fact and not only in intent.

## Considered options

**Persist it honestly** — thread the real tier from the client request through the job into the record, and amend the glossary to admit the tier crosses the wire. Rejected: it keeps a field that can drift from `model` and buys nothing, since no take can have a tier its model contradicts.

**Read `generationSettings.videoTier` instead** — the client already writes the true tier there at request time. Rejected: it leaves two disagreeing tier sources on one record rather than removing one.

## Consequences

Records already written carry `tier: "draft"` regardless of their model. Because the value is now derived, those records read correctly without a backfill — the stale field is ignored rather than migrated. `selectHeroGeneration`'s tolerance for the legacy `"final"` spelling can go with it.

Reversing this means re-adding the field _and_ backfilling every existing take from its model, which is why it is written down.
