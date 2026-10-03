# Supported provider completion (#144)

The owner narrowed #144 on 2026-10-03 to one successful completion per included
provider. Creative quality grading, an owner-reviewed task set, and repeated
model/variant runs are waived. Reports therefore say `quality: "not-evaluated"`.
This does not waive #143's actual HTTP clip, selected-frame, visible motion,
attachment, reopening/download and depth-picker workflow evidence.

## Recorded live result

All four included provider integrations completed once on 2026-10-03:
Replicate Wan through the real free HTTP intake and inline worker; Google Veo
through its production adapter; OpenAI text through `aiService`; and fal through
its production-resolved existing credential. The
[durable redacted report](../../scripts/ops/provider-quality/evidence/live-completion-2026-10-03.json)
records exact submitted parameters, artifacts/digests, elapsed time and the
controlled-persistence boundary. This is evidence from an uncommitted coordinated
working tree, not a claim of deployed or commit-level qualification.

Wan produced a fully decoded H.264 clip (624×624, 5.0625 seconds), attached to
the selected words-version, reopened through HTTP and downloaded with matching
bytes. The selected first frame was an explicitly controlled 512×512 PNG; its
owned bytes were verified at the provider transport. Google produced a fully
decoded H.264 1280×720 four-second clip. OpenAI returned nonempty JSON text on
one POST. fal produced a decoded 512×512 webp image. No image or clip was scored
for creative quality. Real browser motion/depth controls and deployed storage
qualification retain their separate scope.

The initial fal request incorrectly used a literal-template `FAL_KEY` rather
than the production resolver's existing `FAL_API_KEY`, and returned HTTP 401.
Its failure, reservation and dispatch remain intact. One root-authorized
credential-resolution correction ran in a separate attempt ledger and completed;
Wan, Google and OpenAI were not repeated. The total conservative reservation is
now **$1.89**, including both fal attempts, within the $2 run allocation and
shared $10 owner ceiling. Billing has not been reconciled to provider invoices.

## One live completion per included provider

The live runner uses existing credentials (including the canonical
`resolveFalApiKey` placeholder/alias handling) and an allocation from the owner's
shared $10 live-test ceiling. Its current plan reserves $1.87: fal $0.02,
Replicate $0.20, Google $1.60, and OpenAI text $0.05. No other script may treat
that ceiling as an independent $10 allowance.

```bash
LOG_LEVEL=fatal npx tsx scripts/ops/provider-quality/complete-live.ts --plan --ledger /tmp/vidra-live-completion-20261003 --allocation-cents 200
LOG_LEVEL=fatal npx tsx scripts/ops/provider-quality/complete-live.ts --run --ledger /tmp/vidra-live-completion-20261003 --allocation-cents 200
```

`--plan` writes the immutable allocation and prints safe credential-presence
metadata, exact bounded configurations and pricing sources. It sends no provider
request. `--run` spends money. Each provider receives at most one paid POST:
exclusive durable reservation and dispatch files are written before the network
call; SDK retries and off-plan requests are refused. Restarting reuses recorded
results, or reports an earlier ambiguous reservation without resubmitting.
Never remove these claims to obtain an automatic rerun. The allocation is
preserved even when a provider call fails, because an ambiguous request may
still have been billed.

| Provider  | Selected completion                                                                                      | Conservative reservation and source                                                                                                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fal       | Z-Image Turbo i2i, one 512×512 source, 8 steps, strength 0.6, webp                                       | $0.02: [official $0.005/MP rate](https://fal.ai/models/fal-ai/z-image/turbo/image-to-image), allowing one output up to 4 MP                                                                                                                   |
| Replicate | Wan 2.2 i2v fast, 81 frames, 16 fps, one source image                                                    | $0.20: the [official model page](https://replicate.com/wan-video/wan-2.2-i2v-fast) embeds current per-output tiers of $0.05/$0.11 for base 480p/720p and $0.065/$0.145 with interpolation. The test requests no interpolation                 |
| Google    | Veo 3.1 standard, 4 seconds, 720p, 16:9                                                                  | $1.60: [official standard video/audio price](https://ai.google.dev/gemini-api/docs/pricing#veo-3.1) $0.40/second; [Veo parameters](https://ai.google.dev/gemini-api/docs/veo) allow 4-second 720p output without reference/extension controls |
| OpenAI    | Configured `aiService` `studio_turn`, `gpt-5.6-luna`, at most 1024 output tokens and a short JSON prompt | $0.05: [official Luna price](https://developers.openai.com/api/docs/models/gpt-5.6-luna) $0.20/$1.20 per million input/output tokens. This proves text completion, not the retired Videos API                                                 |

The report and individual receipts are saved in the ledger directory. Downloaded
images are decoded; video outputs require an MP4 signature, valid ffprobe video
stream/duration and successful full ffmpeg decoding. Local output paths, byte
counts, SHA-256 digests, elapsed time, selected configuration and cost bounds
are recorded. No visual/creative scores are assigned. Credentials and headers
are excluded; media data URIs are represented by digests and signed query grants
are redacted. Reserved cost is a conservative ceiling, not a reconciled invoice.

The provider adapters and `aiService` remain the real ones. Wan additionally
uses the actual free HTTP intake, authoritative receipt, real
`VideoGenerationService`, inline worker and session attachment path. Only
Firestore/GCS boundary responses are controlled; the exact selected owned
source bytes are inlined at the Replicate transport because the remote provider
cannot fetch the fixture's `.invalid` host. Google uses local output storage as
an evidence sink. Neither establishes deployed GCS durability. A successful
SDK request alone does not establish browser behavior.

## Offline request conformance

```bash
LOG_LEVEL=error npx tsx scripts/ops/provider-quality/run.ts --report /tmp/vidra-provider-contracts.json
npx vitest run scripts/ops/provider-quality/__tests__ --config config/test/vitest.config.js
```

The existing offline matrix is deterministic request regression coverage, not
an expanded live-test requirement. Real production registries/adapters/SDKs
run against a transport that accepts fixture requests and refuses all other
outbound requests. Studio routing includes the actual `StudioService`, policy,
`AIModelService`, LLM client, OpenAI adapter and Replicate SDK over controlled
external responses. Auto generation, explicit generation/edit pins, and an
incapable pin's negotiation are exercised without paid calls. The sketch relay
uses an ephemeral local socket with controlled identity/persistence boundaries.

Video inventory derives from `VIDEO_MODEL_PROVIDERS` and the shared
`isReleaseGenerationModelSupported` predicate used by the product. Historical
excluded IDs are recorded as `not-run`, never submitted to providers or counted
as release-tested paths. Runway has no generation adapter. Studio inventory
comes from `offerableModels`; storage-gated entries are included only if offered.
The JSON records revision, working-tree status, actual submitted request bodies,
model/configuration and per-path assertions. Offline output bytes establish no
live availability, decoding or playback claim.

Exit 0 means offline assertions passed, with live completion still separate.
Exit 1 means a path's contract failed; invalid CLI arguments exit 2. A green
harness test suite proves reporting behavior, including refusals; it cannot
turn a provider failure into a passing completion.

The matrix includes all offerable studio generation/edit models and transform
utilities, both first-frame image adapters, supported Replicate video entries,
Veo and the fal relay. Studio aspect allowlists and fallback behavior are
covered. Video cases use representative square/landscape/portrait requests;
recorded parameters show what an adapter accepts or drops. This is independent
of the owner's one-completion live scope.

Per-model studio and current video polling budgets are recorded. The focused
suite drives a real processing studio prediction to its 60-second polling
deadline using controlled time. The Replicate video adapter currently supplies
no app-level deadline to `replicate.run`; its offline configuration records
`timeoutMs: null`. This is not qualification of hung provider creates/downloads
or a deployed workflow watchdog.

## Excluded and deferred generation models

Kling is excluded by the owner. Its historical IDs remain readable. The release
harness contains no Kling adapter import, request fixture or paid dispatch.

Sora 2 and the Videos API were
[shut down on September 24, 2026](https://developers.openai.com/api/docs/deprecations).
The [official Sora model page](https://developers.openai.com/api/docs/models/sora-2)
also records that the API is unavailable and has no one-to-one replacement.
Historical Sora IDs remain readable, while current generation and live testing
exclude them. An OpenAI text result must not be reported as Sora video proof.

Luma is deferred: canonical `luma-ray3` previously submitted `model: "ray-2"`
through the installed `lumaai` 1.18.2 client. The first offline matrix diagnosed
that mismatch; the release now records the exclusion and dispatches no Luma
request. The installed client targets the legacy Dream Machine endpoint and
its generation type supports Ray 1.6, Ray 2 and Ray Flash 2.

The official [migration guide](https://docs.agents.lumalabs.ai/guides/videos/migration/)
and [model guide](https://docs.agents.lumalabs.ai/guides/model/) require the
new Agents API, `ray-3.2`, `type: "video"`, `LUMA_AGENTS_API_KEY`, nested video
controls and `output[].url`. A model-string substitution on the old SDK is not
a coherent migration. [Ray 3.2 generation](https://docs.agents.lumalabs.ai/guides/videos/generation/)
accepts 5/10-second clips; start/end anchors require 5 seconds. Its current
[720p SDR price](https://docs.agents.lumalabs.ai/guides/pricing/) is $0.30 for
5 seconds and $0.90 for 10 seconds, so existing 4/8-second capabilities and
linear internal credits do not establish its request/cost contract. Future
migration must update credentials, validation, capabilities, pricing,
polling/output parsing and live qualification together.

## Historical optional creative tooling

`creative-tasks.json`, `owner-review.pending.json`, `review.ts` and
`check-review.ts` remain optional historical tools. They are not current release
gates and no owner review is required by the narrowed #144 scope. The pending
template contains no owner-approved evidence and intentionally fails that
optional schema. If explicitly used later, the checker validates recorded
completeness only; it cannot authenticate a reviewer or establish live output
quality from fixture bytes.

This work does not revive frozen analytics or modify Groq golden-set baselines
(#106). Production release verification (#145) and the all-shells walkthrough
(#65) retain their separate scope.
