# Groq model selection (#106): replacement still blocked by quality

**Status:** Evaluation routing corrected; no replacement blessed and no
production model default changed.

## Availability

On 2026-10-03 the authenticated Groq `/openai/v1/models` endpoint returned 200.
The available text-model ids included `openai/gpt-oss-20b`,
`openai/gpt-oss-120b`, `qwen/qwen3.8-27b` and `qwen/qwen3.6-27b`.
`llama-3.1-8b-instant` was absent. No model ids were inferred from their spelling.

Groq's [deprecation notice](https://console.groq.com/docs/deprecations)
recommends GPT-OSS 20B for the retired 8B Llama and documents Qwen 3.8 as the
successor to Qwen 3.6. The live list, not a possibly stale catalogue, determined
which candidates were exercised for this account.

## The old evaluation could measure the wrong provider

`ModelConfig` snapshots the environment at module import. The golden-set CLI
loaded dotenv and applied `--provider` afterwards, which did not change the
router's imported operation configuration. A run labeled Groq was observed
executing `gpt-4o-mini-2024-07-18` on OpenAI; it was stopped and its results were
excluded. The generic OpenAI adapter also requested unsupported logprobs on
Groq candidates.

The corrected harness pins `span_labeling` to the selected provider/model,
constructs only that provider's actual adapter, sets `strictClient`, and refuses
missing credentials instead of substituting another provider. The result JSON
now records the model as well as the provider. Transport-boundary regression
tests cover the chosen endpoint/model and a permanent 404 without retries or
fallback.

## Recorded candidate runs

All completed runs used the existing 67 golden prompts, concurrency 2, the
production `AIModelService` and Groq adapter, with no baseline edits. GPT-OSS
requests used low reasoning effort and strict JSON schema; Qwen 3.8 used strict
schema with its default reasoning mode. Known unsupported logprobs were omitted.

| Candidate                      | Errors | Relaxed F1 | Taxonomy accuracy | Existing gate                                                            |
| ------------------------------ | ------ | ---------- | ----------------- | ------------------------------------------------------------------------ |
| GPT-OSS 20B                    | 0/67   | 0.690      | 0.842             | Failed: overall F1, taxonomy, four categories                            |
| GPT-OSS 120B                   | 0/67   | 0.699      | 0.852             | Failed: overall F1, taxonomy and categories                              |
| Qwen 3.8 27B                   | 0/67   | 0.725      | 0.863             | Failed: taxonomy, action.movement, environment.weather, subject.wardrobe |
| Existing blessed Groq baseline | —      | 0.728      | 0.911             | Comparator, not a current live run                                       |

An earlier GPT-OSS 20B run using inherited medium reasoning and best-effort
schema failed 27/67 requests with JSON-validation errors. It was rejected before
scoring. Model-specific capability entries now use Groq's documented
[reasoning levels](https://console.groq.com/docs/reasoning) and
[strict schema support](https://console.groq.com/docs/structured-outputs).

The tracked `golden-set-results-latest.json` contains the final Qwen run's full
per-prompt evidence. Local failure logs were retained under `/tmp/vidra-groq-*`;
these are diagnostic artifacts, not durable release evidence.

## Remaining acceptance

Qwen's aggregate F1 being close to the baseline does not make its taxonomy and
category regressions disappear. Do not bless this result or switch defaults
until the discrepancies have been explained and an acceptable replacement
passes the agreed gate. That includes checking current labeling behavior versus
the older baseline, not just changing model strings.

Once a candidate qualifies, audit and replace the adapter/env/routing/evaluation/
synthetic/key-verification defaults and fixtures together. Explicitly configured
models must remain explicit; do not silently rewrite the local `.env` or a
caller's selected id. A normal-run absence of `model_not_found` is still owed.
The separate coalescing crash was fixed in #107; this work does not reclassify or
retry every permanent provider error.
