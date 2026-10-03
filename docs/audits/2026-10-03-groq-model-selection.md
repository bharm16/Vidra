# Groq model selection (#106): retired fast default repaired

**Current status:** The owner narrowed acceptance to provider completion and
waived quality grading for the current free-validation phase. The retired
general Groq default is replaced with `openai/gpt-oss-20b`, verified by the
authenticated model list and one successful real `aiService` completion.
The working Qwen 3.6 default remains unchanged. No candidate was quality-blessed
and no golden-set baseline was edited; the failed benchmarks below remain
historical evidence rather than a claimed passing gate.

## Functional default repair after the owner's scope change

An authenticated `GET /openai/v1/models` on 2026-10-03 returned 200 and included
GPT-OSS 20B/120B, Qwen 3.8 and Qwen 3.6. Llama 3.1 8B was absent for this account.
Groq's [model catalogue](https://console.groq.com/docs/models) lists the two
retired Llama models as enterprise offerings. Its
[deprecation notice](https://console.groq.com/docs/deprecations) records the
free/developer-tier retirement and recommends GPT-OSS 20B for Llama 3.1 8B.
Qwen 3.6 remains in this account's authenticated list; its adapter and default
were preserved rather than using this repair as a general model upgrade.

A pure `DEFAULT_GROQ_MODEL` is consumed by the general adapter, env-schema
fallback, DI configuration, automatic router fallback, key verifier and current
synthetic/golden-set CLI defaults. Dormant evaluation scripts receive only the
same pure default replacement; no frozen analytics were enabled or executed.
The tracked nonsecret `.env.example` also names the current Groq default.
The one explicitly retired, nonsecret
`GROQ_MODEL` setting in the local ignored `.env` was updated; credentials were
not read into output, changed or replaced. Other explicit model selections stay
explicit. The default capability entry records Groq's documented low reasoning
and strict schema support and omits unsupported logprobs.

One real Groq completion through `AIModelService` + `LLMClient` + the actual
Groq adapter completed in **373 ms**, with exactly one POST, 1024 maximum output
tokens, low reasoning effort and a small strict JSON response schema. No retries,
per-model repeat runs, creative scoring or golden-set grading were performed.
The [GPT-OSS 20B rate](https://console.groq.com/docs/model/openai/gpt-oss-20b)
is $0.075/$0.30 per million input/output tokens; the root reserved a conservative
$0.10 for this request. The shared live-test conservative reservation is now
$1.99 including the earlier provider completions, below the owner's shared $10
ceiling. These are reserved bounds, not reconciled provider invoices.

The durable request/result is recorded at
`/tmp/vidra-live-completion-20261003/groq-default-completion/`; it is local
functional evidence from the coordinated working tree, not deployed or
commit-level qualification. Transport regression tests also drive
`model_not_found` through the real router: one nonretryable 404 is surfaced to
the caller, and a later successful request still works. No API process exit,
global adapter disablement, broad 404 retry or fabricated fallback success is
introduced. Root-owned browser, bootstrap and DI gates remain separate.

## Original golden-path native functional verification

The original `tests/e2e/golden-path.spec.ts` was run unchanged against isolated
Vite/API ports 58107/58106, real provider calls and real Firestore/GCS. Its three
Tier 1 cases passed: guest sign-in gating and prompt preservation (6.710 s),
expansion into a session with refresh/Library restoration (14.000 s), and live
span labeling with click-to-enhance/apply (27.123 s). Tier 2 frame/render tests
were not selected and no quality scores or baseline evaluations were run.
The [redacted durable evidence](2026-10-03-original-golden-native.json) includes
the unchanged spec digest, exact outcomes, models/token bounds, cost reservation
and preserved setup failures.

The declared authentication seam was the existing mock auth repository plus a
temporary Vite proxy's synthetic API-key header, with matching fresh test UID
`api-key:vidra-golden-local-test`; the server authentication middleware remained
real. Request bodies and provider responses were not rewritten or mocked.
Only the test helper's default UID became configurable with `E2E_USER_UID`.
The client intentionally ignores `VITE_API_KEY` and uses a hardcoded development
fallback, so the first native attempt's 403s were retained before correcting
the temporary auth transport. The original spec was not weakened to pass.

The native process explicitly selected Qwen 3.8 instead of permanently
configured Qwen 3.6 because Qwen 3.8 has a known public price. This does not
qualify Qwen 3.6 output or change its permanent default. A provider-fetch preload
reserved each actual POST before dispatch using raw JSON UTF-8 bytes as an input
token upper bound, the declared native output cap, model-specific verified rates
and threefold headroom. Unknown costs were refused. The ledger recorded 31 POSTs,
including startup health checks, SDK retries and fallbacks, at a conservative
reservation of **$2.9591648** within the allocated $3. This includes the UI's two
automatic Schnell picture requests even though the optional Tier 2 tests were
not selected. Twelve OpenAI 429s remain
recorded and counted; the application recovered and the functional cases passed.
There were no unknown-cost or over-cap refusals. Including the preceding provider
completion reservations, the cumulative bound is **$4.9491648**, below the shared
$10 owner ceiling; provider invoices were not reconciled.

`NODE_ENV=test` and existing worker/sweeper/reconciliation/retention/repair kill
switches kept shared-project background writers off. Only the isolated servers
were stopped afterward. Existing user ports, shared jobs and persisted test data
were not deleted or cleaned up. Bootstrap/DI and full repository gates remain
root-owned integration evidence.

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

## Historical recorded candidate runs before the scope change

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

## Historical quality acceptance, superseded for the current free phase

The original quality-gated review found that Qwen's aggregate F1 being close to the baseline did not make its taxonomy and
category regressions disappear. That review required explaining the discrepancies
and passing the agreed gate before blessing a replacement. Those measurements
and failures remain valid and were not reclassified as passes. The owner's
later direction, “just test that each provider can successfully complete once,”
supersedes that quality acceptance for the current free-validation phase.
The functional replacement above establishes request completion only.

The retired fast adapter/env/routing/current CLI defaults and fixtures are now
consistent. Frozen standalone evaluation scripts remain historical tooling with
their pure fallback constants corrected; this work neither runs nor revives
them. The separate coalescing crash was fixed
in #107; this repair does not reclassify or retry every permanent provider error.
