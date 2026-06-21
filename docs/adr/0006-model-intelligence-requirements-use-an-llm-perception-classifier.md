# Model-intelligence requirements come from an LLM perception classifier, not regex or the span taxonomy

**Status:** accepted — supersedes [ADR-0005](0005-prompt-requirements-needs-taxonomy-enrichment-not-regex-removal.md)

`ModelIntelligenceService` recommends a video model by scoring it against
`PromptRequirements` flags (physics, character, lighting, style, motion). Those
flags were derived from ~30 keyword **regex wordlists** in
`PromptRequirementsService` — which the project forbids for semantic
classification, and which were structurally blind to negation ("not a drop of
water"), synonyms ("sea", "vocalist"), and inflected forms ("flames").

[ADR-0005](0005-prompt-requirements-needs-taxonomy-enrichment-not-regex-removal.md)
recorded that "derive the flags from the span-labeler's taxonomy roles" cannot
work on the current taxonomy and proposed, as the real fix, **enriching the
taxonomy/span-labeler to emit finer roles**. On building it we rejected that
path and chose a different one.

## Decision

Extract requirements with a dedicated **LLM perception classifier**, splitting
**perception** from **policy**:

- `RequirementsClassifier` (`services/RequirementsClassifier.ts`) calls
  `aiService.execute("requirements_extraction", …)` (GPT-4o, temperature 0,
  JSON mode) and returns `RequirementObservations` — objective, prompt-grounded
  perceptions (hasWater, characterKinds, lightingMood, hasMorphing, …).
- `mapObservationsToRequirements` (`services/requirementsMapper.ts`) is a **pure,
  deterministic** function applying the scoring policy (e.g.
  `hasComplexPhysics = water || fire || ≥2 effects`; morph ⇒ transition) to
  produce `PromptRequirements`. Counts, `detectedCategories`, and
  `confidenceScore` stay span-derived so the recommendation honesty-cap is
  unchanged.
- When the LLM is unavailable, `deriveRequirementsFromRoles` provides a
  degraded, **non-regex** fallback from taxonomy roles only.

The regex `PromptRequirementsService` is **deleted**.

## Why this, not the alternatives

- **vs. regex / `Set` wordlists** — forbidden, and structurally capped: it can't
  see negation, out-of-vocabulary synonyms, or inflection. The live eval below
  shows the gap (79% → 100%).
- **vs. taxonomy enrichment (ADR-0005's proposal)** — `shared/taxonomy.ts` is the
  **client-shared UI category model** that colors span highlights. Adding
  backend recommendation-semantics (`environment.water`, `subject.kind.animal`)
  pollutes that contract and forces the **eval-gated span-labeler** to classify
  more categories, risking its golden-set F1 — degrading the active product to
  serve a premature one. A dedicated classifier keeps the concerns separate.
- **vs. one monolithic LLM call returning the flags directly** — splitting
  perception from policy keeps the scoring policy a fast, deterministic unit test
  and lets the LLM do only what it is best at (language-aware perception).

## How it is validated

The single deterministic 23/29 regex eval is replaced by two gates:

- **Policy (deterministic, in `test:unit`)** —
  `__tests__/requirementsMapper.test.ts` scores the pure mapper and the role
  fallback with no LLM.
- **Perception (live, on-demand)** — `npm run eval:requirements`
  (`scripts/evaluation/requirements-extraction-eval.ts`) runs the classifier
  against the same hand-labeled golden set. Result on adoption: **29/29 (100%)**
  vs. the regex baseline of **23/29 (79.3%)**, with all six former blind-spot
  cases passing.

## Consequences / things to know

- Each recommendation now makes one extra LLM call (`requirements_extraction`).
  Acceptable: `model-intelligence` is premature/pre-launch
  ([ADR-0002](0002-vidra-is-an-authoring-tool-for-non-experts.md)); correctness
  was the explicit priority.
- The deterministic 23/29 unit gate is gone; perception quality is now an
  on-demand live eval (mirroring span-labeling's golden-set posture). Keep the
  golden set (`__tests__/fixtures/requirementsEvalCases.ts`) as its ground truth.
- Model/provider are configured in `modelConfig.requirements_extraction`
  (`REQUIREMENTS_PROVIDER` / `REQUIREMENTS_MODEL`), with a Qwen fallback.
- Do not reintroduce a regex or `Set` wordlist for these flags, and do not push
  requirement semantics into `shared/taxonomy.ts`.
