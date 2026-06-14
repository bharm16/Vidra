# LLM adapter retry loops are intentionally per-provider, not a shared orchestrator

**Status:** accepted

`OpenAICompatibleAdapter`, `GroqLlamaAdapter`, and `GroqQwenAdapter` each carry a
`complete()` method whose retry/validation loop looks nearly identical
(`server/src/clients/adapters/*.ts`): the same `maxRetries`/`shouldRetry`
defaults, the same `while (attempt <= maxRetries)` skeleton, the same
`validateLLMResponse` call gated on `jsonMode || schema || responseFormat`, and
the same `APIError.isRetryable` + `Math.pow(2, attempt) * 500` backoff. At a
glance this reads as ~3× duplication, and an architecture review will recur to
the suggestion: "extract a `BaseAdapterRetryOrchestrator` and have the adapters
override only the inner request." We considered that extraction and are
**keeping the loops per-adapter**.

The similarity is incidental, not a missing seam. The loops diverge in ways that
are exactly the per-provider behavior a shared orchestrator would have to
re-expose as parameters:

- **Three independent options types.** `CompletionOptions`
  (`adapters/openai/types.ts`), `LlamaCompletionOptions`, and
  `QwenCompletionOptions` are declared separately with no shared base. A shared
  loop would need a generic constraint or a new shared base interface — a
  contract change touching all three.
- **The inner call signature differs.** `GroqLlamaAdapter` passes `attempt` into
  `_executeRequest(systemPrompt, options, attempt)` for per-attempt request
  shaping; OpenAI and Qwen call `_executeRequest(systemPrompt, options)`.
- **Observability differs per provider.** The startup debug log fields differ
  (Qwen logs `reasoningEffort`, the others log `attempt`), and the
  validation-failure / API-error messages name their provider
  ("OpenAI/Groq/Qwen response validation failed").
- **The execution path carries regression-tested quirks.**
  `OpenAICompatibleAdapter.logprobsRetry.regression.test.ts` and
  `OpenAICompatibleAdapter.maxCompletionTokens.regression.test.ts` pin
  hard-won, provider-specific behavior inside that loop's neighborhood.

The genuinely shared logic is **already** behind a seam: response validation
lives in `adapters/ResponseValidator.ts` (`validateLLMResponse`), reused by all
three adapters. What remains "duplicated" is the loop skeleton — and that is
where the divergence lives.

## Considered and deferred

Extracting `executeWithValidationRetry(execute, options, { providerLabel, … })`
is plausible but **declined**. To absorb the divergences it would need a generic
options type, an optional-`attempt` execute callback, parameterized log
messages, and per-provider debug fields — an interface nearly as wide as the
loop it replaces (a **shallow** abstraction), while **coupling** three
providers' reliability behavior into one place where a tweak for one provider
risks the others. The deletion test does not favor it: deleting per-adapter
loops would not remove complexity, only relocate it behind a wide parameter
list.

## Consequences / things to know

- Each adapter owns its full provider interaction — request shaping, retry,
  validation handoff, and logging — as one cohesive unit. That is the intended
  shape.
- The shared, deduplication-worthy part (response validation) is in
  `ResponseValidator`; new shared validation belongs there, not in a retry base
  class.
- Do **not** re-flag the three retry loops as "duplicated, extract a base class"
  without first reconciling the three options types and confirming no
  per-provider quirk (logprobs, `max_completion_tokens`, sandwich/`attempt`
  shaping, `reasoningEffort`) is flattened. If those quirks ever converge and the
  options types unify, re-evaluate.
