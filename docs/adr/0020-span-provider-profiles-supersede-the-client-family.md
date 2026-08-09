# Span provider identity is one profile per provider, not a class family plus a capability matrix

**Status:** accepted — supersedes [ADR-0001](0001-span-labeling-extraction-strategy.md)

ADR-0001 kept the `ILlmClient` family (`GroqLlmClient` / `OpenAILlmClient` /
`GeminiLlmClient` / `RobustLlmClient` behind `LlmClientFactory`) and deferred
collapsing it. That deferral is withdrawn. The owner accepted the collapse on
2026-08-08, along with its stated cost: this is a wire-affecting change that
re-records the label-spans cassette pack and re-blesses the per-provider
golden-set baselines.

## Why the deferral no longer holds

ADR-0001's three reasons were sound, and two of them are now addressed by the
design rather than by keeping the classes:

- **"Per-subclass request flags are deliberate overrides, not redundant
  duplicates."** Correct, and preserved. `OpenAILlmClient`'s
  `enableLogprobs: false` — set even though OpenAI's capability row says
  `logprobs: true` — is carried verbatim as `requestOptions.enableLogprobs`
  on the OpenAI profile. It is now a declared value with a comment rather
  than an override whose significance depends on reading two files.
- **"'Changes to Groq must not affect OpenAI behavior' is enforced by the
  class-per-provider structure."** It is now enforced by the profile table:
  each provider's prompt, schema and request options live in its own entry,
  and no control flow reads another provider's entry. The constraint is
  better served by data than by inheritance, because the base class was
  itself shared mutable surface.
- **"Span labeling is eval-gated; any change to request flags forces a
  live-provider re-bless."** Still true. That cost is accepted rather than
  avoided, and the procedure is recorded below.

The reason to act now is that provider identity had leaked into six places
per provider — the `ProviderType` union, a ten-boolean `PROVIDER_CAPABILITIES`
row, a bespoke schema/prompt module, an if-chain in the schema factory, a
client subclass, and an adapter registration. Adding a provider meant editing
all six with nothing checking they agreed, and getting the capability row
wrong changed prompt text silently.

## Decision

One `SpanProviderProfile` per provider, held in a single registry. A profile
declares everything provider-specific: the prompt arm, the JSON schema (or
none), the request options, validation relaxations, and — because Gemini's
NDJSON handling is genuine behaviour rather than configuration — optional
`parseResponseText` / `normalizeParsedResponse` / `postProcess` hooks. The
four client classes collapse into one `SpanLabelingClient` that takes a
profile. Composition replaces inheritance; the hooks that were `protected`
methods become profile members.

Provider identity is supplied by `aiService.resolveExecution()` and is never
re-derived. `ProviderDetector.detectProvider` — which classified providers by
substring on model names (`includes("gpt")`, `includes("llama")`,
`includes("claude")`) — is deleted. That cascade could not see client
availability or circuit state, so it could disagree with the router, and an
unrecognised model id fell to an `"unknown"` row that silently produced
Groq-shaped prompts. It also violated the project rule against substring and
wordlist classification.

## Preserved accidents

These are behaviours the old code produced incidentally. They are preserved
deliberately, as data, so the re-bless measures the refactor and not a
smuggled behaviour change:

- **OpenAI requests no logprobs** despite being capable of them (above).
- **The generic/unknown arm sends the Gemini JSON schema with the Groq
  prompt.** `RobustLlmClient._getProviderName()` returned `"unknown"`, which
  matched no client substring, so detection fell through to
  `ModelConfig["span_labeling"].client` (default `gemini`) and produced
  `strictJsonSchema: true` — while `buildSystemPrompt` took its `else` arm and
  produced `getGroqSystemPrompt(true)`. The generic profile encodes that pair
  explicitly. It is almost certainly not what anyone intended; changing it is
  a separate, separately-measured decision.
- **`supportsSchema` is `strictJsonSchema || provider === "groq" || provider
=== "qwen"`.** Each profile states its own `jsonSchema` so this expression
  disappears, but every profile reproduces the same answer it produced before.

## Consequences

- **Potentially wire-affecting — measured, and it did not move.** The cassette
  key hashes the system prompt (`requestKey.ts` — "operation + prompts"), and
  `getGroqSystemPrompt` returns materially different text per `useJsonSchema`
  branch, so this change was treated as wire-affecting up front.
  `scripts/evaluation/snapshot-span-wire-surface.ts` hashes every system
  prompt (6 providers × streaming × useJsonSchema × 4 template versions = 96
  combinations), the few-shot block, and the schema each provider sends. It
  was captured before the collapse and re-captured after: **byte-identical**,
  for all six routed providers.

  So no re-record and no re-bless were required. `label-spans/golden-path.json`
  and both `golden-set-baselines/{groq,openai}.json` remain valid. Keep the
  snapshot script — it is the standing regression oracle for this surface.

- **Re-bless procedure, if a future change does move the wire.** Re-record with
  `scripts/replay/record-golden-scenarios.ts`, then re-bless per provider with
  `npm run eval:golden-set:bless` against live Groq and OpenAI, then confirm
  `npm run test:replay` and `npm run eval:golden-set` are green. Baselines
  live in `scripts/evaluation/golden-set-baselines/{provider}.json`.

- **One correction to the "preserved accidents" note above.** The Anthropic
  capability row (`strictJsonSchema: false` → the Groq schema) was never
  reachable from span labeling: `createLlmClient("anthropic")` returned the
  generic client, whose `_getProviderName()` was `"unknown"`, so the Gemini
  fallthrough applied instead. Mapping the generic profile to the Anthropic
  row would have been a real wire change disguised as preservation. The
  snapshot caught it.
- **`SPAN_PROVIDER` still has two readers** — the profile lookup and
  `ModelConfig["span_labeling"].client` — and they must stay in agreement.
  ADR-0001's hazard note survives this change.
- The `*LlmClient` / `LlmClientFactory` names, which ADR-0001 called "the only
  smell" because they imply a second routing layer, are gone. Every wire call
  still goes through `aiService`; the family was never a router and the new
  names no longer suggest one.
