# PromptRequirements stays text-derived until the taxonomy carries the semantics

**Status:** superseded by [ADR-0006](0006-model-intelligence-requirements-use-an-llm-perception-classifier.md) — the regex was removed by introducing a dedicated LLM perception classifier rather than the taxonomy-enrichment program this ADR proposed. Retained for the analysis of why role-derivation alone cannot work.

`PromptRequirementsService.extractRequirements`
(`server/src/services/model-intelligence/services/PromptRequirementsService.ts`)
derives its model-recommendation inputs — physics, character, environment,
lighting, style, motion flags — from ~30 keyword **regex wordlists**
(`/\b(water|rain|ocean|…)\b/`, `/\b(dog|cat|bird|animal|…)\b/`, …). The project
forbids regex **and** `Set`/phrase-list lookups for semantic classification, so
an architecture review recurs to the suggestion: _"delete the wordlists and
derive these flags from the span-labeler's taxonomy roles instead."_ A
deterministic eval (`PromptRequirementsService.eval.test.ts`, baseline
`23/29` correct leaves) was added in a prior commit specifically to make that
rewrite validatable. We investigated the rewrite and are **keeping the
text-derived implementation for now**: the clean role-based rewrite is not
achievable on the current taxonomy without breaking the project's own rules or
the eval.

## Why the taxonomy roles cannot replace the regex today

- **The taxonomy is structural, not a controlled vocabulary.** `shared/taxonomy.ts`
  defines 9 parent categories and their sub-role ids (`subject.identity`,
  `lighting.source`, `style.aesthetic`, …) — `attributes` maps a key to a
  category-id string. There is **no value vocabulary**: nothing encodes
  water/fire/cloth, human/animal/mechanical, anime/photoreal, or
  dramatic/natural. So matching span text against "the taxonomy" cannot
  recover the semantics the regex extracts.
- **The eval's own ground truth proves roles are too coarse.** The fixtures pair
  coarse roles with fine flags: `{ "raging river": environment.location }` →
  `hasFluidDynamics: true`; `{ horse: subject.identity }` →
  `hasAnimalCharacter`; `{ mech: subject.identity }` → `hasMechanicalCharacter`.
  `horse` and `mech` carry the **same** role, so role-only derivation cannot
  tell them apart — it collapses distinct concepts and fails these cases. The
  semantic lives in the span **text**, not the role.
- **The sanctioned non-regex path breaks the eval.** The project's stated
  alternative to a classification wordlist is "trust the LLM's self-declared
  category, or delete the gate." The span-labeler already declares categories —
  but only at parent-role granularity. Adding a dedicated LLM requirements
  classifier would make `extractRequirements` **async/non-deterministic**, which
  the synchronous, pure eval (and a per-recommendation latency budget) cannot
  absorb.
- **The flags are load-bearing.** Every requirement flag feeds
  `ModelScoringService.calculateWeights()`, so silently degrading them (e.g.
  role-only derivation firing fewer flags) perturbs recommendation ranking, not
  just an unused output.

Net: the four constraints **{ pass the eval ≥ 23/29 · no regex · no
wordlist/`Set` · keep `extractRequirements` pure }** cannot all hold on today's
taxonomy. At least one has to give, and none of them should.

## Considered and declined

A "hybrid" — taxonomy roles where they fit, plus a small synonym map
(`sea→water`, `vocalist→speaker`) and a negation module, keeping the morphing
regex — was evaluated and **declined**. The synonym map is a wordlist in another
form (the rule forbids exactly this); the retained morphing regex is still a
semantic regex; and routing negation through the NLP analyzer forces
`extractRequirements` async, breaking the deterministic eval. It trades one
forbidden shape for three.

## The real fix (deferred, not an autonomous edit)

Move the concept ontology **into the taxonomy / span-labeler** so the roles
themselves carry the distinction the regex currently recovers from text — e.g.
a `subject.kind ∈ {human, animal, mechanical}` axis, environment element tags,
a style medium. Then `PromptRequirements` can **trust the role** and the
wordlists delete cleanly. That is a taxonomy **contract change** plus a
span-labeler prompt change and a golden-set **re-bless** — a multi-step program,
eval-gated on the span-labeler, not a single-file refactor.

## Consequences / things to know

- Do **not** re-flag "replace the PromptRequirements regex with taxonomy-role
  derivation" as an easy, autonomous refactor. On the current taxonomy it fails
  `PromptRequirementsService.eval.test.ts` below the `23/29` baseline. The
  presence of the eval is a green light to _validate_ the change, not evidence
  that the change is cheap.
- The eval stays valuable: it is the gate any future role-enrichment must clear.
  When the taxonomy gains finer roles, revisit — derive the now-supported flags
  from roles, delete the corresponding wordlists, and raise the eval baseline as
  blind spots close.
- The keyword regex remains a known, documented smell scoped to this one
  service; it is text-derived on purpose until the seam above exists.
