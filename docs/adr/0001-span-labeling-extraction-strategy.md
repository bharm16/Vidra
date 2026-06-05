# Span labeling's `ILlmClient` family is an internal extraction strategy, not a second routing layer

**Status:** accepted

Span labeling has its own client family — `LlmClientFactory` plus
`GroqLlmClient` / `OpenAILlmClient` / `GeminiLlmClient` / `RobustLlmClient`
behind an `ILlmClient` interface, with a `resolveProvider` priority ladder
(`server/src/llm/span-labeling/services/`). At a glance this looks like a
**second LLM routing layer**, which would contradict the project rule that
"`aiService` is the only LLM routing layer" (root `CLAUDE.md` → Dependency
Rules; `server/CLAUDE.md` → LLM Access). It is **not** one, and we are keeping
it as-is. Every wire call the family makes goes **through** `aiService`
(`callModel` → `aiService.execute("span_labeling", …)`;
`GeminiLlmClient.streamSpans` → `aiService.stream("span_labeling_gemini", …)`).
The provider/model is still chosen by `aiService` from
`ModelConfig["span_labeling"]`. The family is an **internal span-extraction
strategy that composes `aiService`**, existing for span-domain behavior that
the generic `aiService` interface cannot express: the validate → repair →
two-pass extraction loop, few-shot span prompt/schema assembly, the Groq
logprobs-confidence capping, and Gemini's NDJSON per-span streaming
(`aiService.stream` yields full text, not parsed span objects).

## Considered and deferred

Collapsing the family into a single strategy concept (rename
`ILlmClient → SpanExtractionStrategy`, drop the `resolveProvider` ladder's
provider-steering role) is plausible future work but **deferred**. Reasons:

- Span labeling is **eval-gated**. `labelSpans()` is measured nightly against
  per-provider blessed baselines (`golden-set-baselines/{groq,openai}.json`)
  via a deterministic relaxed-F1 gate. Any change to request flags perturbs
  token-level output and forces a live-provider re-bless.
- The per-subclass request flags are **deliberate overrides**, not redundant
  duplicates. In particular `OpenAILlmClient` sets `enableLogprobs: false`
  even though OpenAI's capability is `logprobs: true`; deleting the preset
  would silently start requesting logprobs (and exercise the adapter's
  logprobs-rejection retry) — a behavior change requiring re-bless.
- The file-header constraint "changes to Groq must not affect OpenAI behavior"
  is currently enforced by the class-per-provider structure.

## Consequences / things to know

- The family is literal-compliant with the routing rule (it never calls a
  provider client directly; it always goes through `aiService`). The
  router-implying names (`*LlmClient`, `LlmClientFactory`) are the only smell.
- `SPAN_PROVIDER` is read in **two places** — `LlmClientFactory.resolveProvider`
  and `ModelConfig["span_labeling"].client` — which must stay in agreement.
  The golden-set eval driver documents this hazard. In the live default path
  the factory reconciles via the resolved model, but the eval harness sets
  both explicitly.
- If the rename/collapse is ever pursued, treat it as a wire-affecting change:
  re-bless the per-provider baselines and preserve the OpenAI logprobs override.
